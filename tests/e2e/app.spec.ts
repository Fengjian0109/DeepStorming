import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'

const sandboxArgs = (): string[] => {
  const args: string[] = []
  if (typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox')
  if (process.platform === 'linux' && !process.env['DISPLAY']) {
    args.push('--headless', '--ozone-platform=headless', '--disable-gpu', '--disable-dev-shm-usage')
  }
  return args
}

const launchEnvironment = (runtimeDirectory: string): NodeJS.ProcessEnv => {
  mkdirSync(runtimeDirectory, { recursive: true })
  const env = { ...process.env, DEEPSTORMING_USER_DATA_DIR: runtimeDirectory }
  if (process.platform === 'linux' && !process.env['DISPLAY']) {
    env['XDG_CACHE_HOME'] = path.join(runtimeDirectory, 'cache')
    env['XDG_CONFIG_HOME'] = path.join(runtimeDirectory, 'config')
    env['XDG_DATA_HOME'] = path.join(runtimeDirectory, 'data')
  }
  return env
}

const launchDevApp = async (userDataDir: string): Promise<ElectronApplication> =>
  electron.launch({
    args: [...sandboxArgs(), path.join(process.cwd(), 'apps/desktop/out/main/index.js')],
    env: launchEnvironment(path.join(userDataDir, 'runtime')),
  })

const pdfStringWith = (text: string): string => {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += object
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return pdf
}

const openSettings = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.getByRole('heading', { name: 'AI Provider' })).toBeVisible()
}

const createAndActivateMockProvider = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: '新增 Provider' }).click()
  await page.getByLabel('Provider 类型').selectOption('mock')
  await page.getByLabel('显示名称').fill('Offline Tutor')
  await page.getByLabel('模型名称').fill('mock-success')
  await page.getByRole('button', { name: '添加 Provider' }).click()
  await page.getByRole('button', { name: '打开 Offline Tutor' }).click()
  await page.getByRole('button', { name: '设为启用' }).click()
  await expect(page.getByText('Provider 已启用。')).toBeVisible()
}

