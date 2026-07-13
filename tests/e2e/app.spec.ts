import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

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

const clearPersistedContextChunks = (userDataDir: string): void => {
  execFileSync('/opt/miniconda3/bin/sqlite3', [
    path.join(userDataDir, 'runtime', 'deepstorming.sqlite3'),
    'DELETE FROM document_chunks;',
  ])
}

const seedFollowUpContextChunks = (userDataDir: string): void => {
  execFileSync('/opt/miniconda3/bin/sqlite3', [
    path.join(userDataDir, 'runtime', 'deepstorming.sqlite3'),
    `UPDATE lesson_model_runs
     SET input_summary_json = json_set(
       input_summary_json,
       '$.contextCharacterCount', 48,
       '$.contextChunks', json('[{"chunkId":"00000000-0000-4000-8000-000000000981","pageNumberStart":1,"pageNumberEnd":1,"charCount":48}]')
     )
     WHERE operation = 'lesson_tutor_follow_up';`,
  ])
}

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
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (const offset of offsets.slice(1)) pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return pdf
}

const createMockProvider = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
  displayName: string,
  modelName: string,
): Promise<void> => {
  await page.getByLabel('Provider 类型').selectOption('mock')
  await page.getByLabel('显示名称').fill(displayName)
  await page.getByLabel('模型名称').fill(modelName)
  await page.getByRole('button', { name: '添加 Provider' }).click()
  await expect(page.getByText('Provider 已添加。')).toBeVisible()
  await expect(page.getByText(displayName)).toBeVisible()
}

const openProviderPage = async (
  page: Awaited<ReturnType<ElectronApplication['firstWindow']>>,
): Promise<void> => {
  await page.getByRole('button', { name: 'Provider' }).click()
  await expect(page.getByRole('heading', { name: 'Provider 管理' })).toBeVisible()
}

