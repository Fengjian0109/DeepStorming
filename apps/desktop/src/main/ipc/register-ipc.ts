import type { GetApplicationInfo } from '@deepstorming/application'
import { APP_CHANNELS } from '@deepstorming/contracts'
import { ipcMain } from 'electron'

import { createAppInfoHandler } from './app-info-handler'

export const registerIpc = (dependencies: { getApplicationInfo: GetApplicationInfo }): void => {
  ipcMain.removeHandler(APP_CHANNELS.getInfo)
  const handleAppInfo = createAppInfoHandler(dependencies.getApplicationInfo)

  ipcMain.handle(APP_CHANNELS.getInfo, (_event, input: unknown) => handleAppInfo(input))
}
