import {
  countDocumentCharacters,
  documentHashInput,
  normalizeDocumentDraft,
  normalizeDocumentImportJob,
  type DocumentDraft,
  type DocumentChunk,
  type DocumentImportError,
  type DocumentImportJob,
  type DocumentImportStatus,
  type LearningDocument,
} from '@deepstorming/domain'
import type {
  ClockPort,
  DocumentImportRepositoryPort,
  DocumentRepositoryPort,
  DocumentTextHasherPort,
  ExtractedPdfPage,
  IdGeneratorPort,
  PdfFileStorePort,
  PdfTextExtractorPort,
  StoredDocument,
  StoredDocumentDetail,
  StoredDocumentPage,
  StoredDocumentChunk,
  StoredDocumentTextBlock,
} from './document-ports'
import { DuplicateDocumentError } from './document-ports'
import {
  DEFAULT_CONTEXT_BUDGET,
  DOCUMENT_CHUNK_REBUILD_TOKEN,
  deriveDocumentChunks,
  selectBudgetedChunks,
  toDocumentChunks,
} from './document-chunking'

export type DocumentUseCaseErrorCode =
  | 'DOCUMENT_VALIDATION_FAILED'
  | 'DOCUMENT_DUPLICATE'
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_IMPORT_FAILED'
  | 'DOCUMENT_FILE_UNSUPPORTED'
  | 'DOCUMENT_FILE_TOO_LARGE'
  | 'DOCUMENT_PDF_PASSWORD_PROTECTED'
  | 'DOCUMENT_PDF_TEXT_MISSING'
  | 'DOCUMENT_PDF_PARSE_FAILED'
  | 'DATABASE_UNAVAILABLE'
  | 'INTERNAL_ERROR'

