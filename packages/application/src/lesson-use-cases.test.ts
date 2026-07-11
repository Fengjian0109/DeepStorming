import { beforeEach, describe, expect, it } from 'vitest'
import type { DocumentRepositoryPort, StoredDocumentDetail } from './document-ports'
import type { LessonRepositoryPort, StoredLessonSession } from './lesson-ports'
import {
  GetLessonSession,
  LessonUseCaseError,
  ListLessonSessions,
  RetryLessonRun,
  StartLessonFromDocument,
  SubmitLessonReply,
} from './lesson-use-cases'

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
