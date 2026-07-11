import {
  APP_CHANNELS,
  DOCUMENT_CHANNELS,
  PROVIDER_CHANNELS,
  documentDetailResultSchema,
  documentSummaryResultSchema,
  listDocumentsResultSchema,
  removeDocumentResultSchema,
  type DeepStormingBootstrapApi,
  appInfoResultSchema,
  cancelProviderTestResultSchema,
  listProvidersResultSchema,
  providerResultSchema,
  voidResultSchema,
  type CancelProviderTestResult,
  type DocumentDraftDto,
  type DocumentDetailResult,
  type DocumentSummaryResult,
  type ListDocumentsResult,
  type RemoveDocumentResult,
  type ListProvidersResult,
  type ProviderDraftDto,
  type ProviderResult,
  type VoidResult,
} from '@deepstorming/contracts'
import { contextBridge, ipcRenderer } from 'electron'

type ResultSchema<T> = Readonly<{
  safeParse(input: unknown): Readonly<{ success: true; data: T }> | Readonly<{ success: false }>
}>
type WithRequestId = Readonly<{ requestId: string }>

const invalidResponse = <Result extends WithRequestId>(requestId: string): Result =>
  ({
    ok: false,
    error: {
      code: 'IPC_RESPONSE_INVALID',
      message: 'DeepStorming received an invalid response from the desktop process.',
      retryable: true,
    },
    requestId,
  }) as unknown as Result

const dispatchFailed = <Result extends WithRequestId>(requestId: string): Result =>
  ({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'DeepStorming could not reach the desktop process.',
      retryable: true,
    },
    requestId,
  }) as unknown as Result

const invokeValidated = async <Result extends WithRequestId>(
  channel: string,
  payload: Record<string, unknown>,
  schema: ResultSchema<Result>,
): Promise<Result> => {
  let rawResult: unknown
  try {
    rawResult = await ipcRenderer.invoke(channel, payload)
  } catch {
    return dispatchFailed<Result>(payload['requestId'] as string)
  }
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
  documents: {
    list: async (): Promise<ListDocumentsResult> => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(DOCUMENT_CHANNELS.list, { requestId }, listDocumentsResultSchema)
    },
    createFromText: async (document: DocumentDraftDto): Promise<DocumentSummaryResult> => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(
        DOCUMENT_CHANNELS.createFromText,
        { requestId, document },
        documentSummaryResultSchema,
      )
    },
    get: async (id: string): Promise<DocumentDetailResult> => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(DOCUMENT_CHANNELS.get, { requestId, id }, documentDetailResultSchema)
    },
    remove: async (id: string): Promise<RemoveDocumentResult> => {
      const requestId = globalThis.crypto.randomUUID()
      return invokeValidated(
        DOCUMENT_CHANNELS.remove,
        { requestId, id },
        removeDocumentResultSchema,
      )
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
