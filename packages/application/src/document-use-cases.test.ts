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

const now = '2026-07-11T00:00:00.000Z'
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']

class FakeRepository implements DocumentRepositoryPort {
  public records = new Map<string, StoredDocumentDetail>()

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
    return [...this.records.values()].map((document) => this.toSummary(document))
  }

  async findById(id: string): Promise<StoredDocumentDetail | undefined> {
    return this.records.get(id)
  }

  async findByContentHash(hash: string): Promise<StoredDocument | undefined> {
    const found = [...this.records.values()].find((item) => item.contentHash === hash)
    if (!found) return undefined
    return this.toSummary(found)
  }

  async create(document: StoredDocumentDetail): Promise<StoredDocumentDetail> {
    this.records.set(document.id, document)
    return document
  }

  async remove(id: string): Promise<boolean> {
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

  it('rejects duplicate normalized text', async () => {
    const create = new CreateDocumentFromText(repo, hasher, clock, idGenerator)
    await create.execute({ title: 'A', plainText: ' same ', sourceKind: 'pasted_text' })

    await expect(
      create.execute({ title: 'B', plainText: 'same', sourceKind: 'text_file' }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_DUPLICATE', retryable: false })
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

  it('exposes stable document errors', () => {
    const error = new DocumentUseCaseError('DOCUMENT_NOT_FOUND', 'Missing.', false)
    expect(error.code).toBe('DOCUMENT_NOT_FOUND')
    expect(error.message).toBe('Missing.')
    expect(error.retryable).toBe(false)
  })
})
