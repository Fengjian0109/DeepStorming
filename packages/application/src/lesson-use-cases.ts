import {
  normalizeLessonStartDraft,
  type LessonPromptManifest,
  type LessonReplyDraft,
  type LessonRunRetryDraft,
  type LessonSession,
  type LessonStartDraft,
} from '@deepstorming/domain'
import type { ClockPort, DocumentRepositoryPort, IdGeneratorPort } from './document-ports'
import type {
  LessonRepositoryPort,
  LessonTutorReplyRequest,
  LessonTutorReplyGeneratorPort,
  LessonTutorReplyResult,
  StoredLessonSession,
} from './lesson-ports'
import type {
  CancellationToken,
  ProviderGatewayFactoryPort,
  ProviderRepositoryPort,
  SecretVaultPort,
} from './provider-ports'
import { toProviderProfile } from './provider-use-cases'

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
const MOCK_TUTOR_FOLLOW_UP_PROMPT_TEMPLATE =
  '你刚才提到：“{{learnerReply}}”。我们把它和证据“{{snippet}}”连起来：下一步你会如何验证这个判断？'
const MOCK_TUTOR_FOLLOW_UP_PROMPT_MANIFEST: LessonPromptManifest = {
  key: 'lesson.mockTutor.followUp',
  version: 1,
  hash: 'sha256:e9fdc89091ea362a238d87daa6f1fd75a8866698de8a9094e786414f5d3863f8',
}
const MOCK_TUTOR_FOLLOW_UP_PROMPT_VERSION = 'mock-tutor-follow-up-v1'
const LEARNER_INPUT_PROMPT_VERSION = 'learner-input-v1'

const createMockTutorFirstQuestion = (documentTitle: string, snippet: string): string =>
  MOCK_TUTOR_PROMPT_TEMPLATE.replace('{{documentTitle}}', documentTitle).replace(
    '{{snippet}}',
    snippet,
  )

const createMockTutorFollowUp = (learnerReply: string, snippet: string): string =>
  MOCK_TUTOR_FOLLOW_UP_PROMPT_TEMPLATE.replace('{{learnerReply}}', learnerReply).replace(
    '{{snippet}}',
    snippet,
  )

const localTutorReply = (learnerReply: string, snippet: string): LessonTutorReplyResult => ({
  content: createMockTutorFollowUp(learnerReply, snippet),
  providerId: null,
  modelName: 'mock-local',
})

const liveToken = (): CancellationToken => ({
  cancelled: false,
  onCancel: () => () => undefined,
})

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu

const normalizeLessonReplyDraft = (draft: LessonReplyDraft): LessonReplyDraft => {
  if (!UUID.test(draft.lessonId)) throw new Error('Lesson id is invalid')
  const content = draft.content.trim()
  if (content.length === 0) throw new Error('Lesson reply must not be blank')
  if (content.length > 1_000) throw new Error('Lesson reply is too long')
  return { lessonId: draft.lessonId, content }
}

const normalizeLessonRunRetryDraft = (draft: LessonRunRetryDraft): LessonRunRetryDraft => {
  if (!UUID.test(draft.lessonId)) throw new Error('Lesson id is invalid')
  if (!UUID.test(draft.modelRunId)) throw new Error('Lesson model run id is invalid')
  return draft
}

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