test('boots securely and covers the mock provider lifecycle', async () => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'deepstorming-e2e-user-'))
  const app = await launchDevApp(userDataDir)

  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '文档库' })).toBeVisible()
    await expect(page.getByTestId('app-version')).toContainText('v0.0.0')
    await openProviderPage(page)
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
    expect(preferences).toEqual({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    })

    await createMockProvider(page, 'Offline Tutor', 'mock-success')

    await page.getByRole('button', { name: '设为启用 Offline Tutor' }).click()
    await expect(page.getByText('Provider 已启用。')).toBeVisible()
    await expect(page.getByText('启用中')).toBeVisible()

    await page.getByRole('button', { name: '测试 Offline Tutor' }).click()
    await expect(page.getByText('Provider 测试成功。')).toBeVisible()

    await page.getByRole('button', { name: '编辑 Offline Tutor' }).click()
    await expect(page.getByLabel('API Key（留空则保留原密钥）')).toBeVisible()
    await page.getByRole('button', { name: '保存更改' }).click()
    await expect(page.getByText('Provider 已更新。')).toBeVisible()

    await createMockProvider(page, 'Slow Mock', 'mock-delay')
    await page.getByRole('button', { name: '测试 Slow Mock' }).click()
    await expect(page.getByText('正在测试 Slow Mock…')).toBeVisible()
    await page.getByRole('button', { name: '取消测试' }).click()
    await expect(page.getByText('测试已取消。')).toBeVisible()

    for (const name of ['Offline Tutor', 'Slow Mock']) {
      await page.getByRole('button', { name: `删除 ${name}` }).click()
      await expect(page.getByRole('dialog', { name: '确认删除 Provider' })).toBeVisible()
      await page.getByRole('button', { name: '确认删除' }).click()
      await expect(page.getByText('Provider 已删除。')).toBeVisible()
    }
    await expect(page.getByText('还没有 Provider')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('creates text documents and persists them across restart', async () => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'deepstorming-doc-e2e-user-'))
  const pdfFixturePath = path.join(userDataDir, 'evidence.pdf')
  const pdfFixtureText = 'Evidence connects a claim to observable behavior'
  writeFileSync(pdfFixturePath, pdfStringWith(pdfFixtureText), 'utf8')

  try {
    const first = await launchDevApp(userDataDir)
    try {
      const page = await first.firstWindow()
      await expect(page.getByRole('heading', { name: '文档库' })).toBeVisible()
      await expect(page.getByText('还没有文档')).toBeVisible()

      await page.getByRole('button', { name: '粘贴文本' }).click()
      await page.getByLabel('标题').fill('Socratic Notes')
      await page.getByLabel('正文').fill('Understanding needs retrieval and explanation.')
      await page.getByRole('button', { name: '保存文档' }).click()
      await expect(page.getByText('文档已创建。')).toBeVisible()
      await expect(
        page.locator('.document-detail').getByRole('heading', { name: 'Socratic Notes' }),
      ).toBeVisible()

      await page.getByLabel('导入 .txt 或 .md').setInputFiles({
        name: 'paper.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from('# Paper Map\nWhy What How Evidence Limits Next', 'utf8'),
      })
      await page.getByRole('button', { name: '保存文档' }).click()
      await expect(
        page.locator('.document-detail').getByRole('heading', { name: 'paper.md' }),
      ).toBeVisible()

      await page.getByLabel('导入 PDF').setInputFiles(pdfFixturePath)
      await expect(page.getByText('PDF 已导入。')).toBeVisible()
      await expect(
        page.locator('.document-detail').getByRole('heading', { name: 'evidence' }),
      ).toBeVisible()
      await expect(page.locator('.document-detail .document-body')).toContainText(pdfFixtureText)
      await expect(page.getByText('PDF 页面 1')).toBeVisible()
      await expect(page.getByText(`Block 1 · ${pdfFixtureText}`)).toBeVisible()
      await page.getByRole('button', { name: '选择 Block 1' }).click()
      await page.getByRole('button', { name: '用此 block 开始课堂' }).click()
      await expect(page.locator('#lesson-title')).toHaveText('课堂')
      await expect(page.locator('.lesson-anchor').getByText(pdfFixtureText)).toBeVisible()
      await expect(page.getByText('第 1 页 · Block 1')).toBeVisible()
      await expect(page.getByRole('heading', { name: '上下文证据' })).toHaveCount(1)
      await expect(page.locator('.lesson-context-chunks li').first()).toHaveText('第 1-1 页 · 48 字')
      await page.getByLabel('你的回答').fill('这段证据把结论和可观察行为连起来了。')
      await page.getByRole('button', { name: '提交回答' }).click()
      await expect(page.getByText('回答已提交。')).toBeVisible()
      await expect(page.getByText(/下一步你会如何验证这个判断/)).toBeVisible()
      await expect(page.getByRole('heading', { name: '上下文证据' })).toHaveCount(2)
      await expect(page.locator('.lesson-context-chunks li').first()).toHaveText('第 1-1 页 · 48 字')
      await expect(page.getByText('课堂仍可继续（已降级为 snippet）')).toBeVisible()
      await page.getByRole('button', { name: '回到证据' }).click()
      await expect(
        page.locator('.document-detail').getByRole('heading', { name: 'evidence' }),
      ).toBeVisible()
      await expect(page.locator('.pdf-block-active')).toBeVisible()
      await page.getByRole('button', { name: '文档库' }).click()

      await page.getByLabel('搜索文档内容').fill('Evidence')
      await page.getByRole('button', { name: '搜索内容' }).click()
      await expect(page.getByText('Why What How Evidence Limits Next')).toBeVisible()
      await page
        .locator('.search-hit')
        .filter({ hasText: 'Why What How Evidence Limits Next' })
        .getByRole('button', { name: '用此片段开始课堂' })
        .click()
      await expect(page.locator('#lesson-title')).toHaveText('课堂')
      await expect(
        page.locator('.lesson-anchor').getByText('Why What How Evidence Limits Next'),
      ).toBeVisible()
      await expect(page.getByText(/你觉得它想解决的核心问题是什么/)).toBeVisible()
      await expect(page.getByText('lesson.mockTutor.firstQuestion v1')).toBeVisible()
      await page.getByLabel('你的回答').fill('它在说明证据如何支撑判断。')
      await page.getByRole('button', { name: '提交回答' }).click()
      await expect(page.getByText('回答已提交。')).toBeVisible()
      await expect(
        page
          .locator('.lesson-message')
          .filter({ hasText: '学习者 · Prompt learner-input-v1' })
          .getByText('它在说明证据如何支撑判断。'),
      ).toBeVisible()
      await expect(page.getByText(/下一步你会如何验证这个判断/)).toBeVisible()
      await expect(page.getByText('lesson.mockTutor.followUp v2')).toBeVisible()
      await page.getByRole('button', { name: '文档库' }).click()

      await page.getByRole('button', { name: '删除 Socratic Notes' }).click()
      await expect(page.getByRole('dialog', { name: '确认删除文档' })).toBeVisible()
      await page.getByRole('button', { name: '确认删除' }).click()
      await expect(page.getByText('文档已删除。')).toBeVisible()
    } finally {
      await first.close()
    }

    seedFollowUpContextChunks(userDataDir)
    clearPersistedContextChunks(userDataDir)

    const second = await launchDevApp(userDataDir)
    try {
      const page = await second.firstWindow()
      await expect(page.getByRole('heading', { name: '文档库' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'paper.md' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'evidence' })).toBeVisible()
      await page
        .locator('.document-card')
        .filter({ hasText: 'evidence' })
        .getByRole('button', { name: '查看详情' })
        .click()
      await expect(page.locator('.document-detail .document-body')).toContainText(pdfFixtureText)
      await expect(page.getByText('PDF 页面 1')).toBeVisible()
      await expect(page.getByText(`Block 1 · ${pdfFixtureText}`)).toBeVisible()
      await page
        .locator('.document-card')
        .filter({ hasText: 'paper.md' })
        .getByRole('button', { name: '查看详情' })
        .click()
      await expect(
        page.locator('.document-detail').getByText('Why What How Evidence Limits Next'),
      ).toBeVisible()
      await page.locator('nav').getByRole('button', { name: '课堂' }).click()
      await expect(
        page.locator('.document-detail').getByRole('heading', { name: 'paper.md 课堂' }),
      ).toBeVisible()
      await expect(page.getByRole('heading', { name: 'evidence 课堂' })).toBeVisible()
      await expect(
        page.locator('.lesson-anchor').getByText('Why What How Evidence Limits Next'),
      ).toBeVisible()
      await expect(page.getByText(/你觉得它想解决的核心问题是什么/)).toBeVisible()
      await expect(page.getByText('lesson.mockTutor.firstQuestion v1')).toBeVisible()
      await expect(
        page
          .locator('.lesson-message')
          .filter({ hasText: '学习者 · Prompt learner-input-v1' })
          .getByText('它在说明证据如何支撑判断。'),
      ).toBeVisible()
      await expect(page.getByText(/下一步你会如何验证这个判断/)).toBeVisible()
      await expect(page.getByText('lesson.mockTutor.followUp v2')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Socratic Notes' })).not.toBeVisible()
      await page
        .locator('.document-card')
        .filter({ hasText: 'evidence 课堂' })
        .getByRole('button', { name: '打开 evidence 课堂' })
        .click()
      await expect(page.locator('.lesson-context-chunks li').nth(1)).toHaveText('第 1-1 页 · 48 字')
      await page.getByLabel('你的回答').fill('我会继续检查缺少 chunk 时还能否只靠 snippet 追问。')
      await page.getByRole('button', { name: '提交回答' }).click()
      await expect(page.getByText('课堂仍可继续（已降级为 snippet）')).toBeVisible()
    } finally {
      await second.close()
    }
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
