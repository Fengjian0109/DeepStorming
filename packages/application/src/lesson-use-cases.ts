import {
  normalizeLessonStartDraft,
  type LessonSession,
  type LessonStartDraft,
} from '@deepstorming/domain'
import type { ClockPort, DocumentRepositoryPort, IdGeneratorPort } from './document-ports'
import type { LessonRepositoryPort, StoredLessonSession } from './lesson-ports'

export type LessonUseCaseErrorCode =
  | 'LESSON_VALIDATION_FAILED'
  | 'LESSON_DOCUMENT_NOT_FOUND'
  | 'LESSON_NOT_FOUND'
  | 'DATABASE_UNAVAILABLE'
  | 'INTERNAL_ERROR'

export class LessonUseCaseError extends Error {
  public constructor(
    public readonly code: LessonUseCaseErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

const toView = (session: StoredLessonSession): LessonSession => ({
  id: session.id,
  title: session.title,
  status: session.status,
  documentId: session.documentId,
  documentTitle: session.documentTitle,
  sourceAnchors: session.sourceAnchors,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
})

const validationError = (error: unknown): LessonUseCaseError =>
  new LessonUseCaseError(
    'LESSON_VALIDATION_FAILED',
    error instanceof Error ? error.message : 'The lesson input is invalid.',
    false,
  )

const databaseError = (): LessonUseCaseError =>
  new LessonUseCaseError('DATABASE_UNAVAILABLE', 'Lesson storage is temporarily unavailable.', true)

const internalError = (): LessonUseCaseError =>
  new LessonUseCaseError('INTERNAL_ERROR', 'The lesson operation could not be completed.', true)

const isLessonError = (error: unknown): error is LessonUseCaseError =>
  error instanceof LessonUseCaseError

const asDatabaseError = (error: unknown): LessonUseCaseError => {
  if (isLessonError(error)) return error
  return databaseError()
}

const asInternalError = (error: unknown): LessonUseCaseError => {
  if (isLessonError(error)) return error
  return internalError()
}

export class ListLessonSessions {
  public constructor(private readonly repository: LessonRepositoryPort) {}

  public async execute(): Promise<readonly LessonSession[]> {
    try {
      return (await this.repository.list()).map(toView)
    } catch (error) {
      throw asDatabaseError(error)
    }
  }
}

export class GetLessonSession {
  public constructor(private readonly repository: LessonRepositoryPort) {}

  public async execute(id: string): Promise<LessonSession> {
    let session: StoredLessonSession | undefined
    try {
      session = await this.repository.findById(id)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (!session)
      throw new LessonUseCaseError('LESSON_NOT_FOUND', 'The lesson was not found.', false)
    return toView(session)
  }
}

export class StartLessonFromDocument {
  public constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly lessons: LessonRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  public async execute(input: LessonStartDraft): Promise<LessonSession> {
    let draft
    try {
      draft = normalizeLessonStartDraft(input)
    } catch (error) {
      throw validationError(error)
    }

    try {
      const document = await this.documents.findById(draft.documentId)
      if (!document) {
        throw new LessonUseCaseError(
          'LESSON_DOCUMENT_NOT_FOUND',
          'The source document was not found.',
          false,
        )
      }
    } catch (error) {
      if (isLessonError(error)) throw error
      throw databaseError()
    }

    let createdAt: string
    let sessionId: string
    let anchorId: string
    try {
      createdAt = this.clock.now()
      sessionId = this.ids.generate()
      anchorId = this.ids.generate()
    } catch (error) {
      throw asInternalError(error)
    }

    const session: StoredLessonSession = {
      id: sessionId,
      title: draft.title,
      status: 'active',
      documentId: draft.documentId,
      documentTitle: draft.documentTitle,
      sourceAnchors: [
        {
          id: anchorId,
          documentId: draft.documentId,
          startOffset: draft.source.startOffset,
          endOffset: draft.source.endOffset,
          snippet: draft.source.snippet,
        },
      ],
      createdAt,
      updatedAt: createdAt,
    }

    try {
      return toView(await this.lessons.create(session))
    } catch (error) {
      throw asDatabaseError(error)
    }
  }
}
