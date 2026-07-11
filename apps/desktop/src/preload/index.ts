import {
  APP_CHANNELS,
  PROVIDER_CHANNELS,
  type DeepStormingBootstrapApi,
  appInfoResultSchema,
  cancelProviderTestResultSchema,
  listProvidersResultSchema,
  providerResultSchema,
  voidResultSchema,
  type AppResult,
  type CancelProviderTestResult,
  type ListProvidersResult,
  type ProviderDraftDto,
  type ProviderResult,
  type VoidResult,
} from '@deepstorming/contracts'
import { contextBridge, ipcRenderer } from 'electron'

type ResultSchema<T> = Readonly<{
  safeParse(input: unknown): Readonly<{ success: true; data: T }> | Readonly<{ success: false }>
}>

const invalidResponse = <Result extends AppResult<unknown>>(requestId: string): Result =>
  ({
    ok: false,
    error: {
      code: 'IPC_RESPONSE_INVALID',
      message: 'DeepStorming received an invalid response from the desktop process.',
      retryable: true,
    },
    requestId,
  }) as Result

const invokeValidated = async <Result extends AppResult<unknown>>(
  channel: string,
  payload: Record<string, unknown>,
  schema: ResultSchema<Result>,
): Promise<Result> => {
  const rawResult: unknown = await ipcRenderer.invoke(channel, payload)
  const parsed = schema.safeParse(rawResult)

  if (!parsed.success) return invalidResponse<Result>(payload['requestId'] as string)
  return parsed.data
}

const api: DeepStormingBootstrapApi = {
  app: {
    getInfo: async () => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(APP_CHANNELS.getInfo, { requestId }, appInfoResultSchema)
    },
  },
  provider: {
    list: async (): Promise<ListProvidersResult> => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(PROVIDER_CHANNELS.list, { requestId }, listProvidersResultSchema)
    },
    create: async (provider: ProviderDraftDto): Promise<ProviderResult> => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(
        PROVIDER_CHANNELS.create,
        { requestId, provider },
        providerResultSchema,
      )
    },
    update: async (id: string, provider: ProviderDraftDto): Promise<ProviderResult> => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(
        PROVIDER_CHANNELS.update,
        { requestId, id, provider },
        providerResultSchema,
      )
    },
    remove: async (id: string): Promise<VoidResult> => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(PROVIDER_CHANNELS.remove, { requestId, id }, voidResultSchema)
    },
    activate: async (id: string): Promise<ProviderResult> => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(PROVIDER_CHANNELS.activate, { requestId, id }, providerResultSchema)
    },
    testConnection: async (id: string, operationId: string): Promise<ProviderResult> => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(
        PROVIDER_CHANNELS.testConnection,
        { requestId, id, operationId },
        providerResultSchema,
      )
    },
    cancelTest: async (operationId: string): Promise<CancelProviderTestResult> => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(
        PROVIDER_CHANNELS.cancelTest,
        { requestId, operationId },
        cancelProviderTestResultSchema,
      )
    },
  },
}

contextBridge.exposeInMainWorld('deepstorming', Object.freeze(api))
