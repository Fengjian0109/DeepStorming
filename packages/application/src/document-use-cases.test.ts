import { beforeEach, describe, expect, it } from 'vitest'
import type {
  DocumentRepositoryPort,
  DocumentTextHasherPort,
  StoredDocument,
  StoredDocumentDetail,
} from './document-ports'
import {
  CreateDocumentFromText,
  DeleteDocument,
  DocumentUseCaseError,
  GetDocument,
  ListDocuments,
} from './document-use-cases'
import { DuplicateDocumentError } from './document-ports'

const now = '2026-07-11T00:00:00.000Z'
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']

class FakeRepository implements DocumentRepositoryPort {
  public records = new Map<string, StoredDocumentDetail>()
  public listError?: Error
  public findByIdError?: Error
  public createError?: Error
  public removeError?: Error

  private toSummary(document: StoredDocumentDetail): StoredDocument {
    return {
      id: document.id,
      documentType: document.documentType,
      title: document.title,
      sourceKind: document.sourceKind,
      ...(document.originalFileName !== undefined
        ? { originalFileName: document.originalFileName }
        : {}),
      contentHash: document.contentHash,
      characterCount: document.characterCount,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    }
  }

  async list(): Promise<readonly StoredDocument[]> {
    if (this.listError) throw this.listError
    return [...this.records.values()].map((document) => this.toSummary(document))
  }

  async findById(id: string): Promise<StoredDocumentDetail | undefined> {
    if (this.findByIdError) throw this.findByIdError
    return this.records.get(id)
  }

  async create(document: StoredDocumentDetail): Promise<StoredDocumentDetail> {
    if (this.createError) throw this.createError
    if ([...this.records.values()].some((item) => item.contentHash === document.contentHash)) {
      throw new DuplicateDocumentError()
    }
    this.records.set(document.id, document)
    return document
  }

  async remove(id: string): Promise<boolean> {
    if (this.removeError) throw this.removeError
    return this.records.delete(id)
  }
}

describe('document use cases', () => {
  let repo: FakeRepository
  let idIndex: number
  const hasher: DocumentTextHasherPort = { hash: async (input) => `hash:${input}` }
  const clock = { now: () => now }
  const idGenerator = { generate: () => ids[idIndex++]! }

  beforeEach(() => {
    repo = new FakeRepository()
    idIndex = 0
  })

  it('creates and lists a document summary without plain text', async () => {
    const created = await new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
      title: ' Notes ',
      plainText: ' body ',
      sourceKind: 'pasted_text',
    })

    expect(created.title).toBe('Notes')
    expect(created.characterCount).toBe(4)
    expect(created).not.toHaveProperty('plainText')

    const listed = await new ListDocuments(repo).execute()
    expect(listed).toEqual([created])
    expect(JSON.stringify(listed)).not.toContain('body')
  })

  it('returns detail with plain text', async () => {
    const created = await new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
      title: 'Notes',
      plainText: 'body',
      sourceKind: 'pasted_text',
    })

    await expect(new GetDocument(repo).execute(created.id)).resolves.toMatchObject({
      id: created.id,
      plainText: 'body',
    })
  })

  it('maps list infrastructure failures to DATABASE_UNAVAILABLE', async () => {
    repo.listError = new Error('db offline')

    await expect(new ListDocuments(repo).execute()).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
      retryable: true,
    })
  })

  it('maps get infrastructure failures to DATABASE_UNAVAILABLE', async () => {
    repo.findByIdError = new Error('db offline')

    await expect(new GetDocument(repo).execute(ids[0]!)).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
      retryable: true,
    })
  })

  it('rejects duplicate normalized text', async () => {
    const create = new CreateDocumentFromText(repo, hasher, clock, idGenerator)
    await create.execute({ title: 'A', plainText: ' same ', sourceKind: 'pasted_text' })

    await expect(
      create.execute({ title: 'B', plainText: 'same', sourceKind: 'text_file' }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_DUPLICATE', retryable: false })
  })

  it('maps hasher failures to INTERNAL_ERROR', async () => {
    const failingHasher: DocumentTextHasherPort = {
      hash: async () => {
        throw new Error('hash failed')
      },
    }

    await expect(
      new CreateDocumentFromText(repo, failingHasher, clock, idGenerator).execute({
        title: 'Notes',
        plainText: 'body',
        sourceKind: 'pasted_text',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR', retryable: true })
  })

  it('maps repository create failures to DATABASE_UNAVAILABLE', async () => {
    repo.createError = new Error('insert failed')

    await expect(
      new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
        title: 'Notes',
        plainText: 'body',
        sourceKind: 'pasted_text',
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE', retryable: true })
  })

  it('maps repository duplicate races during create to DOCUMENT_DUPLICATE', async () => {
    repo.createError = new DuplicateDocumentError()

    await expect(
      new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
        title: 'Notes',
        plainText: 'body',
        sourceKind: 'pasted_text',
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_DUPLICATE', retryable: false })
  })

  it('does not treat storage-specific sqlite duplicate details as a stable contract', async () => {
    repo.createError = Object.assign(
      new Error('UNIQUE constraint failed: learning_documents.content_hash'),
      {
        code: 'SQLITE_CONSTRAINT_UNIQUE',
      },
    )

    await expect(
      new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
        title: 'Notes',
        plainText: 'body',
        sourceKind: 'pasted_text',
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE', retryable: true })
  })

  it('maps invalid input to DOCUMENT_VALIDATION_FAILED', async () => {
    await expect(
      new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
        title: ' ',
        plainText: 'body',
        sourceKind: 'pasted_text',
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_VALIDATION_FAILED' })
  })

  it('deletes documents and reports not found', async () => {
    const created = await new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
      title: 'Notes',
      plainText: 'body',
      sourceKind: 'pasted_text',
    })

    await expect(new DeleteDocument(repo).execute(created.id)).resolves.toBeUndefined()
    await expect(new GetDocument(repo).execute(created.id)).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
    })
  })

  it('maps delete infrastructure failures to DATABASE_UNAVAILABLE', async () => {
    repo.removeError = new Error('delete failed')

    await expect(new DeleteDocument(repo).execute(ids[0]!)).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
      retryable: true,
    })
  })

  it('exposes stable document errors', () => {
    const error = new DocumentUseCaseError('DOCUMENT_NOT_FOUND', 'Missing.', false)
    expect(error.code).toBe('DOCUMENT_NOT_FOUND')
    expect(error.message).toBe('Missing.')
    expect(error.retryable).toBe(false)
  })
})