const generateTutorReply = async (
  generator: LessonTutorReplyGeneratorPort | undefined,
  input: LessonTutorReplyRequest,
): Promise<LessonTutorReplyResult> => {
  if (generator === undefined) return localTutorReply(input.learnerReply, input.sourceSnippet)
  try {
    return await generator.generateFollowUp(input)
  } catch (error) {
    throw asInternalError(error)
  }
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

export class SubmitLessonReply {
  public constructor(
    private readonly lessons: LessonRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
    private readonly tutorReplyGenerator?: LessonTutorReplyGeneratorPort,
  ) {}

  public async execute(input: LessonReplyDraft): Promise<LessonSession> {
    let draft: LessonReplyDraft
    try {
      draft = normalizeLessonReplyDraft(input)
    } catch (error) {
      throw validationError(error)
    }

    let session: StoredLessonSession | undefined
    try {
      session = await this.lessons.findById(draft.lessonId)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (!session)
      throw new LessonUseCaseError('LESSON_NOT_FOUND', 'The lesson was not found.', false)

    const anchor = session.sourceAnchors[0]
    if (anchor === undefined) throw internalError()

    let createdAt: string
    let learnerMessageId: string
    let modelRunId: string
    let tutorMessageId: string
    try {
      createdAt = this.clock.now()
      learnerMessageId = this.ids.generate()
      modelRunId = this.ids.generate()
      tutorMessageId = this.ids.generate()
    } catch (error) {
      throw asInternalError(error)
    }
    const tutorReply = await generateTutorReply(this.tutorReplyGenerator, {
      documentTitle: session.documentTitle,
      sourceSnippet: anchor.snippet,
      learnerReply: draft.content,
    })

    const updated: StoredLessonSession = {
      ...session,
      messages: [
        ...session.messages,
        {
          id: learnerMessageId,
          lessonId: session.id,
          modelRunId: null,
          role: 'learner',
          content: draft.content,
          sourceAnchorIds: [],
          promptVersion: LEARNER_INPUT_PROMPT_VERSION,
          createdAt,
        },
        {
          id: tutorMessageId,
          lessonId: session.id,
          modelRunId,
          role: 'tutor',
          content: tutorReply.content,
          sourceAnchorIds: [anchor.id],
          promptVersion: MOCK_TUTOR_FOLLOW_UP_PROMPT_VERSION,
          createdAt,
        },
      ],
      modelRuns: [
        ...session.modelRuns,
        {
          id: modelRunId,
          lessonId: session.id,
          providerId: tutorReply.providerId,
          modelName: tutorReply.modelName,
          operation: 'lesson_tutor_follow_up',
          status: 'succeeded',
          promptManifest: MOCK_TUTOR_FOLLOW_UP_PROMPT_MANIFEST,
          inputSummary: {
            documentId: session.documentId,
            documentTitle: session.documentTitle,
            sourceAnchorIds: [anchor.id],
            sourceCharacterRange: {
              startOffset: anchor.startOffset,
              endOffset: anchor.endOffset,
            },
            snippetCharacterCount: anchor.snippet.length,
            learnerReplyCharacterCount: draft.content.length,
          },
          sourceAnchorIds: [anchor.id],
          outputMessageId: tutorMessageId,
          startedAt: createdAt,
          finishedAt: createdAt,
        },
      ],
      updatedAt: createdAt,
    }

    try {
      return toView(await this.lessons.save(updated))
    } catch (error) {
      throw asDatabaseError(error)
    }
  }
}

export class RetryLessonRun {
  public constructor(
    private readonly lessons: LessonRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
    private readonly tutorReplyGenerator?: LessonTutorReplyGeneratorPort,
  ) {}

  public async execute(input: LessonRunRetryDraft): Promise<LessonSession> {
    let draft: LessonRunRetryDraft
    try {
      draft = normalizeLessonRunRetryDraft(input)
    } catch (error) {
      throw validationError(error)
    }

    let session: StoredLessonSession | undefined
    try {
      session = await this.lessons.findById(draft.lessonId)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (!session)
      throw new LessonUseCaseError('LESSON_NOT_FOUND', 'The lesson was not found.', false)

    const modelRun = session.modelRuns.find((run) => run.id === draft.modelRunId)
    if (modelRun === undefined) {
      throw validationError(new Error('Lesson model run was not found.'))
    }
    if (modelRun.status !== 'failed' && modelRun.status !== 'cancelled') {
      throw validationError(new Error('Lesson model run cannot be retried.'))
    }

    const learnerMessage = [...session.messages]
      .reverse()
      .find((message) => message.role === 'learner')
    if (learnerMessage === undefined) {
      throw validationError(new Error('A learner reply is required before retrying a lesson run.'))
    }

    const anchorId = modelRun.sourceAnchorIds[0]
    const anchor =
      session.sourceAnchors.find((sourceAnchor) => sourceAnchor.id === anchorId) ??
      session.sourceAnchors[0]
    if (anchor === undefined) throw internalError()

    let createdAt: string
    let modelRunId: string
    let tutorMessageId: string
    try {
      createdAt = this.clock.now()
      modelRunId = this.ids.generate()
      tutorMessageId = this.ids.generate()
    } catch (error) {
      throw asInternalError(error)
    }
    const tutorReply = await generateTutorReply(this.tutorReplyGenerator, {
      documentTitle: session.documentTitle,
      sourceSnippet: anchor.snippet,
      learnerReply: learnerMessage.content,
    })

    const updated: StoredLessonSession = {
      ...session,
      messages: [
        ...session.messages,
        {
          id: tutorMessageId,
          lessonId: session.id,
          modelRunId,
          role: 'tutor',
          content: tutorReply.content,
          sourceAnchorIds: [anchor.id],
          promptVersion: MOCK_TUTOR_FOLLOW_UP_PROMPT_VERSION,
          createdAt,
        },
      ],
      modelRuns: [
        ...session.modelRuns,
        {
          id: modelRunId,
          lessonId: session.id,
          providerId: tutorReply.providerId,
          modelName: tutorReply.modelName,
          operation: 'lesson_tutor_follow_up',
          status: 'succeeded',
          promptManifest: MOCK_TUTOR_FOLLOW_UP_PROMPT_MANIFEST,
          inputSummary: {
            documentId: session.documentId,
            documentTitle: session.documentTitle,
            sourceAnchorIds: [anchor.id],
            sourceCharacterRange: {
              startOffset: anchor.startOffset,
              endOffset: anchor.endOffset,
            },
            snippetCharacterCount: anchor.snippet.length,
            learnerReplyCharacterCount: learnerMessage.content.length,
          },
          sourceAnchorIds: [anchor.id],
          outputMessageId: tutorMessageId,
          startedAt: createdAt,
          finishedAt: createdAt,
        },
      ],
      updatedAt: createdAt,
    }

    try {
      return toView(await this.lessons.save(updated))
    } catch (error) {
      throw asDatabaseError(error)
    }
  }
}

export class ProviderLessonTutorReplyGenerator implements LessonTutorReplyGeneratorPort {
  public constructor(
    private readonly providers: ProviderRepositoryPort,
    private readonly vault: SecretVaultPort,
    private readonly gatewayFactory: ProviderGatewayFactoryPort,
  ) {}

  public async generateFollowUp(input: LessonTutorReplyRequest): Promise<LessonTutorReplyResult> {
    let activeProvider
    try {
      activeProvider = (await this.providers.list()).find((provider) => provider.isActive)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (activeProvider === undefined) {
      return localTutorReply(input.learnerReply, input.sourceSnippet)
    }

    let apiKey: string | undefined
    if (activeProvider.providerType !== 'mock') {
      if (activeProvider.secretRef === undefined) throw internalError()
      try {
        apiKey = await this.vault.get(activeProvider.secretRef)
      } catch (error) {
        throw asInternalError(error)
      }
    }

    const gateway = this.gatewayFactory.create(toProviderProfile(activeProvider))
    const generated = await gateway.generateLessonTutorReply(
      apiKey === undefined
        ? {
            modelName: activeProvider.modelName,
            documentTitle: input.documentTitle,
            sourceSnippet: input.sourceSnippet,
            learnerReply: input.learnerReply,
          }
        : {
            modelName: activeProvider.modelName,
            apiKey,
            documentTitle: input.documentTitle,
            sourceSnippet: input.sourceSnippet,
            learnerReply: input.learnerReply,
          },
      liveToken(),
    )
    return {
      content: generated.content,
      providerId: activeProvider.id,
      modelName: activeProvider.modelName,
    }
  }
}