test('boots securely and covers the mock provider lifecycle from Settings', async () => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'deepstorming-e2e-user-'))
  const app = await launchDevApp(userDataDir)
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '文档库' })).toBeVisible()
    await expect(page.getByTestId('app-version')).toContainText('v0.0.0')
    await page.setViewportSize({ width: 800, height: 720 })
    await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible()
    await openSettings(page)
    await expect(page.getByText('还没有 Provider')).toBeVisible()

    const preferences = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      if (!window) throw new Error('DeepStorming window was not created')
      const current = window.webContents.getLastWebPreferences()
      return {
        contextIsolation: current.contextIsolation,
        nodeIntegration: current.nodeIntegration,
        sandbox: current.sandbox,
      }
    })
    expect(preferences).toEqual({ contextIsolation: true, nodeIntegration: false, sandbox: true })

    await createAndActivateMockProvider(page)
    await page.getByRole('button', { name: '测试连接' }).click()
    await expect(page.getByText('Provider 测试成功。')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('covers the chat-first document and classroom journey', async () => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'deepstorming-chat-e2e-user-'))
  const pdfPath = path.join(userDataDir, 'evidence.pdf')
  const pdfText = 'Evidence connects a claim to observable behavior'
  const hiddenTail = 'FULL_BODY_SHOULD_REQUIRE_READER'
  const longBody = `${'学习证据与解释。'.repeat(80)}${hiddenTail}`
  writeFileSync(pdfPath, pdfStringWith(pdfText), 'utf8')

  const app = await launchDevApp(userDataDir)
  try {
    const page = await app.firstWindow()
    await expect(page.getByTestId('app-version')).toBeVisible()
    await openSettings(page)
    await createAndActivateMockProvider(page)
    await page.getByRole('button', { name: '文档库' }).click()
    await expect(page.getByRole('toolbar', { name: '添加学习资料' })).toBeVisible()
    await expect(page.getByRole('button', { name: '导入 PDF', exact: true })).toBeVisible()

    await page.getByRole('button', { name: '粘贴文本 / 导入 TXT、MD' }).click()
    await page.getByLabel('标题').fill('Chat First Notes')
    await page.getByLabel('正文').fill(longBody)
    await page.getByRole('button', { name: '保存文档' }).click()
    await expect(page.getByRole('heading', { name: 'Chat First Notes' })).toBeVisible()
    await expect(page.getByText(hiddenTail, { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: '打开阅读器' }).click()
    await expect(page.getByText(hiddenTail, { exact: false })).toBeVisible()
    await page.getByRole('button', { name: '关闭阅读器' }).click()
    await expect(page.getByText(hiddenTail, { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: '开始课堂' }).click()
    await expect(page.getByRole('dialog', { name: '课堂准备' })).toBeVisible()
    await page.getByRole('button', { name: '进入课堂' }).click()
    await expect(page.getByRole('region', { name: '课堂对话' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Chat First Notes 课堂 · 进行中/ })).toBeVisible()
    await page.getByLabel('你的回答').fill('我会用证据解释并检验这个判断。')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('回答已提交。')).toBeVisible()
    await expect(page.getByText('我会用证据解释并检验这个判断。', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: '课堂信息' }).click()
    await expect(page.getByRole('dialog', { name: '课堂信息' })).toBeVisible()
    await expect(
      page
        .getByRole('region', { name: '来源证据' })
        .getByText(longBody.slice(0, 280), { exact: false }),
    ).toBeVisible()
    await page.getByRole('tab', { name: '技术' }).click()
    await expect(page.getByText(/lesson\..* v\d+/).first()).toBeVisible()
    await page.getByRole('button', { name: '关闭课堂信息' }).click()

    await page.getByRole('button', { name: '文档库' }).click()
    await page.getByLabel('导入 PDF 文件输入').setInputFiles(pdfPath)
    await expect(page.getByText('PDF 已导入。')).toBeVisible()
    await page.getByRole('button', { name: '打开阅读器' }).click()
    await expect(page.getByText(`Block 1 · ${pdfText}`)).toBeVisible()
    await page.getByRole('button', { name: '选择 Block 1' }).click()
    await page.getByRole('button', { name: '用此 block 开始课堂' }).click()
    await expect(page.getByRole('dialog', { name: '课堂准备' })).toBeVisible()
    await page.getByRole('button', { name: '进入课堂' }).click()
    await page.getByRole('button', { name: '课堂信息' }).click()
    await expect(page.getByText('第 1 页 · Block 1')).toBeVisible()
    await page.getByRole('button', { name: '回到证据' }).click()
    await expect(page.getByRole('heading', { name: 'evidence' })).toBeVisible()
    await expect(page.locator('.pdf-block-active')).toBeVisible()

    await page.getByRole('button', { name: '收起副侧栏' }).click()
    await expect(page.getByRole('complementary', { name: '文档导航' })).toHaveCount(0)
    await page.getByRole('button', { name: '文档库' }).click()
    await expect(page.getByRole('complementary', { name: '文档导航' })).toBeVisible()
    const contextualSeparator = page.getByRole('separator', { name: '调整副侧栏宽度' })
    for (let index = 0; index < 40; index += 1) await contextualSeparator.press('ArrowRight')
    const resized = await contextualSeparator.boundingBox()
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    if (!resized) throw new Error('Workspace separator bounds are unavailable')
    expect(resized.x + resized.width).toBeLessThanOrEqual(viewportWidth / 2 + 8)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('covers parent-child sidebars, long tutor settings, and appearance', async () => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'deepstorming-gui-e2e-user-'))
  const app = await launchDevApp(userDataDir)
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('complementary', { name: '设置分类' })).toHaveCount(0)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await expect(page.getByRole('complementary', { name: '设置分类' })).toBeVisible()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await expect(page.getByRole('complementary', { name: '设置分类' })).toHaveCount(0)
    await page.getByRole('button', { name: '设置', exact: true }).click()

    await page.getByRole('button', { name: '导师 / 伙伴' }).click()
    await page.getByRole('button', { name: '编辑 苏格拉底导师' }).click()
    await expect(page.getByLabel('论文教学策略')).toBeVisible()
    await page.getByTestId('settings-detail-scroll').evaluate((node) => {
      node.scrollTop = node.scrollHeight
    })
    await expect(page.getByLabel('自定义要求')).toBeVisible()

    await page.getByRole('button', { name: '外观' }).click()
    await page.getByLabel('深色').check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.getByRole('button', { name: '收起主侧栏' }).click()
    await expect(page.getByRole('complementary', { name: '设置分类' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '展开主侧栏' })).toBeVisible()
    await expect(page.getByRole('button', { name: '收起全部侧栏' })).toHaveCount(0)
    await expect(
      page.locator('.workspace-primary').getByRole('button', { name: '收起主侧栏' }),
    ).toHaveCount(0)
    await expect(
      page.locator('.workspace-contextual').getByRole('button', { name: '收起副侧栏' }),
    ).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
