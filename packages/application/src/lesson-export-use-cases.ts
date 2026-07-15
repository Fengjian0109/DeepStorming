import type { DocumentAssetStorePort, DocumentFigureRepositoryPort } from './document-ports'
import type {
  LessonExportDestinationPort,
  LessonExportFormat,
  LessonExportJob,
  LessonExportJobRepositoryPort,
  LessonTranscriptExporterPort,
} from './lesson-export-ports'
import type { LessonRepositoryPort, StoredLessonSession } from './lesson-ports'
import { LessonUseCaseError } from './lesson-use-cases'
import type { CancellationToken } from './provider-ports'

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu

class ExportCancellationSource implements CancellationToken {
  private value = false
  private readonly listeners = new Set<() => void>()
  get cancelled(): boolean {
    return this.value
  }
  onCancel(listener: () => void): () => void {
    if (this.value) {
      listener()
      return () => undefined
    }
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  cancel(): void {
    if (this.value) return
    this.value = true
    for (const listener of this.listeners) listener()
  }
}

export class LessonExportOperations {
  private readonly sources = new Map<string, ExportCancellationSource>()
  start(operationId: string): CancellationToken {
    if (this.sources.has(operationId)) {
      throw new LessonUseCaseError(
        'LESSON_END_IN_PROGRESS',
        'This lesson export is already running.',
        false,
      )
    }
    const source = new ExportCancellationSource()
    this.sources.set(operationId, source)
    return source
  }
  cancel(operationId: string): boolean {
    const source = this.sources.get(operationId)
    if (source === undefined) return false
    source.cancel()
    return true
  }
  complete(operationId: string): void {
    this.sources.delete(operationId)
  }
}

export class CancelLessonExport {
  public constructor(private readonly operations: LessonExportOperations) {}
  execute(input: Readonly<{ operationId: string }>): Readonly<{ cancelled: boolean }> {
    if (!UUID.test(input.operationId)) {
      throw new LessonUseCaseError(
        'LESSON_VALIDATION_FAILED',
        'Lesson export operation id is invalid.',
        false,
      )
    }
    return { cancelled: this.operations.cancel(input.operationId) }
  }
}

export type ExportLessonTranscriptResult =
  | Readonly<{ outcome: 'dialog_cancelled'; format: LessonExportFormat }>
  | Readonly<{
      outcome: 'exported'
      format: LessonExportFormat
      targetPath: string
      replayed: boolean
    }>

const safeFileName = (value: string): string =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]/gu, '-')
    .slice(0, 80) || 'DeepStorming-lesson'

const sanitizeForExport = (session: StoredLessonSession): StoredLessonSession => ({
  ...session,
  modelRuns: [],
  steps: [],
  messages: session.messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({ ...message, promptVersion: 'exported', modelRunId: null })),
})

export class ExportLessonTranscript {
  public constructor(
    private readonly lessons: LessonRepositoryPort,
    private readonly figures: DocumentFigureRepositoryPort,
    private readonly assets: DocumentAssetStorePort,
    private readonly jobs: LessonExportJobRepositoryPort,
    private readonly destination: LessonExportDestinationPort,
    private readonly markdownExporter: LessonTranscriptExporterPort,
    private readonly pdfExporter: LessonTranscriptExporterPort,
    private readonly now: () => string,
    private readonly operations: LessonExportOperations,
  ) {}

  async execute(
    input: Readonly<{
      lessonId: string
      operationId: string
      format: LessonExportFormat
    }>,
  ): Promise<ExportLessonTranscriptResult> {
    if (
      !UUID.test(input.lessonId) ||
      !UUID.test(input.operationId) ||
      !['markdown', 'pdf'].includes(input.format)
    ) {
      throw new LessonUseCaseError(
        'LESSON_VALIDATION_FAILED',
        'Lesson export request is invalid.',
        false,
      )
    }
    const previous = await this.jobs.find(input.operationId)
    if (previous !== undefined) {
      if (previous.lessonId !== input.lessonId || previous.format !== input.format) {
        throw new LessonUseCaseError(
          'LESSON_VALIDATION_FAILED',
          'Lesson export operation conflicts with an earlier request.',
          false,
        )
      }
      if (previous.status === 'succeeded') {
        return {
          outcome: 'exported',
          format: previous.format,
          targetPath: previous.targetPath,
          replayed: true,
        }
      }
      if (previous.status === 'started') {
        throw new LessonUseCaseError(
          'LESSON_END_IN_PROGRESS',
          'This lesson export is already running.',
          false,
        )
      }
    }

    const session = await this.lessons.findById(input.lessonId)
    if (session === undefined) {
      throw new LessonUseCaseError('LESSON_NOT_FOUND', 'The lesson could not be found.', false)
    }
    const extension = input.format === 'markdown' ? 'md' : 'pdf'
    const targetPath = await this.destination.choose({
      format: input.format,
      suggestedName: `${safeFileName(session.title)}.${extension}`,
    })
    if (targetPath === undefined) return { outcome: 'dialog_cancelled', format: input.format }

    const startedAt = this.now()
    const started: LessonExportJob = {
      operationId: input.operationId,
      lessonId: input.lessonId,
      format: input.format,
      targetPath,
      status: 'started',
      errorCode: null,
      startedAt,
      finishedAt: null,
    }
    if (previous === undefined) {
      const result = await this.jobs.create(started)
      if (result === 'exists') {
        throw new LessonUseCaseError(
          'LESSON_END_IN_PROGRESS',
          'This lesson export is already running.',
          false,
        )
      }
    } else {
      await this.jobs.save(started)
    }

    const token = this.operations.start(input.operationId)
    try {
      const cleanSession = sanitizeForExport(session)
      const referencedIds = new Set(
        cleanSession.messages.flatMap(
          (message) =>
            message.tutorTurn?.figureReferences.map((reference) => reference.figureId) ?? [],
        ),
      )
      const available = await this.figures.listFigures(session.documentId)
      const exportFigures = await Promise.all(
        available
          .filter((figure) => referencedIds.has(figure.id))
          .map(async (figure) => ({
            figure,
            data: await this.assets.readFigure(session.documentId, figure.assetId),
          })),
      )
      const exporter = input.format === 'markdown' ? this.markdownExporter : this.pdfExporter
      await exporter.export({ session: cleanSession, figures: exportFigures }, targetPath, token)
      if (token.cancelled) throw new Error('cancelled')
      await this.jobs.save({ ...started, status: 'succeeded', finishedAt: this.now() })
      return { outcome: 'exported', format: input.format, targetPath, replayed: false }
    } catch {
      const cancelled = token.cancelled
      await this.jobs.save({
        ...started,
        status: cancelled ? 'cancelled' : 'failed',
        errorCode: cancelled ? 'OPERATION_CANCELLED' : 'INTERNAL_ERROR',
        finishedAt: this.now(),
      })
      if (cancelled) {
        throw new LessonUseCaseError(
          'OPERATION_CANCELLED',
          'The lesson export was cancelled.',
          true,
        )
      }
      throw new LessonUseCaseError(
        'INTERNAL_ERROR',
        'The lesson export could not be completed.',
        true,
      )
    } finally {
      this.operations.complete(input.operationId)
    }
  }
}
