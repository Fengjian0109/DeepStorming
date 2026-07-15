import { z } from 'zod'

import { createAppResultSchema } from './app-result'
import type {
  DocumentDetailResult,
  DocumentDraftDto,
  DocumentImportJobResult,
  DocumentFigureAssetResult,
  DocumentPagesResult,
  DocumentTextBlocksResult,
  ImportPdfDocumentRequest,
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
  LessonRecordReviewDraftDto,
  LessonEndDraftDto,
  LessonPostActionDraftDto,
  LessonCompleteReviewDraftDto,
  LessonReplyDraftDto,
  LessonRunRetryDraftDto,
  LessonSessionResult,
  LessonSessionsResult,
  LessonStartDraftDto,
  LessonExportDraftDto,
  LessonExportResult,
} from './lesson'
import type {
  AvatarAssetResult,
  ClassroomPreferencesDto,
  ClassroomPreferencesResult,
  LearningSettingsResult,
  TutorProfileDraftDto,
  TutorProfileResult,
  UserProfileDraftDto,
  UserProfileResult,
} from './learning-settings'

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
    importPdf: (
      input: Omit<ImportPdfDocumentRequest, 'requestId'>,
    ) => Promise<DocumentImportJobResult>
    getPathForFile: (file: File) => string | undefined
    getPages: (documentId: string) => Promise<DocumentPagesResult>
    getPageBlocks: (documentId: string, pageNumber: number) => Promise<DocumentTextBlocksResult>
    getFigureAsset: (documentId: string, figureId: string) => Promise<DocumentFigureAssetResult>
  }
  lessons: {
    list: () => Promise<LessonSessionsResult>
    startFromDocument: (lesson: LessonStartDraftDto) => Promise<LessonSessionResult>
    get: (id: string) => Promise<LessonSessionResult>
    reply: (reply: LessonReplyDraftDto) => Promise<LessonSessionResult>
    retryRun: (retry: LessonRunRetryDraftDto) => Promise<LessonSessionResult>
    cancelRun: (operationId: string) => Promise<CancelLessonRunResult>
    recordReview: (review: LessonRecordReviewDraftDto) => Promise<LessonSessionResult>
    end: (lesson: LessonEndDraftDto) => Promise<LessonSessionResult>
    choosePostLessonAction: (choice: LessonPostActionDraftDto) => Promise<LessonSessionResult>
    completeReview: (review: LessonCompleteReviewDraftDto) => Promise<LessonSessionResult>
    exportTranscript: (draft: LessonExportDraftDto) => Promise<LessonExportResult>
    cancelExport: (operationId: string) => Promise<CancelLessonRunResult>
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
  learningSettings: {
    get: () => Promise<LearningSettingsResult>
    saveUserProfile: (
      expectedRevision: number,
      profile: UserProfileDraftDto,
    ) => Promise<UserProfileResult>
    createTutor: (profile: TutorProfileDraftDto) => Promise<TutorProfileResult>
    updateTutor: (
      id: string,
      expectedRevision: number,
      profile: TutorProfileDraftDto,
    ) => Promise<TutorProfileResult>
    archiveTutor: (id: string, expectedRevision: number) => Promise<TutorProfileResult>
    saveClassroomPreferences: (
      preferences: ClassroomPreferencesDto,
    ) => Promise<ClassroomPreferencesResult>
    importAvatar: (file: File) => Promise<AvatarAssetResult>
  }
}

export type DeepStormingBootstrapApi = DeepStormingApi
