import { beforeEach, describe, expect, it } from 'vitest'
import type { ProviderProfile } from '@deepstorming/domain'
import type { DocumentRepositoryPort, StoredDocumentDetail } from './document-ports'
import type {
  LessonRepositoryPort,
  LessonTutorReplyGeneratorPort,
  StoredLessonSession,
} from './lesson-ports'
import {
  GetLessonSession,
  LessonUseCaseError,
  ListLessonSessions,
  ProviderLessonTutorReplyGenerator,
  RetryLessonRun,
  StartLessonFromDocument,
  SubmitLessonReply,
} from './lesson-use-cases'
import type {
  CancellationToken,
  ProviderGatewayFactoryPort,
  ProviderGatewayPort,
  ProviderRepositoryPort,
  ProviderTestStatusTransitionResult,
  SecretVaultPort,
  StoredProvider,
} from './provider-ports'

const now = '2026-07-11T00:00:00.000Z'
const lessonId = '00000000-0000-4000-8000-000000000101'
const anchorId = '00000000-0000-4000-8000-000000000102'
const messageId = '00000000-0000-4000-8000-000000000103'
const modelRunId = '00000000-0000-4000-8000-000000000104'
const learnerMessageId = '00000000-0000-4000-8000-000000000105'
const followUpRunId = '00000000-0000-4000-8000-000000000106'
const followUpMessageId = '00000000-0000-4000-8000-000000000107'
const retryRunId = '00000000-0000-4000-8000-000000000108'
const retryMessageId = '00000000-0000-4000-8000-000000000109'
const documentId = '00000000-0000-4000-8000-000000000001'

const documentRecord: StoredDocumentDetail = {
  id: documentId,
  textVersionId: '00000000-0000-4000-8000-000000000002',
  documentType: 'generic',
  title: 'Paper Map',
  sourceKind: 'pasted_text',
  contentHash: 'hash',
  characterCount: 32,
  plainText: 'Why What How Evidence Limits Next',
  createdAt: now,
  updatedAt: now,
}

const activeProvider: StoredProvider = {
  id: '00000000-0000-4000-8000-000000000501',
  providerType: 'deepseek',
  displayName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
  secretRef: 'secret-ref',
  capabilities: {
    streaming: true,
    structuredOutput: true,
    embedding: false,
    vision: false,
  },
  isActive: true,
  createdAt: now,
  updatedAt: now,
  revision: 1,
}

class FakeDocumentRepository implements DocumentRepositoryPort {
  public document: StoredDocumentDetail | undefined = documentRecord
  public findByIdError?: Error

  async list() {
    return []
  }

  async findById() {
    if (this.findByIdError) throw this.findByIdError
    return this.document
  }

  async search() {
    return []
  }

  async create(document: StoredDocumentDetail) {
    return document
  }

  async remove() {
    return false
  }
}

class FakeLessonRepository implements LessonRepositoryPort {
  public records = new Map<string, StoredLessonSession>()
  public listError?: Error
  public findByIdError?: Error
  public createError?: Error

  async list(): Promise<readonly StoredLessonSession[]> {
    if (this.listError) throw this.listError
    return [...this.records.values()]
  }

  async findById(id: string): Promise<StoredLessonSession | undefined> {
    if (this.findByIdError) throw this.findByIdError
    return this.records.get(id)
  }

  async create(session: StoredLessonSession): Promise<StoredLessonSession> {
    if (this.createError) throw this.createError
    this.records.set(session.id, session)
    return session
  }

  async save(session: StoredLessonSession): Promise<StoredLessonSession> {
    if (this.createError) throw this.createError
    this.records.set(session.id, session)
    return session
  }
}

class FakeTutorReplyGenerator implements LessonTutorReplyGeneratorPort {
  public readonly calls: Array<{
    readonly documentTitle: string
    readonly sourceSnippet: string
    readonly learnerReply: string
  }> = []

  async generateFollowUp(input: {
    documentTitle: string
    sourceSnippet: string
    learnerReply: string
  }) {
    this.calls.push(input)
    return {
      content: `Provider 追问：${input.learnerReply} / ${input.sourceSnippet}`,
      providerId: '00000000-0000-4000-8000-000000000501',
      modelName: 'deepseek-chat',
    }
  }
}

