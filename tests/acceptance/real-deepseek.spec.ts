import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for the opt-in DeepSeek acceptance run.`)
  return value
}

const keyFile = requiredEnvironment('DEEPSTORMING_REAL_DEEPSEEK_KEY_FILE')
const modelName = requiredEnvironment('DEEPSTORMING_REAL_DEEPSEEK_MODEL')

const readKey = (): string => {
  const key = readFileSync(keyFile, 'utf8').trim()
  if (!key) throw new Error('The DeepSeek key file is empty.')
  return key
}

const launch = async (runtime: string): Promise<ElectronApplication> =>
  electron.launch({
    args: [path.join(process.cwd(), 'apps/desktop/out/main/index.js')],
    env: { ...process.env, DEEPSTORMING_USER_DATA_DIR: runtime },
  })

test('uses the secure UI and Vault for a real DeepSeek lesson and restart recovery', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'deepstorming-real-deepseek-'))
  const runtime = path.join(root, 'runtime')
  const apiKey = readKey()
  let app = await launch(runtime)

  try {
    let page = await app.firstWindow()
    await page.getByRole('button', { name: '设置' }).click()
    await page.getByLabel('Provider 类型').selectOption('deepseek')
    await page.getByLabel('显示名称').fill('DeepSeek Acceptance')
    await page.getByLabel('模型名称').fill(modelName)
    await page.getByLabel('API Key').fill(apiKey)
    await page.getByRole('button', { name: '添加 Provider' }).click()
    await expect(page.getByText('Provider 已添加。')).toBeVisible()
    await expect(page.getByLabel('API Key')).toHaveValue('')
    await page.getByRole('button', { name: '设为启用 DeepSeek Acceptance' }).click()
    await expect(page.getByText('Provider 已启用。')).toBeVisible()
    await page.getByRole('button', { name: '测试 DeepSeek Acceptance' }).click()
    await expect(page.getByText('Provider 测试成功。')).toBeVisible({ timeout: 60_000 })

    await page.getByRole('button', { name: '文档库' }).click()
    await page.getByRole('button', { name: '粘贴文本 / 导入 TXT、MD' }).click()
    await page.getByLabel('标题').fill('DeepSeek Acceptance Notes')
    await page
      .getByLabel('正文')
      .fill('Evidence connects a claim to observable behavior and defines what can be tested.')
    await page.getByRole('button', { name: '保存文档' }).click()
    await page.getByRole('button', { name: '开始课堂' }).click()
    await page.getByRole('button', { name: '进入课堂' }).click()
    await expect(page.getByRole('article', { name: '导师消息' }).first()).toBeVisible({
      timeout: 60_000,
    })
    await page.getByLabel('你的回答').fill('我会比较模型结论与可以重复观察到的证据。')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByText('回答已提交。')).toBeVisible({ timeout: 60_000 })

    await app.close()
    app = await launch(runtime)
    page = await app.firstWindow()
    await page.getByRole('button', { name: '课堂' }).click()
    await expect(page.getByRole('button', { name: /DeepSeek Acceptance Notes 课堂/ })).toBeVisible()
  } finally {
    await app.close().catch(() => undefined)
    rmSync(root, { recursive: true, force: true })
  }
})
