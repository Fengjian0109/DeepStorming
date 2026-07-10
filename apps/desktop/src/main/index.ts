import { GetApplicationInfo } from '@deepstorming/application'
import { StructuredLogger } from '@deepstorming/infrastructure'
import { app, BrowserWindow, session } from 'electron'

import { ElectronAppInfoAdapter } from './app-info-adapter'
import { createMainWindow } from './create-window'
import { registerIpc } from './ipc/register-ipc'

const logger = new StructuredLogger('desktop-main')

const bootstrap = async (): Promise<void> => {
  app.setAppUserModelId('com.deepstorming.desktop')

  await app.whenReady()

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  const appInfo = new ElectronAppInfoAdapter(app)
  registerIpc({ getApplicationInfo: new GetApplicationInfo(appInfo) })
  createMainWindow()

  logger.log('info', 'app.started', {
    version: app.getVersion(),
    platform: process.platform,
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

void bootstrap().catch((error: unknown) => {
  logger.log('error', 'app.bootstrap_failed', { error })
  app.quit()
})
