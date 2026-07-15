import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const sandboxArgs = (): string[] => {
  const args: string[] = []
  if (typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox')
  return args
}

const launch = async (root: string): Promise<ElectronApplication> =>
  electron.launch({
    args: [...sandboxArgs(), path.join(process.cwd(), 'apps/desktop/out/main/index.js')],
    env: { ...process.env, DEEPSTORMING_USER_DATA_DIR: path.join(root, 'runtime') },
  })

const openSettings = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.getByRole('heading', { name: 'AI Provider' })).toBeVisible()
}

const configureRichProvider = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: '新增 Provider' }).click()
  await page.getByLabel('Provider 类型').selectOption('mock')
  await page.getByLabel('显示名称').fill('Rich Tutor')
  await page.getByLabel('模型名称').fill('mock-rich-4k')
  await page.getByRole('button', { name: '添加 Provider' }).click()
  await page.getByRole('button', { name: '打开 Rich Tutor' }).click()
  await page.getByRole('button', { name: '设为启用' }).click()
  await expect(page.getByText('Provider 已启用。')).toBeVisible()
}

const writeRichPdf = async (filePath: string): Promise<void> => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const image = await pdf.embedPng(onePixelPng)
  const page = pdf.addPage([500, 500])
  page.drawText('Evidence connects claims to observations.', { x: 60, y: 440, size: 12, font })
  page.drawImage(image, { x: 80, y: 150, width: 300, height: 210 })
  page.drawText('Fig. 2. Embedded result', { x: 80, y: 120, size: 12, font })
  writeFileSync(filePath, await pdf.save())
}

const startCurrentDocumentLesson = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: '开始课堂' }).click()
  await expect(page.getByRole('dialog', { name: '课堂准备' })).toBeVisible()
  await page.getByLabel('快：理解后快速推进').check()
  await page.getByRole('button', { name: '进入课堂' }).click()
  await expect(page.getByRole('region', { name: '课堂对话' })).toBeVisible()
}

test('covers AI-first rich chat, avatars, compression, lifecycle, exports, and restart recovery', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'deepstorming-ai-first-e2e-'))
  const avatarPath = path.join(root, 'avatar.png')
  const pdfPath = path.join(root, 'rich-evidence.pdf')
  const markdownPath = path.join(root, 'lesson.md')
  const exportedPdfPath = path.join(root, 'lesson.pdf')
  writeFileSync(avatarPath, onePixelPng)
  await writeRichPdf(pdfPath)

  let app = await launch(root)
  try {
    let page = await app.firstWindow()
    await openSettings(page)
    await configureRichProvider(page)

    await page.getByRole('button', { name: '个人资料' }).click()
    await page.getByLabel('你的名称').fill('何同学')
    await page.getByLabel('选择个人头像 文件输入').setInputFiles(avatarPath)
    await expect(page.getByText('头像已导入并安全保存。')).toBeVisible()
    await page.getByRole('button', { name: '保存个人资料' }).click()
    await expect(page.getByText('个人资料已保存。')).toBeVisible()

    await page.getByRole('button', { name: '导师 / 伙伴' }).click()
    await page.getByRole('button', { name: '编辑 苏格拉底导师' }).click()
    await page.getByLabel('选择导师头像 文件输入').setInputFiles(avatarPath)
    await expect(page.getByText('导师头像已导入并安全保存。')).toBeVisible()
    await page.getByLabel('性格').fill('严谨、好奇、耐心')
    await page.getByLabel('擅长领域（逗号分隔）').fill('数学, 论文阅读')
    await page.getByRole('button', { name: '保存导师' }).click()
    await expect(page.getByText('导师档案已保存。')).toBeVisible()

    await page.getByRole('button', { name: '课堂设置' }).click()
    await page.getByLabel('剩余上下文压缩阈值（%）').fill('50')
    await page.getByRole('button', { name: '保存课堂设置' }).click()
    await expect(page.getByText('课堂设置已保存。')).toBeVisible()

    await page.getByRole('button', { name: '文档库' }).click()
    await page.getByLabel('导入 PDF 文件输入').setInputFiles(pdfPath)
    await expect(page.getByText('PDF 已导入。')).toBeVisible({ timeout: 30_000 })
    await startCurrentDocumentLesson(page)

    await expect(page.getByText('导师指向证据与图表，等待你的推导。')).toBeVisible()
    await expect(page.locator('.katex')).toHaveCount(1)
    await expect(page.getByRole('complementary', { name: '引用内容' })).toBeVisible()
    await expect(page.getByRole('img', { name: /Fig\. 2：Embedded result/ })).toBeVisible()
    await expect(page.getByRole('img', { name: '苏格拉底导师头像' })).toBeVisible()

    const learnerAnswer = '$a=\\sum_{i=1}^{N}i^2$，我会比较预测与观测。' + '证据'.repeat(300)
    await page.getByLabel('你的回答').fill(learnerAnswer)
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('回答已提交。')).toBeVisible()
    await expect(page.getByRole('img', { name: '何同学头像' })).toBeVisible()
    await expect(page.locator('.lesson-message-learner .katex')).toHaveCount(1)
    await page.getByRole('button', { name: 'rich-evidence 课堂 · 进行中' }).click()
    await page.getByRole('button', { name: '课堂信息' }).click()
    await page.getByRole('tab', { name: '技术' }).click()
    await expect(page.getByRole('article', { name: '上下文诊断' })).toContainText('快照 v1')
    await expect(page.getByRole('article', { name: '上下文诊断' })).toContainText('succeeded')
    await page.getByRole('button', { name: '关闭课堂信息' }).click()

    await app.evaluate(async ({ dialog }, targetPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: targetPath })
    }, markdownPath)
    await page.getByRole('button', { name: '导出 Markdown' }).click()
    await expect(page.getByText('课堂记录已导出。')).toBeVisible()
    expect(existsSync(markdownPath)).toBe(true)
    const markdown = readFileSync(markdownPath, 'utf8')
    expect(markdown).toContain('## 我')
    expect(markdown).toContain('$a=\\sum_{i=1}^{N}i^2$')
    expect(markdown).toContain('![Fig. 2]')

    await app.evaluate(async ({ dialog }, targetPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: targetPath })
    }, exportedPdfPath)
    await page.getByRole('button', { name: '导出 PDF' }).click()
    await expect(page.getByText('课堂记录已导出。')).toBeVisible()
    expect(readFileSync(exportedPdfPath).subarray(0, 5).toString()).toBe('%PDF-')

    await page.getByRole('button', { name: '下课并保存记忆' }).click()
    await page.getByRole('button', { name: '确认下课' }).click()
    await page.getByRole('button', { name: '立即复习' }).click()
    await page.getByLabel('课后复习回答').fill('证据必须能支持结论，并可由观察检验。')
    await page.getByRole('button', { name: '完成复习并结束本节课' }).click()
    await expect(page.getByText('本节课已完成')).toBeVisible()

    await page.getByRole('button', { name: '文档库' }).click()
    await page.getByRole('button', { name: '打开文档：rich-evidence' }).click()
    await startCurrentDocumentLesson(page)
    await expect(page.getByRole('button', { name: /rich-evidence 课堂/ })).toHaveCount(2)

    await app.close()
    app = await launch(root)
    page = await app.firstWindow()
    await page.getByRole('button', { name: '课堂' }).click()
    await expect(page.getByRole('button', { name: /rich-evidence 课堂/ })).toHaveCount(2)
    await expect(page.getByRole('region', { name: '课堂对话' })).toBeVisible()
  } finally {
    await app.close().catch(() => undefined)
    rmSync(root, { recursive: true, force: true })
  }
})