export class DocumentUseCaseError extends Error {
  public constructor(
    public readonly code: DocumentUseCaseErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export class PdfTextExtractionError extends DocumentUseCaseError {
  public constructor(
    code:
      'DOCUMENT_PDF_PASSWORD_PROTECTED' | 'DOCUMENT_PDF_TEXT_MISSING' | 'DOCUMENT_PDF_PARSE_FAILED',
    message: string,
    retryable: boolean,
  ) {
    super(code, message, retryable)
  }
}

export type DocumentDetail = LearningDocument & Readonly<{ plainText: string }>
export type DocumentSearchInput = Readonly<{ query: string }>
export type ImportPdfDocumentInput = Readonly<{ filePath: string; originalName: string }>
export type GetDocumentPageBlocksInput = Readonly<{ documentId: string; pageNumber: number }>
export type RebuildDocumentChunksInput = Readonly<{ documentId: string }>
export type SearchDocumentChunksInput = Readonly<{
  documentId: string
  query: string
  limit?: number
}>
export type AssembleLessonContextInput = Readonly<{
  documentId: string
  query: string
  fallbackSnippet: string
}>
export type DocumentSearchResult = Omit<LearningDocument, 'id'> &
  Readonly<{
    documentId: string
    snippet: string
    startOffset: number
    endOffset: number
  }>

const SEARCH_SNIPPET_CONTEXT = 48
const DEFAULT_CHUNK_SEARCH_LIMIT = 8

const toSummary = (document: StoredDocument): LearningDocument => ({
  id: document.id,
  documentType: document.documentType,
  title: document.title,
  sourceKind: document.sourceKind,
  ...(document.originalFileName !== undefined
    ? { originalFileName: document.originalFileName }
    : {}),
  characterCount: document.characterCount,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
})

const toDetail = (document: StoredDocumentDetail): DocumentDetail => ({
  ...toSummary(document),
  plainText: document.plainText,
})

const validationError = (error: unknown): DocumentUseCaseError =>
  new DocumentUseCaseError(
    'DOCUMENT_VALIDATION_FAILED',
    error instanceof Error ? error.message : 'The document input is invalid.',
    false,
  )

const databaseError = (): DocumentUseCaseError =>
  new DocumentUseCaseError(
    'DATABASE_UNAVAILABLE',
    'Document storage is temporarily unavailable.',
    true,
  )

const internalError = (): DocumentUseCaseError =>
  new DocumentUseCaseError('INTERNAL_ERROR', 'The document operation could not be completed.', true)

const duplicateError = (): DocumentUseCaseError =>
  new DocumentUseCaseError(
    'DOCUMENT_DUPLICATE',
    'This document text has already been imported.',
    false,
  )

const pdfTextMissingError = (): PdfTextExtractionError =>
  new PdfTextExtractionError(
    'DOCUMENT_PDF_TEXT_MISSING',
    'The PDF does not contain an extractable text layer.',
    false,
  )

const importFailedError = (): DocumentUseCaseError =>
  new DocumentUseCaseError('DOCUMENT_IMPORT_FAILED', 'The PDF import could not be completed.', true)

const normalizeSearchQuery = (query: string): string => {
  const normalized = query.trim()
  if (normalized.length === 0) throw new Error('Search query must not be blank')
  return normalized
}

const isDocumentUseCaseError = (error: unknown): error is DocumentUseCaseError =>
  error instanceof DocumentUseCaseError

const isDuplicateStorageError = (error: unknown): boolean => error instanceof DuplicateDocumentError

const asDatabaseError = (error: unknown): DocumentUseCaseError => {
  if (isDocumentUseCaseError(error)) return error
  return databaseError()
}

const asInternalError = (error: unknown): DocumentUseCaseError => {
  if (isDocumentUseCaseError(error)) return error
  return internalError()
}

const asCreateError = (error: unknown): DocumentUseCaseError => {
  if (isDocumentUseCaseError(error)) return error
  if (isDuplicateStorageError(error)) return duplicateError()
  return databaseError()
}

const asImportFailure = (error: unknown): DocumentUseCaseError => {
  if (isDocumentUseCaseError(error)) return error
  return importFailedError()
}

const toImportErrorSummary = (error: DocumentUseCaseError): DocumentImportError => ({
  code: error.code,
  message: error.message,
  retryable: error.retryable,
})

const normalizePdfOriginalName = (originalName: string): string => {
  const normalized = originalName.trim().split(/[\\/]/u).filter(Boolean).at(-1)
  if (normalized === undefined || !/\.pdf$/iu.test(normalized)) {
    throw new Error('PDF file name must end with .pdf')
  }
  return normalized
}

const titleFromPdfName = (originalName: string): string =>
  originalName.replace(/\.pdf$/iu, '').trim() || originalName

const pdfPlainText = (pages: readonly ExtractedPdfPage[]): string =>
  pages
    .map((page) => page.text.trim())
    .filter((text) => text.length > 0)
    .join('\n\n')

const findMatchRange = (
  plainText: string,
  query: string,
): Readonly<{ startOffset: number; endOffset: number }> => {
  const index = plainText.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  const startOffset = index < 0 ? 0 : index
  return {
    startOffset,
    endOffset: startOffset + (index < 0 ? 0 : query.length),
  }
}

const createSnippet = (plainText: string, startOffset: number, endOffset: number): string => {
  const snippetStart = Math.max(0, startOffset - SEARCH_SNIPPET_CONTEXT)
  const snippetEnd = Math.min(plainText.length, endOffset + SEARCH_SNIPPET_CONTEXT)
  const prefix = snippetStart > 0 ? '…' : ''
  const suffix = snippetEnd < plainText.length ? '…' : ''
  return `${prefix}${plainText.slice(snippetStart, snippetEnd).trim()}${suffix}`
}

const toSearchResult = (document: StoredDocumentDetail, query: string): DocumentSearchResult => {
  const { startOffset, endOffset } = findMatchRange(document.plainText, query)
  return {
    documentId: document.id,
    documentType: document.documentType,
    title: document.title,
    sourceKind: document.sourceKind,
    ...(document.originalFileName !== undefined
      ? { originalFileName: document.originalFileName }
      : {}),
    characterCount: document.characterCount,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    snippet: createSnippet(document.plainText, startOffset, endOffset),
    startOffset,
    endOffset,
  }
}

export class ListDocuments {
  public constructor(private readonly repository: DocumentRepositoryPort) {}

  public async execute(): Promise<readonly LearningDocument[]> {
    try {
      return (await this.repository.list()).map(toSummary)
    } catch (error) {
      throw asDatabaseError(error)
    }
  }
}

export class GetDocument {
  public constructor(private readonly repository: DocumentRepositoryPort) {}

  public async execute(id: string): Promise<DocumentDetail> {
    let document: StoredDocumentDetail | undefined
    try {
      document = await this.repository.findById(id)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (!document)
      throw new DocumentUseCaseError('DOCUMENT_NOT_FOUND', 'The document was not found.', false)
    return toDetail(document)
  }
}

export class SearchDocuments {
  public constructor(private readonly repository: DocumentRepositoryPort) {}

  public async execute(input: DocumentSearchInput): Promise<readonly DocumentSearchResult[]> {
    let query: string
    try {
      query = normalizeSearchQuery(input.query)
    } catch (error) {
      throw validationError(error)
    }

    try {
      return (await this.repository.search(query)).map((document) =>
        toSearchResult(document, query),
      )
    } catch (error) {
      throw asDatabaseError(error)
    }
  }
}

export class CreateDocumentFromText {
  public constructor(
    private readonly repository: DocumentRepositoryPort,
    private readonly hasher: DocumentTextHasherPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  public async execute(input: DocumentDraft): Promise<LearningDocument> {
    let draft
    try {
      draft = normalizeDocumentDraft(input)
    } catch (error) {
      throw validationError(error)
    }

    let contentHash: string
    try {
      contentHash = await this.hasher.hash(documentHashInput(draft))
    } catch (error) {
      throw asInternalError(error)
    }

    let createdAt: string
    let id: string
    let textVersionId: string
    try {
      createdAt = this.clock.now()
      id = this.ids.generate()
      textVersionId = this.ids.generate()
    } catch (error) {
      throw asInternalError(error)
    }
    const document: StoredDocumentDetail = {
      id,
      textVersionId,
      documentType: draft.documentType,
      title: draft.title,
      plainText: draft.plainText,
      sourceKind: draft.sourceKind,
      ...(draft.originalFileName !== undefined ? { originalFileName: draft.originalFileName } : {}),
      contentHash,
      characterCount: countDocumentCharacters(draft.plainText),
      createdAt,
      updatedAt: createdAt,
    }

    try {
      return toSummary(await this.repository.create(document))
    } catch (error) {
      throw asCreateError(error)
    }
  }
}

export class ImportPdfDocument {
  public constructor(
    private readonly documentRepository: DocumentRepositoryPort,
    private readonly importRepository: DocumentImportRepositoryPort,
    private readonly fileStore: PdfFileStorePort,
    private readonly extractor: PdfTextExtractorPort,
    private readonly hasher: DocumentTextHasherPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  public async execute(input: ImportPdfDocumentInput): Promise<DocumentImportJob> {
    let originalName: string
    try {
      originalName = normalizePdfOriginalName(input.originalName)
    } catch (error) {
      throw validationError(error)
    }

    const fileDescription = await this.fileStore
      .describe(input.filePath)
      .catch((error: unknown) => {
        throw asImportFailure(error)
      })
    const jobId = this.ids.generate()
    const jobCreatedAt = this.clock.now()
    const baseJob = (status: DocumentImportStatus): DocumentImportJob =>
      normalizeDocumentImportJob({
        id: jobId,
        documentId: null,
        sourceKind: 'pdf_file',
        status,
        originalName,
        fileSizeBytes: fileDescription.fileSizeBytes,
        contentHash: fileDescription.contentHash,
        error: null,
        createdAt: jobCreatedAt,
        updatedAt: this.clock.now(),
        finishedAt: null,
      })

    await this.importRepository.saveJob(baseJob('queued')).catch((error: unknown) => {
      throw asDatabaseError(error)
    })
    await this.importRepository.updateJob(baseJob('copying')).catch((error: unknown) => {
      throw asDatabaseError(error)
    })

    let storedFile
    try {
      storedFile = await this.fileStore.copyIntoLibrary({
        filePath: input.filePath,
        contentHash: fileDescription.contentHash,
      })
    } catch (error) {
      return this.failJob(baseJob('copying'), asImportFailure(error))
    }

    await this.importRepository.updateJob(baseJob('parsing')).catch((error: unknown) => {
      throw asDatabaseError(error)
    })

    try {
      const extracted = await this.extractor.extract(input.filePath)
      const plainText = pdfPlainText(extracted.pages)
      if (plainText.length === 0) throw pdfTextMissingError()

      const documentId = this.ids.generate()
      const textVersionId = this.ids.generate()
      const createdAt = this.clock.now()
      const draft = normalizeDocumentDraft({
        title: titleFromPdfName(originalName),
        plainText,
        sourceKind: 'text_file',
        documentType: 'paper',
        originalFileName: originalName,
      })
      const document = await this.documentRepository.create({
        id: documentId,
        textVersionId,
        documentType: draft.documentType,
        title: draft.title,
        plainText: draft.plainText,
        sourceKind: draft.sourceKind,
        ...(draft.originalFileName !== undefined
          ? { originalFileName: draft.originalFileName }
          : {}),
        contentHash: await this.hasher.hash(documentHashInput(draft)),
        characterCount: countDocumentCharacters(draft.plainText),
        createdAt,
        updatedAt: createdAt,
      })

      await this.importRepository.saveFile({
        documentId,
        importJobId: jobId,
        originalName,
        storedPath: storedFile.storedPath,
        contentHash: fileDescription.contentHash,
        fileSizeBytes: fileDescription.fileSizeBytes,
        createdAt,
      })
      const pages = await this.toStoredPages(documentId, extracted.pages, createdAt)
      await this.importRepository.replacePagesAndBlocks(
        pages,
        this.toStoredBlocks(documentId, extracted.pages, pages, createdAt),
      )
      return await this.importRepository.updateJob({
        ...baseJob('ready'),
        documentId: document.id,
        updatedAt: this.clock.now(),
        finishedAt: this.clock.now(),
      })
    } catch (error) {
      return this.failJob(baseJob('parsing'), asImportFailure(error))
    }
  }

  private async failJob(
    job: DocumentImportJob,
    error: DocumentUseCaseError,
  ): Promise<DocumentImportJob> {
    return this.importRepository
      .updateJob({
        ...job,
        status: 'failed',
        error: toImportErrorSummary(error),
        updatedAt: this.clock.now(),
        finishedAt: this.clock.now(),
      })
      .catch((updateError: unknown) => {
        throw asDatabaseError(updateError)
      })
  }

  private async toStoredPages(
    documentId: string,
    pages: readonly ExtractedPdfPage[],
    createdAt: string,
  ): Promise<readonly StoredDocumentPage[]> {
    return Promise.all(
      pages.map(async (page) => ({
        id: this.ids.generate(),
        documentId,
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        text: page.text,
        textHash: await this.hasher.hash(page.text),
        createdAt,
      })),
    )
  }

  private toStoredBlocks(
    documentId: string,
    pages: readonly ExtractedPdfPage[],
    storedPages: readonly StoredDocumentPage[],
    createdAt: string,
  ): readonly StoredDocumentTextBlock[] {
    return pages.flatMap((page) => {
      const storedPage = storedPages.find((item) => item.pageNumber === page.pageNumber)
      if (storedPage === undefined) throw new Error('PDF page block has no matching page')
      return page.blocks.map((block, blockIndex) => ({
        id: this.ids.generate(),
        documentId,
        pageId: storedPage.id,
        pageNumber: page.pageNumber,
        blockIndex,
        text: block.text,
        ...(block.x === undefined ? {} : { x: block.x }),
        ...(block.y === undefined ? {} : { y: block.y }),
        ...(block.width === undefined ? {} : { width: block.width }),
        ...(block.height === undefined ? {} : { height: block.height }),
        createdAt,
      }))
    })
  }
}

export class GetDocumentPages {
  public constructor(private readonly importRepository: DocumentImportRepositoryPort) {}

  public async execute(documentId: string): Promise<readonly StoredDocumentPage[]> {
    try {
      return await this.importRepository.listPages(documentId)
    } catch (error) {
      throw asDatabaseError(error)
    }
  }
}

export class GetDocumentPageBlocks {
  public constructor(private readonly importRepository: DocumentImportRepositoryPort) {}

  public async execute(
    input: GetDocumentPageBlocksInput,
  ): Promise<readonly StoredDocumentTextBlock[]> {
    try {
      return await this.importRepository.listPageBlocks(input.documentId, input.pageNumber)
    } catch (error) {
      throw asDatabaseError(error)
    }
  }
}

export class RebuildDocumentChunks {
  public constructor(
    private readonly documentRepository: DocumentRepositoryPort,
    private readonly importRepository: DocumentImportRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  public async execute(input: RebuildDocumentChunksInput): Promise<readonly DocumentChunk[]> {
    let document: StoredDocumentDetail | undefined
    try {
      document = await this.documentRepository.findById(input.documentId)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (!document) {
      throw new DocumentUseCaseError('DOCUMENT_NOT_FOUND', 'The document was not found.', false)
    }

    let pages: readonly StoredDocumentPage[]
    try {
      pages = await this.importRepository.listPages(input.documentId)
    } catch (error) {
      throw asDatabaseError(error)
    }

    const blocks: StoredDocumentTextBlock[] = []
    try {
      for (const page of pages) {
        blocks.push(
          ...(await this.importRepository.listPageBlocks(input.documentId, page.pageNumber)),
        )
      }
    } catch (error) {
      throw asDatabaseError(error)
    }

    const createdAt = this.clock.now()
    const chunks = deriveDocumentChunks({
      documentId: input.documentId,
      blocks: blocks.map((block) => ({ ...block, createdAt })),
      sourceVersion: document.textVersionId,
      rebuildToken: DOCUMENT_CHUNK_REBUILD_TOKEN,
      idForIndex: () => this.ids.generate(),
    })

    try {
      await this.importRepository.replaceChunks(input.documentId, chunks)
    } catch (error) {
      throw asDatabaseError(error)
    }

    return toDocumentChunks(chunks)
  }
}

export class SearchDocumentChunks {
  public constructor(private readonly importRepository: DocumentImportRepositoryPort) {}

  public async execute(input: SearchDocumentChunksInput): Promise<readonly DocumentChunk[]> {
    let query: string
    try {
      query = normalizeSearchQuery(input.query)
    } catch (error) {
      throw validationError(error)
    }

    try {
      return toDocumentChunks(
        await this.importRepository.searchChunks({
          documentId: input.documentId,
          query,
          limit: input.limit ?? DEFAULT_CHUNK_SEARCH_LIMIT,
        }),
      )
    } catch (error) {
      throw asDatabaseError(error)
    }
  }
}

export class AssembleLessonContext {
  public constructor(
    private readonly documentRepository: DocumentRepositoryPort,
    private readonly importRepository: DocumentImportRepositoryPort,
  ) {}

  public async execute(
    input: AssembleLessonContextInput,
  ): Promise<{ chunks: readonly DocumentChunk[]; degradedToSnippetOnly: boolean }> {
    let document: StoredDocumentDetail | undefined
    try {
      document = await this.documentRepository.findById(input.documentId)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (!document) {
      throw new DocumentUseCaseError('DOCUMENT_NOT_FOUND', 'The document was not found.', false)
    }

    let query: string
    try {
      query = normalizeSearchQuery(input.query)
    } catch (error) {
      throw validationError(error)
    }

    let hasFreshChunks: boolean
    try {
      hasFreshChunks = await this.importRepository.hasFreshChunks(
        input.documentId,
        document.textVersionId,
        DOCUMENT_CHUNK_REBUILD_TOKEN,
      )
    } catch (error) {
      throw asDatabaseError(error)
    }

    if (!hasFreshChunks) {
      return { chunks: [], degradedToSnippetOnly: true }
    }

    let searchedChunks: readonly StoredDocumentChunk[]
    try {
      searchedChunks = await this.importRepository.searchChunks({
        documentId: input.documentId,
        query,
        limit: DEFAULT_CHUNK_SEARCH_LIMIT,
      })
    } catch (error) {
      throw asDatabaseError(error)
    }

    return {
      chunks: selectBudgetedChunks(toDocumentChunks(searchedChunks), DEFAULT_CONTEXT_BUDGET),
      degradedToSnippetOnly: false,
    }
  }
}

export class DeleteDocument {
  public constructor(private readonly repository: DocumentRepositoryPort) {}

  public async execute(id: string): Promise<void> {
    let removed: boolean
    try {
      removed = await this.repository.remove(id)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (!removed) {
      throw new DocumentUseCaseError('DOCUMENT_NOT_FOUND', 'The document was not found.', false)
    }
  }
}
