import {
  countDocumentCharacters,
  documentHashInput,
  normalizeDocumentDraft,
  type DocumentDraft,
  type LearningDocument,
} from '@deepstorming/domain'
import type {
  ClockPort,
  DocumentRepositoryPort,
  DocumentTextHasherPort,
  IdGeneratorPort,
  StoredDocument,
  StoredDocumentDetail,
} from './document-ports'
import { DuplicateDocumentError } from './document-ports'

export type DocumentUseCaseErrorCode =
  | 'DOCUMENT_VALIDATION_FAILED'
  | 'DOCUMENT_DUPLICATE'
  | 'DOCUMENT_NOT_FOUND'
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

export type DocumentDetail = LearningDocument & Readonly<{ plainText: string }>
export type DocumentSearchInput = Readonly<{ query: string }>
export type DocumentSearchResult = Omit<LearningDocument, 'id'> &
  Readonly<{
    documentId: string
    snippet: string
    startOffset: number
    endOffset: number
  }>

const SEARCH_SNIPPET_CONTEXT = 48

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
