import type { StoredDocumentFigure } from './document-ports'
import type { StoredLessonSession } from './lesson-ports'
import type { CancellationToken } from './provider-ports'

export const LESSON_EXPORT_FORMATS = ['markdown', 'pdf'] as const
export const LESSON_EXPORT_JOB_STATUSES = ['started', 'succeeded', 'failed', 'cancelled'] as const

export type LessonExportFormat = (typeof LESSON_EXPORT_FORMATS)[number]
export type LessonExportJobStatus = (typeof LESSON_EXPORT_JOB_STATUSES)[number]

export type LessonExportJob = Readonly<{
  operationId: string
  lessonId: string
  format: LessonExportFormat
  targetPath: string
  status: LessonExportJobStatus
  errorCode: string | null
  startedAt: string
  finishedAt: string | null
}>

export type LessonExportFigure = Readonly<{
  figure: StoredDocumentFigure
  data: Uint8Array
}>

export type LessonExportPayload = Readonly<{
  session: StoredLessonSession
  figures: readonly LessonExportFigure[]
}>

export interface LessonExportJobRepositoryPort {
  find(operationId: string): Promise<LessonExportJob | undefined>
  create(job: LessonExportJob): Promise<'created' | 'exists'>
  save(job: LessonExportJob): Promise<LessonExportJob>
}

export interface LessonExportDestinationPort {
  choose(
    input: Readonly<{ format: LessonExportFormat; suggestedName: string }>,
  ): Promise<string | undefined>
}

export interface LessonTranscriptExporterPort {
  export(payload: LessonExportPayload, targetPath: string, token: CancellationToken): Promise<void>
}
