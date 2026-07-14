import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

const packagedExecutable = path.join(
  process.cwd(),
  'apps/desktop/release/mac-arm64/DeepStorming.app/Contents/MacOS/DeepStorming',
)
const packagedAsar = path.join(
  process.cwd(),
  'apps/desktop/release/mac-arm64/DeepStorming.app/Contents/Resources/app.asar',
)
const builtMain = path.join(process.cwd(), 'apps/desktop/out/main/index.js')

const packagedAppIsFresh = (): boolean =>
  existsSync(packagedExecutable) &&
  existsSync(packagedAsar) &&
  existsSync(builtMain) &&
  statSync(packagedAsar).mtimeMs >= statSync(builtMain).mtimeMs

const launchPackagedApp = async (userDataDir: string): Promise<ElectronApplication> =>
  electron.launch({
    executablePath: packagedExecutable,
    env: { ...process.env, DEEPSTORMING_USER_DATA_DIR: userDataDir },
  })

test('persists mock providers across packaged macOS restarts', async () => {
  test.skip(
    process.platform !== 'darwin',
    'packaged macOS app persistence proof only runs on macOS',
  )
  test.skip(!packagedAppIsFresh(), 'run pnpm package:dir before packaged persistence proof')

  const userDataDir = mkdtempSync(path.join(tmpdir(), 'deepstorming-packaged-user-'))
  mkdirSync(userDataDir, { recursive: true })

  try {
    const first = await launchPackagedApp(userDataDir)
    try {
      const page = await first.firstWindow()
      await expect(page.getByRole('heading', { name: '文档库' })).toBeVisible()
      await page.getByRole('button', { name: '设置' }).click()
      await expect(page.getByRole('heading', { name: 'Provider 管理' })).toBeVisible()
      await page.getByLabel('Provider 类型').selectOption('mock')
      await page.getByLabel('显示名称').fill('Packaged Tutor')
      await page.getByLabel('模型名称').fill('mock-success')
      await page.getByRole('button', { name: '添加 Provider' }).click()
      await expect(page.getByText('Provider 已添加。')).toBeVisible()
      await expect(page.getByText('Packaged Tutor')).toBeVisible()
    } finally {
      await first.close()
    }

    const second = await launchPackagedApp(userDataDir)
    try {
      const page = await second.firstWindow()
      await expect(page.getByRole('heading', { name: '文档库' })).toBeVisible()
      await page.getByRole('button', { name: '设置' }).click()
      await expect(page.getByRole('heading', { name: 'Provider 管理' })).toBeVisible()
      await expect(page.getByText('Packaged Tutor')).toBeVisible()
      await expect(page.getByText('mock-success')).toBeVisible()
    } finally {
      await second.close()
    }
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
