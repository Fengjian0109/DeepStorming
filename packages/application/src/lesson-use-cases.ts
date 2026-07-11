import {
  normalizeLessonStartDraft,
  type LessonPromptManifest,
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
  messages: session.messages,
  modelRuns: session.modelRuns,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
})

const MOCK_TUTOR_PROMPT_TEMPLATE =
  '我们先从《{{documentTitle}}》的这段证据开始：{{snippet}}\n\n你觉得它想解决的核心问题是什么？'
const MOCK_TUTOR_PROMPT_MANIFEST: LessonPromptManifest = {
  key: 'lesson.mockTutor.firstQuestion',
  version: 1,
  hash: 'sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff',
}
const MOCK_TUTOR_PROMPT_VERSION = 'mock-tutor-v1'

const createMockTutorFirstQuestion = (documentTitle: string, snippet: string): string =>
  MOCK_TUTOR_PROMPT_TEMPLATE.replace('{{documentTitle}}', documentTitle).replace(
    '{{snippet}}',
    snippet,
  )

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
    let modelRunId: string
    let messageId: string
    try {
      createdAt = this.clock.now()
      sessionId = this.ids.generate()
      anchorId = this.ids.generate()
      modelRunId = this.ids.generate()
      messageId = this.ids.generate()
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
      messages: [
        {
          id: messageId,
          lessonId: sessionId,
          modelRunId,
          role: 'tutor',
          content: createMockTutorFirstQuestion(draft.documentTitle, draft.source.snippet),
          sourceAnchorIds: [anchorId],
          promptVersion: MOCK_TUTOR_PROMPT_VERSION,
          createdAt,
        },
      ],
      modelRuns: [
        {
          id: modelRunId,
          lessonId: sessionId,
          providerId: null,
          modelName: 'mock-local',
          operation: 'lesson_tutor_first_question',
          status: 'succeeded',
          promptManifest: MOCK_TUTOR_PROMPT_MANIFEST,
          inputSummary: {
            documentId: draft.documentId,
            documentTitle: draft.documentTitle,
            sourceAnchorIds: [anchorId],
            sourceCharacterRange: {
              startOffset: draft.source.startOffset,
              endOffset: draft.source.endOffset,
            },
            snippetCharacterCount: draft.source.snippet.length,
          },
          sourceAnchorIds: [anchorId],
          outputMessageId: messageId,
          startedAt: createdAt,
          finishedAt: createdAt,
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
