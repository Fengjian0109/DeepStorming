import {
  APP_CHANNELS,
  type DeepStormingBootstrapApi,
  appInfoResultSchema,
} from '@deepstorming/contracts'
import { contextBridge, ipcRenderer } from 'electron'

const api: DeepStormingBootstrapApi = {
  app: {
    getInfo: async () => {
      const requestId = globalThis.crypto.randomUUID()
      const rawResult: unknown = await ipcRenderer.invoke(APP_CHANNELS.getInfo, { requestId })
      const parsed = appInfoResultSchema.safeParse(rawResult)

      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'IPC_RESPONSE_INVALID',
            message: 'DeepStorming received an invalid response from the desktop process.',
            retryable: true,
          },
          requestId,
        }
      }

      return parsed.data
    },
  },
}

contextBridge.exposeInMainWorld('deepstorming', Object.freeze(api))
