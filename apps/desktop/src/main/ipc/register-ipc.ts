import type { GetApplicationInfo } from '@deepstorming/application'
import { APP_CHANNELS, PROVIDER_CHANNELS } from '@deepstorming/contracts'
import { ipcMain } from 'electron'

import { createAppInfoHandler } from './app-info-handler'
import { createProviderIpcHandlers, type ProviderIpcDependencies } from './provider-handlers'

export const registerIpc = (
  dependencies: { getApplicationInfo: GetApplicationInfo } & ProviderIpcDependencies,
): void => {
  ipcMain.removeHandler(APP_CHANNELS.getInfo)
  for (const channel of Object.values(PROVIDER_CHANNELS)) {
    ipcMain.removeHandler(channel)
  }

  const handleAppInfo = createAppInfoHandler(dependencies.getApplicationInfo)
  const providerHandlers = createProviderIpcHandlers(dependencies)

  ipcMain.handle(APP_CHANNELS.getInfo, (_event, input: unknown) => handleAppInfo(input))
  ipcMain.handle(PROVIDER_CHANNELS.list, (_event, input: unknown) => providerHandlers.list(input))
  ipcMain.handle(PROVIDER_CHANNELS.create, (_event, input: unknown) =>
    providerHandlers.create(input),
  )
  ipcMain.handle(PROVIDER_CHANNELS.update, (_event, input: unknown) =>
    providerHandlers.update(input),
  )
  ipcMain.handle(PROVIDER_CHANNELS.remove, (_event, input: unknown) =>
    providerHandlers.remove(input),
  )
  ipcMain.handle(PROVIDER_CHANNELS.activate, (_event, input: unknown) =>
    providerHandlers.activate(input),
  )
  ipcMain.handle(PROVIDER_CHANNELS.testConnection, (_event, input: unknown) =>
    providerHandlers.testConnection(input),
  )
  ipcMain.handle(PROVIDER_CHANNELS.cancelTest, (_event, input: unknown) =>
    providerHandlers.cancelTest(input),
  )
}
