import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
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

test('boots securely and covers the mock provider lifecycle', async () => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'deepstorming-e2e-user-'))
  const app = await launchDevApp(userDataDir)

  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: 'Provider 管理' })).toBeVisible()
    await expect(page.getByTestId('app-version')).toContainText('v0.0.0')
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
