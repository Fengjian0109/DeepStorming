import { beforeEach, describe, expect, it } from 'vitest'
import type {
  DocumentImportRepositoryPort,
  DocumentRepositoryPort,
  PdfFileStorePort,
  PdfTextExtractorPort,
  DocumentTextHasherPort,
  StoredDocumentFile,
  StoredDocumentChunk,
  StoredDocumentPage,
  StoredDocumentTextBlock,
  StoredDocument,
  StoredDocumentDetail,
} from './document-ports'
import {
  CreateDocumentFromText,
  DeleteDocument,
  DocumentUseCaseError,
  GetDocumentPageBlocks,
  GetDocumentPages,
  GetDocument,
  ImportPdfDocument,
  ListDocuments,
  PdfTextExtractionError,
  SearchDocuments,
} from './document-use-cases'
import { DuplicateDocumentError } from './document-ports'
import type { DocumentImportJob } from '@deepstorming/domain'

const now = '2026-07-11T00:00:00.000Z'
const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000007',
  '00000000-0000-4000-8000-000000000008',
]

class FakeRepository implements DocumentRepositoryPort {
  public records = new Map<string, StoredDocumentDetail>()
  public listError?: Error
  public findByIdError?: Error
  public createError?: Error
  public removeError?: Error
  public searchError?: Error

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

  async search(query: string): Promise<readonly StoredDocumentDetail[]> {
    if (this.searchError) throw this.searchError
    const normalizedQuery = query.toLocaleLowerCase()
    return [...this.records.values()].filter((document) =>
      document.plainText.toLocaleLowerCase().includes(normalizedQuery),
    )
  }
}

class FakeDocumentImportRepository implements DocumentImportRepositoryPort {
  public jobs = new Map<string, DocumentImportJob>()
  public files = new Map<string, StoredDocumentFile>()
  public pages = new Map<string, StoredDocumentPage[]>()
  public blocks = new Map<string, StoredDocumentTextBlock[]>()
  public chunks = new Map<string, StoredDocumentChunk[]>()
  public statusHistory: DocumentImportJob['status'][] = []

  async saveJob(job: DocumentImportJob): Promise<DocumentImportJob> {
    this.jobs.set(job.id, job)
    this.statusHistory.push(job.status)
    return job
  }

  async updateJob(job: DocumentImportJob): Promise<DocumentImportJob> {
    this.jobs.set(job.id, job)
    this.statusHistory.push(job.status)
    return job
  }

  async listJobsForDocument(documentId: string): Promise<readonly DocumentImportJob[]> {
    return [...this.jobs.values()].filter((job) => job.documentId === documentId)
  }

  async saveFile(file: StoredDocumentFile): Promise<StoredDocumentFile> {
    this.files.set(file.documentId, file)
    return file
  }

  async replacePagesAndBlocks(
    pages: readonly StoredDocumentPage[],
    blocks: readonly StoredDocumentTextBlock[],
  ): Promise<void> {
    for (const page of pages) {
      this.pages.set(page.documentId, [...(this.pages.get(page.documentId) ?? []), page])
    }
    for (const block of blocks) {
      this.blocks.set(block.documentId, [...(this.blocks.get(block.documentId) ?? []), block])
    }
  }

  async listPages(documentId: string): Promise<readonly StoredDocumentPage[]> {
    return this.pagesFor(documentId)
  }

  async listPageBlocks(
    documentId: string,
    pageNumber: number,
  ): Promise<readonly StoredDocumentTextBlock[]> {
    return (this.blocks.get(documentId) ?? []).filter((block) => block.pageNumber === pageNumber)
  }

  async findTextBlock(documentId: string, pageNumber: number, blockId: string) {
    return (this.blocks.get(documentId) ?? []).find(
      (block) => block.pageNumber === pageNumber && block.id === blockId,
    )
  }

  async replaceChunks(documentId: string, chunks: readonly StoredDocumentChunk[]): Promise<void> {
    this.chunks.set(documentId, [...chunks])
  }

  async listChunks(documentId: string): Promise<readonly StoredDocumentChunk[]> {
    return this.chunks.get(documentId) ?? []
  }

  async searchChunks(input: {
    documentId: string
    query: string
    limit: number
  }): Promise<readonly StoredDocumentChunk[]> {
    const normalized = input.query.toLocaleLowerCase()
    return (this.chunks.get(input.documentId) ?? [])
      .filter((chunk) => chunk.text.toLocaleLowerCase().includes(normalized))
      .slice(0, input.limit)
  }

  async hasFreshChunks(
    documentId: string,
    sourceVersion: string,
    rebuildToken: string,
  ): Promise<boolean> {
    const chunks = this.chunks.get(documentId) ?? []
    return (
      chunks.length > 0 &&
      chunks.every(
        (chunk) =>
          chunk.sourceVersion === sourceVersion && chunk.rebuildToken === rebuildToken,
      )
    )
  }

  pagesFor(documentId: string): readonly StoredDocumentPage[] {
    return this.pages.get(documentId) ?? []
  }
}

