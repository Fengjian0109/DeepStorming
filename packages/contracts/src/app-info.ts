import { z } from 'zod'

import { createAppResultSchema } from './app-result'
import type {
  DocumentDetailResult,
  DocumentDraftDto,
  SearchDocumentsResult,
  DocumentSummaryResult,
  ListDocumentsResult,
  RemoveDocumentResult,
} from './document'
import type {
  CancelProviderTestResult,
  ListProvidersResult,
  ProviderDraftDto,
  ProviderResult,
  VoidResult,
} from './provider'
import type {
  CancelLessonRunResult,
  LessonReplyDraftDto,
  LessonRunRetryDraftDto,
  LessonSessionResult,
  LessonSessionsResult,
  LessonStartDraftDto,
} from './lesson'

export const APP_CHANNELS = {
  getInfo: 'app:get-info',
} as const

export const appInfoRequestSchema = z
  .object({
    requestId: z.string().uuid(),
  })
  .strict()

export const appInfoSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    platform: z.enum(['darwin', 'win32', 'linux', 'unknown']),
  })
  .strict()

export const appInfoResultSchema = createAppResultSchema(appInfoSchema)

export type AppInfoRequest = z.infer<typeof appInfoRequestSchema>
export type AppInfoDto = z.infer<typeof appInfoSchema>
export type AppInfoResult = z.infer<typeof appInfoResultSchema>

export type DeepStormingApi = {
  app: {
    getInfo: () => Promise<AppInfoResult>
  }
  documents: {
    list: () => Promise<ListDocumentsResult>
    createFromText: (document: DocumentDraftDto) => Promise<DocumentSummaryResult>
    get: (id: string) => Promise<DocumentDetailResult>
    search: (query: string) => Promise<SearchDocumentsResult>
    remove: (id: string) => Promise<RemoveDocumentResult>
  }
  lessons: {
    list: () => Promise<LessonSessionsResult>
    startFromDocument: (lesson: LessonStartDraftDto) => Promise<LessonSessionResult>
    get: (id: string) => Promise<LessonSessionResult>
    reply: (reply: LessonReplyDraftDto) => Promise<LessonSessionResult>
    retryRun: (retry: LessonRunRetryDraftDto) => Promise<LessonSessionResult>
    cancelRun: (operationId: string) => Promise<CancelLessonRunResult>
  }
  provider: {
    list: () => Promise<ListProvidersResult>
    create: (provider: ProviderDraftDto) => Promise<ProviderResult>
    update: (id: string, provider: ProviderDraftDto) => Promise<ProviderResult>
    remove: (id: string) => Promise<VoidResult>
    activate: (id: string) => Promise<ProviderResult>
    testConnection: (id: string, operationId: string) => Promise<ProviderResult>
    cancelTest: (operationId: string) => Promise<CancelProviderTestResult>
  }
}

export type DeepStormingBootstrapApi = DeepStormingApi
