import { ProviderUseCaseError } from '@deepstorming/application'
import { StructuredLogger } from '@deepstorming/infrastructure'
import { app, BrowserWindow, session } from 'electron'

import { normalizeApplicationVersion } from './app-version'
import { createCompositionRoot } from './composition-root'
import { createMainWindow } from './create-window'
import { registerIpc } from './ipc/register-ipc'

const logger = new StructuredLogger('desktop-main')

const stableBootstrapCode = (error: unknown): string => {
  if (error instanceof ProviderUseCaseError) return error.code
  if (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code
  }
  return 'INTERNAL_ERROR'
}

const bootstrap = async (): Promise<void> => {
  const applicationVersion = normalizeApplicationVersion(__APP_VERSION__)
  app.setAppUserModelId('com.deepstorming.desktop')

  await app.whenReady()

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  const compositionRoot = await createCompositionRoot(app, applicationVersion, logger)
  registerIpc(compositionRoot)
  app.once('before-quit', () => {
    compositionRoot.dispose()
  })
  createMainWindow()

  logger.log('info', 'app.started', {
    version: applicationVersion,
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
  logger.log('error', 'app.bootstrap_failed', { code: stableBootstrapCode(error) })
  app.quit()
})