describe('document use cases', () => {
  let repo: FakeRepository
  let importRepo: FakeDocumentImportRepository
  let idIndex: number
  const hasher: DocumentTextHasherPort = { hash: async (input) => `hash:${input}` }
  const fileStore: PdfFileStorePort = {
    describe: async () => ({ fileSizeBytes: 4096, contentHash: 'a'.repeat(64) }),
    copyIntoLibrary: async () => ({ storedPath: 'documents/00/paper.pdf' }),
  }
  let extractor: PdfTextExtractorPort
  const clock = { now: () => now }
  const idGenerator = { generate: () => ids[idIndex++]! }

  beforeEach(() => {
    repo = new FakeRepository()
    importRepo = new FakeDocumentImportRepository()
    extractor = {
      extract: async () => ({
        pages: [
          {
            pageNumber: 1,
            width: 612,
            height: 792,
            text: 'Paper text.',
            blocks: [{ text: 'Paper text.', x: 10, y: 20, width: 100, height: 16 }],
          },
        ],
      }),
    }
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

  it('searches document text and returns snippets without full plain text', async () => {
    await new CreateDocumentFromText(repo, hasher, clock, idGenerator).execute({
      title: 'Socratic Notes',
      plainText: 'Alpha beta gamma explains retrieval augmented learning.',
      sourceKind: 'pasted_text',
    })

    const results = await new SearchDocuments(repo).execute({ query: 'gamma' })

    expect(results).toEqual([
      expect.objectContaining({
        documentId: ids[0],
        title: 'Socratic Notes',
        snippet: 'Alpha beta gamma explains retrieval augmented learning.',
        startOffset: 11,
        endOffset: 16,
      }),
    ])
    expect(JSON.stringify(results)).not.toContain('plainText')
    expect(JSON.stringify(results)).not.toContain('contentHash')
    expect(results[0]).not.toHaveProperty('id')
  })

  it('rejects blank document searches before calling storage', async () => {
    await expect(new SearchDocuments(repo).execute({ query: '   ' })).rejects.toMatchObject({
      code: 'DOCUMENT_VALIDATION_FAILED',
      retryable: false,
    })
  })

  it('maps search infrastructure failures to DATABASE_UNAVAILABLE', async () => {
    repo.searchError = new Error('search failed')

    await expect(new SearchDocuments(repo).execute({ query: 'body' })).rejects.toMatchObject({
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

  it('imports a text PDF into pages and blocks', async () => {
    const result = await new ImportPdfDocument(
      repo,
      importRepo,
      fileStore,
      extractor,
      hasher,
      clock,
      idGenerator,
    ).execute({
      filePath: '/tmp/paper.pdf',
      originalName: 'paper.pdf',
    })

    expect(result.status).toBe('ready')
    expect(importRepo.statusHistory).toEqual(['queued', 'copying', 'parsing', 'ready'])
    expect(result.documentId).toBe(ids[1])
    expect(importRepo.pagesFor(result.documentId!)).toHaveLength(1)
    await expect(importRepo.listPageBlocks(result.documentId!, 1)).resolves.toHaveLength(1)
    await expect(new GetDocument(repo).execute(result.documentId!)).resolves.toMatchObject({
      title: 'paper',
      plainText: 'Paper text.',
      sourceKind: 'text_file',
      originalFileName: 'paper.pdf',
    })
  })

  it('fails PDF import when the PDF is password protected', async () => {
    extractor = {
      extract: async () => {
        throw new PdfTextExtractionError(
          'DOCUMENT_PDF_PASSWORD_PROTECTED',
          'The PDF is password protected.',
          false,
        )
      },
    }

    const result = await new ImportPdfDocument(
      repo,
      importRepo,
      fileStore,
      extractor,
      hasher,
      clock,
      idGenerator,
    ).execute({ filePath: '/tmp/locked.pdf', originalName: 'locked.pdf' })

    expect(result).toMatchObject({
      status: 'failed',
      documentId: null,
      error: { code: 'DOCUMENT_PDF_PASSWORD_PROTECTED', retryable: false },
    })
    expect(importRepo.statusHistory).toEqual(['queued', 'copying', 'parsing', 'failed'])
  })

  it('fails PDF import when no text layer can be extracted', async () => {
    extractor = {
      extract: async () => ({
        pages: [{ pageNumber: 1, width: 1, height: 1, text: ' ', blocks: [] }],
      }),
    }

    const result = await new ImportPdfDocument(
      repo,
      importRepo,
      fileStore,
      extractor,
      hasher,
      clock,
      idGenerator,
    ).execute({ filePath: '/tmp/scan.pdf', originalName: 'scan.pdf' })

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'DOCUMENT_PDF_TEXT_MISSING', retryable: false },
    })
  })

  it('fails PDF import when the PDF parser reports a damaged file', async () => {
    extractor = {
      extract: async () => {
        throw new PdfTextExtractionError(
          'DOCUMENT_PDF_PARSE_FAILED',
          'The PDF could not be parsed.',
          false,
        )
      },
    }

    const result = await new ImportPdfDocument(
      repo,
      importRepo,
      fileStore,
      extractor,
      hasher,
      clock,
      idGenerator,
    ).execute({ filePath: '/tmp/damaged.pdf', originalName: 'damaged.pdf' })

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'DOCUMENT_PDF_PARSE_FAILED', retryable: false },
    })
  })

  it('lists imported PDF pages and page blocks', async () => {
    importRepo.pages.set(ids[0]!, [
      {
        id: ids[1]!,
        documentId: ids[0]!,
        pageNumber: 1,
        width: 612,
        height: 792,
        text: 'Page text',
        textHash: 'b'.repeat(64),
        createdAt: now,
      },
    ])
    importRepo.blocks.set(ids[0]!, [
      {
        id: ids[2]!,
        documentId: ids[0]!,
        pageId: ids[1]!,
        pageNumber: 1,
        blockIndex: 0,
        text: 'Page text',
        createdAt: now,
      },
    ])

    await expect(new GetDocumentPages(importRepo).execute(ids[0]!)).resolves.toHaveLength(1)
    await expect(
      new GetDocumentPageBlocks(importRepo).execute({ documentId: ids[0]!, pageNumber: 1 }),
    ).resolves.toEqual([expect.objectContaining({ blockIndex: 0, text: 'Page text' })])
  })
})
