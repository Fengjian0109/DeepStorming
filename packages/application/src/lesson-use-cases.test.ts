import { beforeEach, describe, expect, it } from 'vitest'
import type { DocumentRepositoryPort, StoredDocumentDetail } from './document-ports'
import type { LessonRepositoryPort, StoredLessonSession } from './lesson-ports'
import {
  GetLessonSession,
  LessonUseCaseError,
  ListLessonSessions,
  StartLessonFromDocument,
} from './lesson-use-cases'

const now = '2026-07-11T00:00:00.000Z'
const lessonId = '00000000-0000-4000-8000-000000000101'
const anchorId = '00000000-0000-4000-8000-000000000102'
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
}

describe('lesson use cases', () => {
  let documents: FakeDocumentRepository
  let lessons: FakeLessonRepository
  let idIndex: number
  const ids = [lessonId, anchorId]
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
