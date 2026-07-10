import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('boots with a sandboxed renderer and typed app information', async () => {
  const launchArgs = [path.join(process.cwd(), 'apps/desktop/out/main/index.js')]
  const launchEnvironment = { ...process.env }

  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    launchArgs.unshift('--no-sandbox')
  }

  if (process.platform === 'linux' && !process.env['DISPLAY']) {
    const runtimeDirectory = path.join(tmpdir(), 'deepstorming-electron-e2e')
    mkdirSync(runtimeDirectory, { recursive: true })
    launchEnvironment['XDG_CACHE_HOME'] = path.join(runtimeDirectory, 'cache')
    launchEnvironment['XDG_CONFIG_HOME'] = path.join(runtimeDirectory, 'config')
    launchEnvironment['XDG_DATA_HOME'] = path.join(runtimeDirectory, 'data')
    launchArgs.unshift(
      '--headless',
      '--ozone-platform=headless',
      '--disable-gpu',
      '--disable-dev-shm-usage',
    )
  }

  const app = await electron.launch({
    args: launchArgs,
    env: launchEnvironment,
  })

  try {
    const page = await app.firstWindow()
    await expect(
      page.getByRole('heading', { name: '让理解发生，而不只是得到答案。' }),
    ).toBeVisible()
    await expect(page.getByTestId('app-version')).toContainText('v0.0.0')

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
  } finally {
    await app.close()
  }
})