class FakeProviderRepository implements ProviderRepositoryPort {
  public constructor(public providers: readonly StoredProvider[] = [activeProvider]) {}

  async list(): Promise<readonly StoredProvider[]> {
    return this.providers
  }

  async findById(): Promise<undefined> {
    return undefined
  }

  async findWriteOutcome(): Promise<undefined> {
    return undefined
  }

  async create(): Promise<never> {
    throw new Error('not used')
  }

  async update(): Promise<never> {
    throw new Error('not used')
  }

  async removeIfUnreferenced(): Promise<never> {
    throw new Error('not used')
  }

  async activate(): Promise<never> {
    throw new Error('not used')
  }

  async transitionTestStatus(): Promise<ProviderTestStatusTransitionResult> {
    throw new Error('not used')
  }

  async referencedSecretRefs(): Promise<ReadonlySet<string>> {
    return new Set()
  }
}

class FakeVault implements SecretVaultPort {
  public readonly refs: string[] = []

  async put(): Promise<never> {
    throw new Error('not used')
  }

  async get(ref: string): Promise<string> {
    this.refs.push(ref)
    return 'api-key'
  }

  async remove(): Promise<void> {}

  async reconcile(): Promise<void> {}
}

class FakeGateway implements ProviderGatewayPort {
  public readonly calls: Array<{
    readonly input: {
      readonly modelName: string
      readonly apiKey?: string
      readonly documentTitle: string
      readonly sourceSnippet: string
      readonly learnerReply: string
    }
    readonly token: CancellationToken
  }> = []

  async testConnection(): Promise<void> {}

  async generateLessonTutorReply(
    input: {
      modelName: string
      apiKey?: string
      documentTitle: string
      sourceSnippet: string
      learnerReply: string
    },
    token: CancellationToken,
  ) {
    this.calls.push({ input, token })
    return { content: 'Provider 追问' }
  }
}

class FakeGatewayFactory implements ProviderGatewayFactoryPort {
  public readonly gateway = new FakeGateway()
  public readonly providers: ProviderProfile[] = []

  create(provider: ProviderProfile): ProviderGatewayPort {
    this.providers.push(provider)
    return this.gateway
  }
}

