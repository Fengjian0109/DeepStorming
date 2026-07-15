import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_CLASSROOM_PREFERENCES,
  type PaperReadingStage,
  type ProviderProfile,
} from '@deepstorming/domain'
import type {
  DocumentFigureRepositoryPort,
  DocumentRepositoryPort,
  StoredDocumentDetail,
} from './document-ports'
import type {
  DocumentSourceLocatorPort,
  LessonRepositoryPort,
  LessonTutorReplyGeneratorPort,
  StoredLessonSession,
} from './lesson-ports'
import type { StoredDocumentTextBlock } from './document-ports'
import {
  CancelLessonRun,
  GetLessonSession,
  LessonUseCaseError,
  LessonRunOperations,
  ListLessonSessions,
  ProviderLessonTutorReplyGenerator,
  RecordReviewEvent,
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
const evidenceId = '00000000-0000-4000-8000-000000000110'
const signalId = '00000000-0000-4000-8000-000000000111'
const retryEvidenceId = '00000000-0000-4000-8000-000000000112'
const reviewItemId = '00000000-0000-4000-8000-000000000113'
const reviewEventId = '00000000-0000-4000-8000-000000000114'
const documentId = '00000000-0000-4000-8000-000000000001'
const operationId = '00000000-0000-4000-8000-000000000701'

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

class FakeSourceLocator implements DocumentSourceLocatorPort {
  public block: StoredDocumentTextBlock | undefined

  async findTextBlock() {
    return this.block
  }
}

class FakeLessonContextAssembler {
  public readonly calls: Array<{
    readonly documentId: string
    readonly query: string
    readonly fallbackSnippet: string
  }> = []

  public nextResult = {
    chunks: [] as Array<{
      readonly id: string
      readonly documentId: string
      readonly pageNumberStart: number
      readonly pageNumberEnd: number
      readonly blockIds: readonly string[]
      readonly text: string
      readonly charCount: number
      readonly sourceVersion: string
      readonly rebuildToken: string
    }>,
    degradedToSnippetOnly: false,
    snippetFallback: null as Readonly<{ snippet: string }> | null,
  }

  async execute(input: { documentId: string; query: string; fallbackSnippet: string }) {
    this.calls.push(input)
    return this.nextResult
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
  public readonly firstQuestionCalls: unknown[] = []
  public readonly calls: Array<{
    readonly documentTitle: string
    readonly sourceSnippet: string
    readonly contextChunks: readonly {
      readonly chunkId: string
      readonly text: string
      readonly pageNumberStart: number
      readonly pageNumberEnd: number
      readonly charCount: number
    }[]
    readonly learnerReply: string
  }> = []

  async generateFirstQuestion(
    input: {
      documentTitle: string
      sourceSnippet: string
      contextChunks: readonly unknown[]
    },
    _token: CancellationToken,
  ) {
    this.firstQuestionCalls.push(input)
    return {
      content: `Provider 首问：${input.sourceSnippet}`,
      providerId: '00000000-0000-4000-8000-000000000501',
      modelName: 'deepseek-chat',
    }
  }

  async generateFollowUp(
    input: {
      documentTitle: string
      sourceSnippet: string
      contextChunks: readonly {
        readonly chunkId: string
        readonly text: string
        readonly pageNumberStart: number
        readonly pageNumberEnd: number
        readonly charCount: number
      }[]
      learnerReply: string
    },
    _token: CancellationToken,
  ) {
    this.calls.push(input)
    return {
      content: `Provider 追问：${input.learnerReply} / ${input.sourceSnippet}`,
      providerId: '00000000-0000-4000-8000-000000000501',
      modelName: 'deepseek-chat',
    }
  }
}

class ObservingTutorReplyGenerator implements LessonTutorReplyGeneratorPort {
  public fail = false
  public cancel = false

  public constructor(private readonly observe: () => void) {}

  async generateFirstQuestion(_input: unknown, _token: CancellationToken) {
    return {
      content: 'Provider 首问',
      providerId: '00000000-0000-4000-8000-000000000501',
      modelName: 'deepseek-chat',
    }
  }

  async generateFollowUp(_input: unknown, token: CancellationToken) {
    this.observe()
    if (this.fail) throw new Error('provider failed')
    if (this.cancel) {
      token.onCancel(() => undefined)
      throw new LessonUseCaseError(
        'OPERATION_CANCELLED',
        'The lesson generation was cancelled.',
        false,
        {
          operationId,
        },
      )
    }
    return {
      content: 'Provider 追问',
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
  public firstQuestionContents: string[] = []
  public replyContents: string[] = []
  async generateLessonMemory(): Promise<{ content: string }> {
    throw new Error('not used')
  }
  public readonly calls: Array<{
    readonly input: {
      readonly modelName: string
      readonly apiKey?: string
      readonly documentTitle: string
      readonly sourceSnippet: string
      readonly lessonMode: 'standard' | 'paper'
      readonly paperStage?: PaperReadingStage | null
      readonly contextChunks: readonly {
        readonly chunkId: string
        readonly text: string
        readonly pageNumberStart: number
        readonly pageNumberEnd: number
        readonly charCount: number
      }[]
      readonly learnerReply?: string
      readonly availableFigures?: readonly Readonly<{
        figureId: string
        pageNumber: number
        label: string
        caption: string
      }>[]
      readonly repair?: Readonly<{ reason: string }>
    }
    readonly token: CancellationToken
  }> = []

  async testConnection(): Promise<void> {}

  async generateLessonTutorFirstQuestion(
    input: {
      modelName: string
      apiKey?: string
      documentTitle: string
      sourceSnippet: string
      lessonMode: 'standard' | 'paper'
      paperStage: PaperReadingStage | null
      contextChunks: readonly {
        readonly chunkId: string
        readonly text: string
        readonly pageNumberStart: number
        readonly pageNumberEnd: number
        readonly charCount: number
      }[]
    },
    token: CancellationToken,
  ) {
    this.calls.push({ input, token })
    return {
      content:
        this.firstQuestionContents.shift() ??
        JSON.stringify({
          narration: null,
          responseMarkdown: 'Provider 首问',
          citations: [],
          figureReferences: [],
        }),
    }
  }

  async generateLessonTutorReply(
    input: {
      modelName: string
      apiKey?: string
      documentTitle: string
      sourceSnippet: string
      lessonMode: 'standard' | 'paper'
      paperStage: PaperReadingStage | null
      contextChunks: readonly {
        readonly chunkId: string
        readonly text: string
        readonly pageNumberStart: number
        readonly pageNumberEnd: number
        readonly charCount: number
      }[]
      learnerReply: string
      repair?: Readonly<{ reason: string }>
    },
    token: CancellationToken,
  ) {
    this.calls.push({ input, token })
    return {
      content:
        this.replyContents.shift() ??
        JSON.stringify({
          narration: null,
          responseMarkdown: 'Provider 追问',
          citations: [],
          figureReferences: [],
        }),
    }
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

const createContextAssembler = () => new FakeLessonContextAssembler()
const createTutorGenerator = () => new FakeTutorReplyGenerator()

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
    const assembler = new FakeLessonContextAssembler()
    assembler.nextResult = {
      chunks: [
        {
          id: '00000000-0000-4000-8000-000000000901',
          documentId,
          pageNumberStart: 1,
          pageNumberEnd: 1,
          blockIds: ['block-1'],
          text: 'Why What How',
          charCount: 12,
          sourceVersion: 'text-version-1',
          rebuildToken: 'document.chunk.rebuild.v1',
        },
      ],
      degradedToSnippetOnly: false,
      snippetFallback: null,
    }
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
      undefined,
      assembler,
      createTutorGenerator(),
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
          content: 'Provider 首问：Evidence',
          sourceAnchorIds: [anchorId],
          promptVersion: 'mock-tutor-v1',
          createdAt: now,
        },
      ],
      modelRuns: [
        {
          id: modelRunId,
          lessonId,
          providerId: '00000000-0000-4000-8000-000000000501',
          modelName: 'deepseek-chat',
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
            contextCharacterCount: 12,
            contextChunks: [
              {
                chunkId: '00000000-0000-4000-8000-000000000901',
                pageNumberStart: 1,
                pageNumberEnd: 1,
                charCount: 12,
              },
            ],
          },
          sourceAnchorIds: [anchorId],
          outputMessageId: messageId,
          errorSummary: null,
          startedAt: now,
          finishedAt: now,
        },
      ],
      currentState: 'probing',
      steps: [
        {
          id: modelRunId,
          lessonId,
          sequenceNo: 0,
          stateBefore: 'opening',
          stateAfter: 'probing',
          actionType: 'ask',
          status: 'succeeded',
          modelRunId,
          messageId,
          rationale: 'Started with a source-grounded opening question.',
          errorSummary: null,
          createdAt: now,
          finishedAt: now,
        },
      ],
      masteryEvidence: [],
      misconceptionSignals: [],
      reviewItems: [],
      reviewEvents: [],
      lessonMode: 'standard',
      paperProfile: null,
      createdAt: now,
      updatedAt: now,
    })
    expect(assembler.calls).toEqual([
      {
        documentId,
        query: 'Evidence',
        fallbackSnippet: 'Evidence',
      },
    ])
    expect(JSON.stringify(created)).not.toContain('plainText')
  })

  it('starts paper documents in paper mode with orientation stage', async () => {
    documents.document = { ...documentRecord, documentType: 'paper' }

    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })

    expect(created.lessonMode).toBe('paper')
    expect(created.paperProfile?.currentStage).toBe('orientation')
    expect(created.modelRuns[0]?.promptManifest.key).toBe('lesson.paper.first_question')
  })

  it('freezes the selected tutor revision and pace into a new lesson', async () => {
    const tutorId = '00000000-0000-4000-8000-000000000201'
    const generator = createTutorGenerator()
    const settings = {
      getSnapshot: async () => ({
        userProfile: { displayName: '学习者', revision: 1, updatedAt: now },
        tutorProfiles: [
          {
            id: tutorId,
            revision: 3,
            status: 'active' as const,
            name: '苏格拉底导师',
            personality: '耐心、好奇',
            tone: '清晰、温和',
            expertiseTags: ['深度学习'],
            strictness: 3,
            socraticIntensity: 5,
            guidanceStyle: 'question_first' as const,
            bookStrategy: '逐层追问',
            paperStrategy: '检验论证',
            customInstructions: '优先要求学习者举证',
            promptVersion: 'tutor-profile-v3',
            createdAt: now,
            updatedAt: now,
          },
        ],
        classroomPreferences: {
          ...DEFAULT_CLASSROOM_PREFERENCES,
          defaultBookTutorId: tutorId,
          defaultPaperTutorId: tutorId,
        },
      }),
    }

    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
      undefined,
      createContextAssembler(),
      generator,
      settings,
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      tutorProfileId: tutorId,
      pace: 'slow',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })

    expect(created.pace).toBe('slow')
    expect(created.tutorSnapshot).toMatchObject({
      tutorProfileId: tutorId,
      tutorProfileRevision: 3,
      personality: '耐心、好奇',
      promptVersion: 'tutor-profile-v3',
    })
    expect(generator.firstQuestionCalls[0]).toMatchObject({
      pace: 'slow',
      tutorSnapshot: { tutorProfileId: tutorId, tutorProfileRevision: 3 },
    })
  })

  it('rejects explicit paper mode for non-paper documents', async () => {
    await expect(
      new StartLessonFromDocument(
        documents,
        lessons,
        clock,
        idGenerator,
        undefined,
        createContextAssembler(),
        createTutorGenerator(),
      ).execute({
        documentId,
        documentTitle: 'Paper Map',
        lessonMode: 'paper',
        source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
      }),
    ).rejects.toMatchObject({ code: 'LESSON_VALIDATION_FAILED' })
  })

  it('advances paper stage after a successful follow-up', async () => {
    documents.document = { ...documentRecord, documentType: 'paper' }
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })

    let replyIndex = 0
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId, evidenceId]
    const updated = await new SubmitLessonReply(
      lessons,
      clock,
      { generate: () => replyIds[replyIndex++]! },
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      lessonId: created.id,
      content: 'I think the paper is solving the gap between observed evidence and model behavior.',
    })

    expect(updated.paperProfile?.currentStage).toBe('problem_framing')
  })

  it('requires a PDF block to belong to the source document', async () => {
    const locator = new FakeSourceLocator()
    await expect(
      new StartLessonFromDocument(
        documents,
        lessons,
        clock,
        idGenerator,
        locator,
        createContextAssembler(),
        createTutorGenerator(),
      ).execute({
        documentId,
        documentTitle: 'Paper Map',
        source: {
          startOffset: 13,
          endOffset: 21,
          snippet: 'Evidence',
          target: { kind: 'pdf_block', pageNumber: 1, blockId: 'missing', blockIndex: 0 },
        },
      }),
    ).rejects.toMatchObject({ code: 'LESSON_SOURCE_NOT_FOUND' })
    expect(lessons.records.size).toBe(0)
  })

  it('lists and gets stored lesson sessions', async () => {
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 0, endOffset: 3, snippet: 'Why' },
    })

    await expect(new ListLessonSessions(lessons).execute()).resolves.toEqual([created])
    await expect(new GetLessonSession(lessons).execute(created.id)).resolves.toEqual(created)
  })

  it('preserves paper lesson metadata in lesson views', async () => {
    lessons.records.set(lessonId, {
      id: lessonId,
      title: 'Paper Map 课堂',
      status: 'active',
      documentId,
      documentTitle: 'Paper Map',
      sourceAnchors: [],
      messages: [],
      modelRuns: [],
      currentState: 'opening',
      steps: [],
      masteryEvidence: [],
      misconceptionSignals: [],
      reviewItems: [],
      reviewEvents: [],
      lessonMode: 'paper',
      paperProfile: {
        currentStage: 'orientation',
        stageSummary: null,
        termsIntroduced: [],
        citedAnchorIds: [],
      },
      createdAt: now,
      updatedAt: now,
    })

    await expect(new GetLessonSession(lessons).execute(lessonId)).resolves.toMatchObject({
      lessonMode: 'paper',
      paperProfile: {
        currentStage: 'orientation',
      },
    })
  })

  it('appends a learner reply and deterministic tutor follow-up', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId, evidenceId]
    let startIndex = 0
    const startAssembler = new FakeLessonContextAssembler()
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      startAssembler,
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0
    const replyAssembler = new FakeLessonContextAssembler()
    replyAssembler.nextResult = {
      chunks: [
        {
          id: '00000000-0000-4000-8000-000000000901',
          documentId,
          pageNumberStart: 1,
          pageNumberEnd: 1,
          blockIds: ['block-1'],
          text: 'Why What',
          charCount: 8,
          sourceVersion: 'text-version-1',
          rebuildToken: 'document.chunk.rebuild.v1',
        },
        {
          id: '00000000-0000-4000-8000-000000000902',
          documentId,
          pageNumberStart: 2,
          pageNumberEnd: 2,
          blockIds: ['block-2'],
          text: 'How Evidence',
          charCount: 12,
          sourceVersion: 'text-version-1',
          rebuildToken: 'document.chunk.rebuild.v1',
        },
      ],
      degradedToSnippetOnly: false,
      snippetFallback: null,
    }

    const updated = await new SubmitLessonReply(
      lessons,
      clock,
      { generate: () => replyIds[replyIndex++]! },
      replyAssembler,
      createTutorGenerator(),
    ).execute({
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
        content: 'Provider 追问：它在说明证据如何支撑判断。 / Evidence',
        sourceAnchorIds: [anchorId],
        promptVersion: 'mock-tutor-follow-up-v2',
        createdAt: now,
      },
    ])
    expect(updated.modelRuns.at(-1)).toEqual({
      id: followUpRunId,
      lessonId,
      providerId: '00000000-0000-4000-8000-000000000501',
      modelName: 'deepseek-chat',
      operation: 'lesson_tutor_follow_up',
      status: 'succeeded',
      promptManifest: {
        key: 'lesson.mockTutor.followUp',
        version: 2,
        hash: 'sha256:ad9d6476b98dc6a93a16144bb3ba2a79f7be4e9741176c1e564e0b02ab49265b',
      },
      inputSummary: {
        documentId,
        documentTitle: 'Paper Map',
        sourceAnchorIds: [anchorId],
        sourceCharacterRange: { startOffset: 13, endOffset: 21 },
        snippetCharacterCount: 8,
        contextCharacterCount: 20,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            pageNumberStart: 1,
            pageNumberEnd: 1,
            charCount: 8,
          },
          {
            chunkId: '00000000-0000-4000-8000-000000000902',
            pageNumberStart: 2,
            pageNumberEnd: 2,
            charCount: 12,
          },
        ],
        learnerReplyCharacterCount: 13,
      },
      sourceAnchorIds: [anchorId],
      outputMessageId: followUpMessageId,
      errorSummary: null,
      startedAt: now,
      finishedAt: now,
    })
    expect(updated.currentState).toBe('probing')
    expect(updated.steps.at(-1)).toMatchObject({
      id: followUpRunId,
      sequenceNo: 1,
      stateBefore: 'probing',
      stateAfter: 'probing',
      actionType: 'ask',
      status: 'succeeded',
      modelRunId: followUpRunId,
      messageId: followUpMessageId,
      rationale: 'Continue probing with source-grounded question.',
      errorSummary: null,
      finishedAt: now,
    })
    expect(replyAssembler.calls).toEqual([
      {
        documentId,
        query: `${created.messages[0]?.content}\n它在说明证据如何支撑判断。`,
        fallbackSnippet: 'Evidence',
      },
    ])
    expect(updated.masteryEvidence).toEqual([
      {
        id: evidenceId,
        lessonId,
        stepId: followUpRunId,
        learnerMessageId,
        tutorMessageId: followUpMessageId,
        kind: 'teach_back',
        judgement: 'partial_understanding',
        confidence: 0.55,
        rationale: 'Learner gave a source-grounded answer that can support follow-up.',
        suggestedReview: false,
        createdAt: now,
      },
    ])
    expect(updated.misconceptionSignals).toEqual([])
    expect(updated.reviewItems).toEqual([])
    expect(updated.reviewEvents).toEqual([])
    expect(JSON.stringify(updated)).not.toContain('plainText')
  })

  it('records insufficient evidence for a short non-stuck reply without misconception signals', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId, evidenceId, reviewItemId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0

    const updated = await new SubmitLessonReply(
      lessons,
      clock,
      { generate: () => replyIds[replyIndex++]! },
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      lessonId: created.id,
      content: '是的',
    })

    expect(updated.masteryEvidence).toEqual([
      {
        id: evidenceId,
        lessonId,
        stepId: followUpRunId,
        learnerMessageId,
        tutorMessageId: followUpMessageId,
        kind: 'teach_back',
        judgement: 'insufficient',
        confidence: 0.65,
        rationale: 'Learner reply was too short to show stable understanding.',
        suggestedReview: true,
        createdAt: now,
      },
    ])
    expect(updated.misconceptionSignals).toEqual([])
    expect(updated.reviewItems).toEqual([
      {
        id: reviewItemId,
        lessonId,
        masteryEvidenceId: evidenceId,
        misconceptionSignalId: null,
        prompt: '复习：请重新解释这段课堂证据，并说明你的判断依据。',
        answerOutline: ['Learner reply was too short to show stable understanding.'],
        status: 'active',
        dueAt: '2026-07-12T00:00:00.000Z',
        createdAt: now,
        updatedAt: now,
      },
    ])
    expect(updated.reviewEvents).toEqual([])
  })

  it('routes stuck learner replies into the hinting state', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [
      learnerMessageId,
      followUpRunId,
      followUpMessageId,
      evidenceId,
      signalId,
      reviewItemId,
    ]
    let startIndex = 0
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0

    const hinting = await new SubmitLessonReply(
      lessons,
      clock,
      { generate: () => replyIds[replyIndex++]! },
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      lessonId: created.id,
      content: '我不懂，卡住了。',
    })

    expect(hinting.currentState).toBe('hinting')
    expect(hinting.steps.at(-1)).toMatchObject({
      id: followUpRunId,
      actionType: 'hint',
      stateBefore: 'probing',
      stateAfter: 'hinting',
      status: 'succeeded',
    })
    expect(hinting.masteryEvidence).toEqual([
      {
        id: evidenceId,
        lessonId,
        stepId: followUpRunId,
        learnerMessageId,
        tutorMessageId: followUpMessageId,
        kind: 'stuck_signal',
        judgement: 'needs_review',
        confidence: 0.75,
        rationale: 'Learner explicitly signaled they are stuck or unsure.',
        suggestedReview: true,
        createdAt: now,
      },
    ])
    expect(hinting.misconceptionSignals).toEqual([
      {
        id: signalId,
        evidenceId,
        lessonId,
        label: '学习者表达卡住',
        severity: 'medium',
        rationale: 'Learner used language that indicates confusion or being stuck.',
        createdAt: now,
      },
    ])
    expect(hinting.reviewItems).toEqual([
      {
        id: reviewItemId,
        lessonId,
        masteryEvidenceId: evidenceId,
        misconceptionSignalId: signalId,
        prompt: '复习：学习者表达卡住。请重新解释这段证据想说明什么。',
        answerOutline: [
          'Learner explicitly signaled they are stuck or unsure.',
          'Learner used language that indicates confusion or being stuck.',
        ],
        status: 'active',
        dueAt: '2026-07-12T00:00:00.000Z',
        createdAt: now,
        updatedAt: now,
      },
    ])
    expect(hinting.reviewEvents).toEqual([])
  })

  it('records remembered reviews with a three-day next due date', async () => {
    lessons.records.set(lessonId, {
      id: lessonId,
      title: 'Paper Map 课堂',
      status: 'active',
      documentId,
      documentTitle: 'Paper Map',
      sourceAnchors: [],
      messages: [],
      modelRuns: [],
      currentState: 'probing',
      steps: [],
      masteryEvidence: [
        {
          id: evidenceId,
          lessonId,
          stepId: followUpRunId,
          learnerMessageId,
          tutorMessageId: followUpMessageId,
          kind: 'teach_back',
          judgement: 'insufficient',
          confidence: 0.65,
          rationale: 'Learner reply was too short to show stable understanding.',
          suggestedReview: true,
          createdAt: now,
        },
      ],
      misconceptionSignals: [],
      reviewItems: [
        {
          id: reviewItemId,
          lessonId,
          masteryEvidenceId: evidenceId,
          misconceptionSignalId: null,
          prompt: '复习：请重新解释这段课堂证据，并说明你的判断依据。',
          answerOutline: ['Learner reply was too short to show stable understanding.'],
          status: 'active',
          dueAt: '2026-07-12T00:00:00.000Z',
          createdAt: now,
          updatedAt: now,
        },
      ],
      reviewEvents: [],
      lessonMode: 'standard',
      paperProfile: null,
      createdAt: now,
      updatedAt: now,
    })

    const result = await new RecordReviewEvent(lessons, clock, {
      generate: () => reviewEventId,
    }).execute({
      lessonId,
      reviewItemId,
      rating: 'remembered',
      response: 'I can explain the evidence and the rationale clearly now.',
    })

    expect(result.reviewEvents.at(-1)).toEqual({
      id: reviewEventId,
      reviewItemId,
      lessonId,
      rating: 'remembered',
      response: 'I can explain the evidence and the rationale clearly now.',
      previousDueAt: '2026-07-12T00:00:00.000Z',
      nextDueAt: '2026-07-14T00:00:00.000Z',
      reviewedAt: now,
      createdAt: now,
    })
    expect(result.reviewItems).toEqual([
      {
        id: reviewItemId,
        lessonId,
        masteryEvidenceId: evidenceId,
        misconceptionSignalId: null,
        prompt: '复习：请重新解释这段课堂证据，并说明你的判断依据。',
        answerOutline: ['Learner reply was too short to show stable understanding.'],
        status: 'active',
        dueAt: '2026-07-14T00:00:00.000Z',
        createdAt: now,
        updatedAt: now,
      },
    ])
  })

  it('passes assembled chunk text to the AI tutor follow-up', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId, evidenceId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0
    const replyAssembler = new FakeLessonContextAssembler()
    replyAssembler.nextResult = {
      chunks: [
        {
          id: '00000000-0000-4000-8000-000000000901',
          documentId,
          pageNumberStart: 1,
          pageNumberEnd: 1,
          blockIds: ['block-1'],
          text: 'Context A',
          charCount: 9,
          sourceVersion: 'text-version-1',
          rebuildToken: 'document.chunk.rebuild.v1',
        },
      ],
      degradedToSnippetOnly: false,
      snippetFallback: null,
    }

    const generator = createTutorGenerator()
    const updated = await new SubmitLessonReply(
      lessons,
      clock,
      { generate: () => replyIds[replyIndex++]! },
      replyAssembler,
      generator,
    ).execute({
      lessonId: created.id,
      content: '它在说明证据如何支撑判断。',
    })

    expect(updated.messages.at(-1)).toMatchObject({
      id: followUpMessageId,
      content: 'Provider 追问：它在说明证据如何支撑判断。 / Evidence',
    })
    expect(generator.calls[0]?.contextChunks[0]?.text).toBe('Context A')
    expect(updated.modelRuns.at(-1)?.inputSummary.contextChunks).toEqual([
      {
        chunkId: '00000000-0000-4000-8000-000000000901',
        pageNumberStart: 1,
        pageNumberEnd: 1,
        charCount: 9,
      },
    ])
  })

  it('degrades stale lesson context to snippet-only without aborting lesson start', async () => {
    const assembler = new FakeLessonContextAssembler()
    assembler.nextResult = {
      chunks: [],
      degradedToSnippetOnly: true,
      snippetFallback: { snippet: 'Evidence' },
    }

    const degraded = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
      undefined,
      assembler,
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })

    expect(assembler.calls).toEqual([
      {
        documentId,
        query: 'Evidence',
        fallbackSnippet: 'Evidence',
      },
    ])
    expect(degraded.modelRuns[0]?.inputSummary.contextChunks).toEqual([])
    expect(degraded.modelRuns[0]?.inputSummary.contextCharacterCount).toBe(0)
  })

  it('uses an injected tutor generator for follow-up content and model metadata', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId, evidenceId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
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
      createContextAssembler(),
      generator,
    ).execute({
      lessonId: created.id,
      content: '它在说明证据如何支撑判断。',
    })

    expect(generator.calls).toEqual([
      {
        documentId,
        documentTitle: 'Paper Map',
        sourceSnippet: 'Evidence',
        lessonMode: 'standard',
        paperStage: null,
        contextChunks: [],
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

  it('uses the provider-backed generator for first questions with assembled chunk context', async () => {
    const assembler = new FakeLessonContextAssembler()
    assembler.nextResult = {
      chunks: [
        {
          id: '00000000-0000-4000-8000-000000000901',
          documentId,
          pageNumberStart: 1,
          pageNumberEnd: 2,
          blockIds: ['block-1'],
          text: 'Why What How',
          charCount: 12,
          sourceVersion: 'text-version-1',
          rebuildToken: 'document.chunk.rebuild.v1',
        },
      ],
      degradedToSnippetOnly: false,
      snippetFallback: null,
    }
    const providers = new FakeProviderRepository()
    const vault = new FakeVault()
    const factory = new FakeGatewayFactory()

    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
      undefined,
      assembler,
      new ProviderLessonTutorReplyGenerator(providers, vault, factory),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })

    expect(created.messages[0]).toMatchObject({
      id: messageId,
      content: 'Provider 首问',
      modelRunId,
    })
    expect(created.modelRuns[0]).toMatchObject({
      id: modelRunId,
      providerId: activeProvider.id,
      modelName: 'deepseek-chat',
      inputSummary: {
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            pageNumberStart: 1,
            pageNumberEnd: 2,
            charCount: 12,
          },
        ],
        contextCharacterCount: 12,
      },
    })
    expect(factory.gateway.calls[0]).toEqual({
      input: {
        modelName: 'deepseek-chat',
        apiKey: 'api-key',
        documentTitle: 'Paper Map',
        sourceSnippet: 'Evidence',
        lessonMode: 'standard',
        paperStage: null,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            text: 'Why What How',
            pageNumberStart: 1,
            pageNumberEnd: 2,
            charCount: 12,
          },
        ],
      },
      token: expect.objectContaining({ cancelled: false }),
    })
  })

  it('passes paper lesson context into provider-backed first questions', async () => {
    documents.document = { ...documentRecord, documentType: 'paper' }
    const providers = new FakeProviderRepository()
    const vault = new FakeVault()
    const factory = new FakeGatewayFactory()

    await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
      undefined,
      createContextAssembler(),
      new ProviderLessonTutorReplyGenerator(providers, vault, factory),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })

    expect(factory.gateway.calls[0]?.input).toMatchObject({
      documentTitle: 'Paper Map',
      sourceSnippet: 'Evidence',
      lessonMode: 'paper',
      paperStage: 'orientation',
    })
  })

  it('persists a started provider run before requesting a tutor follow-up', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId, evidenceId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0
    const generator = new ObservingTutorReplyGenerator(() => {
      const pending = lessons.records.get(lessonId)
      expect(pending?.messages.at(-1)).toMatchObject({
        id: learnerMessageId,
        role: 'learner',
        content: '它在说明证据如何支撑判断。',
      })
      expect(pending?.messages.some((message) => message.id === followUpMessageId)).toBe(false)
      expect(pending?.modelRuns.at(-1)).toMatchObject({
        id: followUpRunId,
        providerId: null,
        modelName: 'pending-ai',
        status: 'started',
        outputMessageId: null,
        errorSummary: null,
        finishedAt: null,
      })
    })

    const updated = await new SubmitLessonReply(
      lessons,
      clock,
      { generate: () => replyIds[replyIndex++]! },
      createContextAssembler(),
      generator,
    ).execute({
      lessonId: created.id,
      content: '它在说明证据如何支撑判断。',
    })

    expect(updated.messages.at(-1)).toMatchObject({
      id: followUpMessageId,
      content: 'Provider 追问',
    })
    expect(updated.modelRuns.at(-1)).toMatchObject({
      id: followUpRunId,
      providerId: '00000000-0000-4000-8000-000000000501',
      modelName: 'deepseek-chat',
      status: 'succeeded',
      outputMessageId: followUpMessageId,
      errorSummary: null,
      finishedAt: now,
    })
  })

  it('persists a failed provider run when tutor follow-up generation fails', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0
    const generator = new ObservingTutorReplyGenerator(() => undefined)
    generator.fail = true

    await expect(
      new SubmitLessonReply(
        lessons,
        clock,
        { generate: () => replyIds[replyIndex++]! },
        createContextAssembler(),
        generator,
      ).execute({
        lessonId: created.id,
        content: '它在说明证据如何支撑判断。',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR', retryable: true })

    const failed = lessons.records.get(lessonId)
    expect(failed?.messages.at(-1)).toMatchObject({
      id: learnerMessageId,
      role: 'learner',
    })
    expect(failed?.messages.some((message) => message.id === followUpMessageId)).toBe(false)
    expect(failed?.modelRuns.at(-1)).toMatchObject({
      id: followUpRunId,
      status: 'failed',
      outputMessageId: null,
      errorSummary: {
        code: 'INTERNAL_ERROR',
        message: 'The lesson operation could not be completed.',
        retryable: true,
      },
      finishedAt: now,
    })
    expect(failed?.currentState).toBe('probing')
    expect(failed?.steps.at(-1)).toMatchObject({
      id: followUpRunId,
      stateBefore: 'probing',
      stateAfter: 'probing',
      actionType: 'ask',
      status: 'failed',
      modelRunId: followUpRunId,
      messageId: null,
      errorSummary: {
        code: 'INTERNAL_ERROR',
        message: 'The lesson operation could not be completed.',
        retryable: true,
      },
      finishedAt: now,
    })
    expect(failed?.masteryEvidence).toEqual([])
    expect(failed?.misconceptionSignals).toEqual([])
  })

  it('cancels an in-flight provider reply and persists the run as cancelled', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0
    const operations = new LessonRunOperations()
    const cancel = new CancelLessonRun(operations)
    const generator = new ObservingTutorReplyGenerator(() => {
      expect(cancel.execute({ operationId })).toEqual({ cancelled: true })
    })
    generator.cancel = true

    await expect(
      new SubmitLessonReply(
        lessons,
        clock,
        { generate: () => replyIds[replyIndex++]! },
        createContextAssembler(),
        generator,
        operations,
      ).execute({
        lessonId: created.id,
        content: '它在说明证据如何支撑判断。',
        operationId,
      }),
    ).rejects.toMatchObject({
      code: 'OPERATION_CANCELLED',
      retryable: false,
      details: { operationId },
    })

    expect(cancel.execute({ operationId })).toEqual({ cancelled: false })
    const cancelled = lessons.records.get(lessonId)
    expect(cancelled?.messages.at(-1)).toMatchObject({
      id: learnerMessageId,
      role: 'learner',
    })
    expect(cancelled?.messages.some((message) => message.id === followUpMessageId)).toBe(false)
    expect(cancelled?.modelRuns.at(-1)).toMatchObject({
      id: followUpRunId,
      status: 'cancelled',
      outputMessageId: null,
      errorSummary: {
        code: 'OPERATION_CANCELLED',
        message: 'The lesson generation was cancelled.',
        retryable: false,
      },
      finishedAt: now,
    })
    expect(cancelled?.currentState).toBe('probing')
    expect(cancelled?.steps.at(-1)).toMatchObject({
      id: followUpRunId,
      stateBefore: 'probing',
      stateAfter: 'probing',
      actionType: 'ask',
      status: 'cancelled',
      modelRunId: followUpRunId,
      messageId: null,
      errorSummary: {
        code: 'OPERATION_CANCELLED',
        message: 'The lesson generation was cancelled.',
        retryable: false,
      },
      finishedAt: now,
    })
    expect(cancelled?.masteryEvidence).toEqual([])
    expect(cancelled?.misconceptionSignals).toEqual([])
  })

  it('generates tutor replies through the active provider gateway', async () => {
    const providers = new FakeProviderRepository()
    const vault = new FakeVault()
    const factory = new FakeGatewayFactory()

    const result = await new ProviderLessonTutorReplyGenerator(
      providers,
      vault,
      factory,
    ).generateFollowUp(
      {
        documentId,
        documentTitle: 'Paper Map',
        sourceSnippet: 'Evidence',
        lessonMode: 'standard',
        paperStage: null,
        contextChunks: [],
        learnerReply: '它在说明证据如何支撑判断。',
      },
      { cancelled: false, onCancel: () => () => undefined },
    )

    expect(result).toEqual({
      content: 'Provider 追问',
      providerId: activeProvider.id,
      modelName: 'deepseek-chat',
      tutorTurn: {
        narration: null,
        responseMarkdown: 'Provider 追问',
        citations: [],
        figureReferences: [],
      },
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
          lessonMode: 'standard',
          paperStage: null,
          contextChunks: [],
          learnerReply: '它在说明证据如何支撑判断。',
        },
        token: expect.objectContaining({ cancelled: false }),
      },
    ])
  })

  it('offers only current-document figures to the provider and accepts verified references', async () => {
    const providers = new FakeProviderRepository()
    const vault = new FakeVault()
    const factory = new FakeGatewayFactory()
    const figureId = '00000000-0000-4000-8000-000000000801'
    factory.gateway.replyContents.push(
      JSON.stringify({
        narration: null,
        responseMarkdown: '请观察图 2。',
        citations: [],
        figureReferences: [{ figureId, rationale: '展示结构关系' }],
      }),
    )
    const figures: DocumentFigureRepositoryPort = {
      isFigureExtractionComplete: async () => true,
      completeFigureExtraction: async () => undefined,
      listFigures: async (requestedDocumentId) =>
        requestedDocumentId === documentId
          ? [
              {
                id: figureId,
                documentId,
                pageNumber: 2,
                label: 'Figure 2',
                caption: 'Attention architecture',
                assetId: '00000000-0000-4000-8000-000000000802',
                assetKind: 'embedded_image',
                width: 320,
                height: 200,
                createdAt: now,
              },
            ]
          : [],
    }

    const result = await new ProviderLessonTutorReplyGenerator(
      providers,
      vault,
      factory,
      figures,
    ).generateFollowUp(
      {
        documentId,
        documentTitle: 'Paper Map',
        sourceSnippet: 'Evidence',
        lessonMode: 'paper',
        paperStage: 'method_mechanics',
        contextChunks: [],
        learnerReply: '我需要看结构图。',
      },
      { cancelled: false, onCancel: () => () => undefined },
    )

    expect(result.tutorTurn?.figureReferences).toEqual([{ figureId, rationale: '展示结构关系' }])
    expect(factory.gateway.calls[0]?.input.availableFigures).toEqual([
      {
        figureId,
        pageNumber: 2,
        label: 'Figure 2',
        caption: 'Attention architecture',
      },
    ])
  })

  it('repairs one invalid structured tutor turn and rejects a second invalid response', async () => {
    const providers = new FakeProviderRepository()
    const vault = new FakeVault()
    const repairedFactory = new FakeGatewayFactory()
    repairedFactory.gateway.replyContents.push(
      'not-json',
      JSON.stringify({
        narration: '她点了点证据。',
        responseMarkdown: '请再说明你的判断依据。',
        citations: [],
        figureReferences: [],
      }),
    )
    const generator = new ProviderLessonTutorReplyGenerator(providers, vault, repairedFactory)
    const request = {
      documentId,
      documentTitle: 'Paper Map',
      sourceSnippet: 'Evidence',
      lessonMode: 'standard' as const,
      paperStage: null,
      contextChunks: [],
      learnerReply: '这是我的判断。',
    }

    await expect(
      generator.generateFollowUp(request, {
        cancelled: false,
        onCancel: () => () => undefined,
      }),
    ).resolves.toMatchObject({ content: '请再说明你的判断依据。' })
    expect(repairedFactory.gateway.calls).toHaveLength(2)
    expect(repairedFactory.gateway.calls[1]?.input.repair).toEqual({
      reason: 'Tutor turn failed validation.',
    })

    const failedFactory = new FakeGatewayFactory()
    failedFactory.gateway.replyContents.push('bad-1', 'bad-2')
    await expect(
      new ProviderLessonTutorReplyGenerator(providers, vault, failedFactory).generateFollowUp(
        request,
        { cancelled: false, onCancel: () => () => undefined },
      ),
    ).rejects.toMatchObject({ code: 'AI_GENERATION_FAILED', retryable: true })
    expect(failedFactory.gateway.calls).toHaveLength(2)
  })

  it('requires an active provider instead of generating a local tutor fallback', async () => {
    const providers = new FakeProviderRepository([])
    const vault = new FakeVault()
    const factory = new FakeGatewayFactory()

    const generator = new ProviderLessonTutorReplyGenerator(providers, vault, factory)

    await expect(
      generator.generateFirstQuestion(
        {
          documentId,
          documentTitle: 'Paper Map',
          sourceSnippet: 'Evidence',
          lessonMode: 'paper',
          paperStage: 'orientation',
          contextChunks: [],
        },
        { cancelled: false, onCancel: () => () => undefined },
      ),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_REQUIRED', retryable: false })

    await expect(
      generator.generateFollowUp(
        {
          documentId,
          documentTitle: 'Paper Map',
          sourceSnippet: 'Evidence',
          lessonMode: 'paper',
          paperStage: 'problem_framing',
          contextChunks: [],
          learnerReply: 'The paper frames a gap between evidence and behavior.',
        },
        { cancelled: false, onCancel: () => () => undefined },
      ),
    ).rejects.toMatchObject({ code: 'AI_PROVIDER_REQUIRED', retryable: false })
    expect(factory.gateway.calls).toEqual([])
    expect(vault.refs).toEqual([])
  })

  it('retries a failed tutor run with a deterministic follow-up', async () => {
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId, evidenceId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0
    const replied = await new SubmitLessonReply(
      lessons,
      clock,
      { generate: () => replyIds[replyIndex++]! },
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      lessonId: created.id,
      content: '它在说明证据如何支撑判断。',
    })
    lessons.records.set(lessonId, {
      ...replied,
      currentState: 'probing',
      steps: replied.steps.map((step) =>
        step.modelRunId === followUpRunId
          ? {
              ...step,
              status: 'failed' as const,
              messageId: null,
              rationale: null,
              errorSummary: {
                code: 'INTERNAL_ERROR',
                message: 'The lesson operation could not be completed.',
                retryable: true,
              },
              finishedAt: now,
            }
          : step,
      ),
      modelRuns: replied.modelRuns.map((run) =>
        run.id === followUpRunId
          ? { ...run, status: 'failed' as const, outputMessageId: null, finishedAt: now }
          : run,
      ),
      messages: replied.messages.filter((message) => message.id !== followUpMessageId),
    })
    const retryIds = [retryRunId, retryMessageId, retryEvidenceId]
    let retryIndex = 0

    const retried = await new RetryLessonRun(
      lessons,
      clock,
      { generate: () => retryIds[retryIndex++]! },
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({ lessonId, modelRunId: followUpRunId })

    expect(retried.messages.at(-1)).toEqual({
      id: retryMessageId,
      lessonId,
      modelRunId: retryRunId,
      role: 'tutor',
      content: 'Provider 追问：它在说明证据如何支撑判断。 / Evidence',
      sourceAnchorIds: [anchorId],
      promptVersion: 'mock-tutor-follow-up-v2',
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
    expect(retried.currentState).toBe('probing')
    expect(retried.steps.find((step) => step.modelRunId === followUpRunId)).toMatchObject({
      status: 'failed',
      messageId: null,
    })
    expect(retried.steps.at(-1)).toMatchObject({
      id: retryRunId,
      sequenceNo: replied.steps.length,
      stateBefore: 'probing',
      stateAfter: 'probing',
      actionType: 'ask',
      status: 'succeeded',
      modelRunId: retryRunId,
      messageId: retryMessageId,
    })
    expect(retried.masteryEvidence).toContainEqual({
      id: retryEvidenceId,
      lessonId,
      stepId: retryRunId,
      learnerMessageId,
      tutorMessageId: retryMessageId,
      kind: 'teach_back',
      judgement: 'partial_understanding',
      confidence: 0.55,
      rationale: 'Learner gave a source-grounded answer that can support follow-up.',
      suggestedReview: false,
      createdAt: now,
    })
  })

  it('passes paper lesson context into provider-backed retry follow-ups', async () => {
    documents.document = { ...documentRecord, documentType: 'paper' }
    const startIds = [lessonId, anchorId, modelRunId, messageId]
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId, evidenceId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })
    let replyIndex = 0
    const replied = await new SubmitLessonReply(
      lessons,
      clock,
      { generate: () => replyIds[replyIndex++]! },
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      lessonId: created.id,
      content: 'The paper frames a gap between evidence and behavior.',
    })
    lessons.records.set(lessonId, {
      ...replied,
      currentState: 'probing',
      steps: replied.steps.map((step) =>
        step.modelRunId === followUpRunId
          ? {
              ...step,
              status: 'failed' as const,
              messageId: null,
              rationale: null,
              errorSummary: {
                code: 'INTERNAL_ERROR',
                message: 'The lesson operation could not be completed.',
                retryable: true,
              },
              finishedAt: now,
            }
          : step,
      ),
      modelRuns: replied.modelRuns.map((run) =>
        run.id === followUpRunId
          ? { ...run, status: 'failed' as const, outputMessageId: null, finishedAt: now }
          : run,
      ),
      messages: replied.messages.filter((message) => message.id !== followUpMessageId),
    })

    const providers = new FakeProviderRepository()
    const vault = new FakeVault()
    const factory = new FakeGatewayFactory()
    const retryIds = [retryRunId, retryMessageId, retryEvidenceId]
    let retryIndex = 0

    await new RetryLessonRun(
      lessons,
      clock,
      { generate: () => retryIds[retryIndex++]! },
      createContextAssembler(),
      new ProviderLessonTutorReplyGenerator(providers, vault, factory),
    ).execute({ lessonId, modelRunId: followUpRunId })

    expect(factory.gateway.calls.at(-1)?.input).toMatchObject({
      documentTitle: 'Paper Map',
      sourceSnippet: 'Evidence',
      learnerReply: 'The paper frames a gap between evidence and behavior.',
      lessonMode: 'paper',
      paperStage: 'problem_framing',
    })
  })

  it('rejects retrying completed tutor runs', async () => {
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
      undefined,
      createContextAssembler(),
      createTutorGenerator(),
    ).execute({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 13, endOffset: 21, snippet: 'Evidence' },
    })

    await expect(
      new RetryLessonRun(lessons, clock, idGenerator, createContextAssembler()).execute({
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
      new StartLessonFromDocument(
        documents,
        lessons,
        clock,
        idGenerator,
        undefined,
        createContextAssembler(),
        createTutorGenerator(),
      ).execute({
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
