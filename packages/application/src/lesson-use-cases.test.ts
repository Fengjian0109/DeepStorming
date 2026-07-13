import { beforeEach, describe, expect, it } from 'vitest'
import type { ProviderProfile } from '@deepstorming/domain'
import type { DocumentRepositoryPort, StoredDocumentDetail } from './document-ports'
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
  public readonly calls: Array<{
    readonly input: {
      readonly modelName: string
      readonly apiKey?: string
      readonly documentTitle: string
      readonly sourceSnippet: string
      readonly contextChunks: readonly {
        readonly chunkId: string
        readonly text: string
        readonly pageNumberStart: number
        readonly pageNumberEnd: number
        readonly charCount: number
      }[]
      readonly learnerReply?: string
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
    return { content: 'Provider 首问' }
  }

  async generateLessonTutorReply(
    input: {
      modelName: string
      apiKey?: string
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

const createContextAssembler = () => new FakeLessonContextAssembler()

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
    const startAssembler = new FakeLessonContextAssembler()
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      startAssembler,
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
        content:
          '你刚才提到：“它在说明证据如何支撑判断。”。我们把它和证据“Evidence”连起来，参考这些上下文：“Why What；How Evidence”。下一步你会如何验证这个判断？',
        sourceAnchorIds: [anchorId],
        promptVersion: 'mock-tutor-follow-up-v2',
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
    expect(JSON.stringify(updated)).not.toContain('plainText')
  })

  it('routes stuck learner replies into the hinting state', async () => {
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
  })

  it('uses assembled chunk text in the local follow-up fallback path', async () => {
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

    const updated = await new SubmitLessonReply(
      lessons,
      clock,
      { generate: () => replyIds[replyIndex++]! },
      replyAssembler,
    ).execute({
      lessonId: created.id,
      content: '它在说明证据如何支撑判断。',
    })

    expect(updated.messages.at(-1)).toMatchObject({
      id: followUpMessageId,
      content:
        '你刚才提到：“它在说明证据如何支撑判断。”。我们把它和证据“Evidence”连起来，参考这些上下文：“Context A”。下一步你会如何验证这个判断？',
    })
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
    const replyIds = [learnerMessageId, followUpRunId, followUpMessageId]
    let startIndex = 0
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      createContextAssembler(),
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
        documentTitle: 'Paper Map',
        sourceSnippet: 'Evidence',
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

  it('persists a started provider run before requesting a tutor follow-up', async () => {
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
        modelName: 'mock-local',
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
        documentTitle: 'Paper Map',
        sourceSnippet: 'Evidence',
        contextChunks: [],
        learnerReply: '它在说明证据如何支撑判断。',
      },
      { cancelled: false, onCancel: () => () => undefined },
    )

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
          contextChunks: [],
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
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      { generate: () => startIds[startIndex++]! },
      undefined,
      createContextAssembler(),
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
    const retryIds = [retryRunId, retryMessageId]
    let retryIndex = 0

    const retried = await new RetryLessonRun(
      lessons,
      clock,
      { generate: () => retryIds[retryIndex++]! },
      createContextAssembler(),
    ).execute({ lessonId, modelRunId: followUpRunId })

    expect(retried.messages.at(-1)).toEqual({
      id: retryMessageId,
      lessonId,
      modelRunId: retryRunId,
      role: 'tutor',
      content:
        '你刚才提到：“它在说明证据如何支撑判断。”。我们把它和证据“Evidence”连起来，参考这些上下文：“无额外上下文”。下一步你会如何验证这个判断？',
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
  })

  it('rejects retrying completed tutor runs', async () => {
    const created = await new StartLessonFromDocument(
      documents,
      lessons,
      clock,
      idGenerator,
      undefined,
      createContextAssembler(),
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