describe('lesson use cases', () => {
  let documents: FakeDocumentRepository
  let lessons: FakeLessonRepository
  let idIndex: number
  const ids = [lessonId, anchorId, modelRunId, messageId]
  const clock = { now: () => now }
  const idGenerator = { generate: () => ids[idIndex++]! }

  beforeEach(() => {
    documents = new FakeDocumentRepository()
    lessons = new FakeLessonRepository()
    idIndex = 0
  })

  it('starts a lesson from a document source anchor', async () => {
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: {
        startOffset: 13,
        endOffset: 21,
        snippet: 'Evidence',
      },
    })

    expect(created).toEqual({
      id: lessonId,
      title: 'Paper Map 课堂',
      status: 'active',
      documentId,
      documentTitle: 'Paper Map',
      sourceAnchors: [
        {
          id: anchorId,
          documentId,
          startOffset: 13,
          endOffset: 21,
          snippet: 'Evidence',
        },
      ],
      messages: [
        {
          id: messageId,
          lessonId,
          modelRunId,
          role: 'tutor',
          content:
            '我们先从《Paper Map》的这段证据开始：Evidence\n\n你觉得它想解决的核心问题是什么？',
          sourceAnchorIds: [anchorId],
          promptVersion: 'mock-tutor-v1',
          createdAt: now,
        },
      ],
      modelRuns: [
        {
          id: modelRunId,
          lessonId,
          providerId: null,
          modelName: 'mock-local',
          operation: 'lesson_tutor_first_question',
          status: 'succeeded',
          promptManifest: {
            key: 'lesson.mockTutor.firstQuestion',
            version: 1,
            hash: 'sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff',
          },
          inputSummary: {
            documentId,
            documentTitle: 'Paper Map',
            sourceAnchorIds: [anchorId],
            sourceCharacterRange: { startOffset: 13, endOffset: 21 },
            snippetCharacterCount: 8,
          },
          sourceAnchorIds: [anchorId],
          outputMessageId: messageId,
          startedAt: now,
          finishedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    })
    expect(JSON.stringify(created)).not.toContain('plainText')
  })

  it('lists and gets stored lesson sessions', async () => {
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 0, endOffset: 3, snippet: 'Why' },
    })

    await expect(new ListLessonSessions(lessons).execute()).resolves.toEqual([created])
    await expect(new GetLessonSession(lessons).execute(created.id)).resolves.toEqual(created)
  })

  it('appends a learner reply and deterministic tutor follow-up', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(documents, lessons, clock, {
      generate: () => startIds[startIndex++]!,
    }).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0

    const updated = await new SubmitLessonReply(lessons, clock, {
      generate: () => replyIds[replyIndex++]!,
    }).execute({
      lessonId: created.id,
      content: '它在说明证据如何支撑判断。',
    })

    expect(updated.messages.slice(1)).toEqual([
      {
        id: learnerMessageId,
        lessonId,
        modelRunId: null,
        role: 'learner',
        content: '它在说明证据如何支撑判断。',
        sourceAnchorIds: [],
        promptVersion: 'learner-input-v1',
        createdAt: now,
      },
      {
        id: followUpMessageId,
        lessonId,
        modelRunId: followUpRunId,
        role: 'tutor',
        content:
          '你刚才提到：“它在说明证据如何支撑判断。”。我们把它和证据“Evidence”连起来：下一步你会如何验证这个判断？',
        sourceAnchorIds: [anchorId],
        promptVersion: 'mock-tutor-follow-up-v1',
        createdAt: now,
      },
    ])
    expect(updated.modelRuns.at(-1)).toEqual({
      id: followUpRunId,
      lessonId,
      providerId: null,
      modelName: 'mock-local',
      operation: 'lesson_tutor_follow_up',
      status: 'succeeded',
      promptManifest: {
        key: 'lesson.mockTutor.followUp',
        version: 1,
        hash: 'sha256:e9fdc89091ea362a238d87daa6f1fd75a8866698de8a9094e786414f5d3863f8',
      },
      inputSummary: {
        documentId,
        documentTitle: 'Paper Map',
        sourceAnchorIds: [anchorId],
        sourceCharacterRange: { startOffset: 13, endOffset: 21 },
        snippetCharacterCount: 8,
        learnerReplyCharacterCount: 13,
      },
      sourceAnchorIds: [anchorId],
      outputMessageId: followUpMessageId,
      startedAt: now,
      finishedAt: now,
    })
    expect(JSON.stringify(updated)).not.toContain('plainText')
  })

  it('uses an injected tutor generator for follow-up content and model metadata', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(documents, lessons, clock, {
      generate: () => startIds[startIndex++]!,
    }).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0
    const generator = new FakeTutorReplyGenerator()

    const updated = await new SubmitLessonReply(
      lessons,
      clock,
      { generate: () => replyIds[replyIndex++]! },
      generator,
    ).execute({
      lessonId: created.id,
      content: '它在说明证据如何支撑判断。',
    })

    expect(generator.calls).toEqual([
      {
        documentTitle: 'Paper Map',
        sourceSnippet: 'Evidence',
        learnerReply: '它在说明证据如何支撑判断。',
      },
    ])
    expect(updated.messages.at(-1)).toMatchObject({
      id: followUpMessageId,
      content: 'Provider 追问：它在说明证据如何支撑判断。 / Evidence',
      modelRunId: followUpRunId,
    })
    expect(updated.modelRuns.at(-1)).toMatchObject({
      id: followUpRunId,
      providerId: '00000000-0000-4000-8000-000000000501',
      modelName: 'deepseek-chat',
      status: 'succeeded',
      outputMessageId: followUpMessageId,
    })
  })

  it('generates tutor replies through the active provider gateway', async () => {
    const providers = new FakeProviderRepository()
    const vault = new FakeVault()
    const factory = new FakeGatewayFactory()

    const result = await new ProviderLessonTutorReplyGenerator(
      providers,
      vault,
      factory,
    ).generateFollowUp({
      documentTitle: 'Paper Map',
      sourceSnippet: 'Evidence',
      learnerReply: '它在说明证据如何支撑判断。',
    })

    expect(result).toEqual({
      content: 'Provider 追问',
      providerId: activeProvider.id,
      modelName: 'deepseek-chat',
    })
    expect(vault.refs).toEqual(['secret-ref'])
    expect(factory.providers).toEqual([
      expect.objectContaining({
        id: activeProvider.id,
        hasApiKey: true,
        modelName: 'deepseek-chat',
      }),
    ])
    expect(factory.gateway.calls).toEqual([
      {
        input: {
          modelName: 'deepseek-chat',
          apiKey: 'api-key',
          documentTitle: 'Paper Map',
          sourceSnippet: 'Evidence',
          learnerReply: '它在说明证据如何支撑判断。',
        },
        token: expect.objectContaining({ cancelled: false }),
      },
    ])
  })

  it('retries a failed tutor run with a deterministic follow-up', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(documents, lessons, clock, {
      generate: () => startIds[startIndex++]!,
    }).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0
    const replied = await new SubmitLessonReply(lessons, clock, {
      generate: () => replyIds[replyIndex++]!,
    }).execute({
      lessonId: created.id,
      content: '它在说明证据如何支撑判断。',
    })
    lessons.records.set(lessonId, {
      ...replied,
      modelRuns: replied.modelRuns.map((run) =>
        run.id === followUpRunId
          ? { ...run, status: 'failed' as const, outputMessageId: null, finishedAt: now }
          : run,
      ),
      messages: replied.messages.filter((message) => message.id !== followUpMessageId),
    })
    const retryIds = [retryRunId, retryMessageId]
    let retryIndex = 0

    const retried = await new RetryLessonRun(lessons, clock, {
      generate: () => retryIds[retryIndex++]!,
    }).execute({ lessonId, modelRunId: followUpRunId })

    expect(retried.messages.at(-1)).toEqual({
      id: retryMessageId,
      lessonId,
      modelRunId: retryRunId,
      role: 'tutor',
      content:
        '你刚才提到：“它在说明证据如何支撑判断。”。我们把它和证据“Evidence”连起来：下一步你会如何验证这个判断？',
      sourceAnchorIds: [anchorId],
      promptVersion: 'mock-tutor-follow-up-v1',
      createdAt: now,
    })
    expect(retried.modelRuns.at(-1)).toMatchObject({
      id: retryRunId,
      lessonId,
      operation: 'lesson_tutor_follow_up',
      status: 'succeeded',
      outputMessageId: retryMessageId,
    })
    expect(retried.modelRuns.find((run) => run.id === followUpRunId)).toMatchObject({
      status: 'failed',
      outputMessageId: null,
    })
  })

  it('rejects retrying completed tutor runs', async () => {
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })

    await expect(
      new RetryLessonRun(lessons, clock, idGenerator).execute({
        lessonId: created.id,
        modelRunId,
      }),
    ).rejects.toMatchObject({
      code: 'LESSON_VALIDATION_FAILED',
      retryable: false,
    })
  })

  it('maps missing documents to LESSON_DOCUMENT_NOT_FOUND', async () => {
    documents.document = undefined

    await expect(
      new StartLessonFromDocument(documents, lessons, clock, idGenerator).execute({
        documentId,
        documentTitle: 'Paper Map',
        source: { startOffset: 0, endOffset: 3, snippet: 'Why' },
      }),
    ).rejects.toMatchObject({
      code: 'LESSON_DOCUMENT_NOT_FOUND',
      retryable: false,
    })
  })

  it('maps storage failures to DATABASE_UNAVAILABLE', async () => {
    lessons.listError = new Error('db unavailable')

    await expect(new ListLessonSessions(lessons).execute()).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
      retryable: true,
    })
  })

  it('exposes stable lesson errors', () => {
    const error = new LessonUseCaseError('LESSON_NOT_FOUND', 'Missing.', false)
    expect(error.code).toBe('LESSON_NOT_FOUND')
    expect(error.message).toBe('Missing.')
    expect(error.retryable).toBe(false)
  })
})
