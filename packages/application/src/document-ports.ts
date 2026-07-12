import type { DocumentImportJob, DocumentSourceKind, DocumentType } from '@deepstorming/domain'

export type StoredDocument = Readonly<{
  id: string
  documentType: DocumentType
  title: string
  sourceKind: DocumentSourceKind
  originalFileName?: string
  contentHash: string
  characterCount: number
  createdAt: string
  updatedAt: string
}>

export type StoredDocumentDetail = StoredDocument &
  Readonly<{ plainText: string; textVersionId: string }>

export class DuplicateDocumentError extends Error {
  public readonly code = 'DOCUMENT_DUPLICATE' as const

  public constructor(message = 'This document text has already been imported.') {
    super(message)
  }
}

export interface DocumentRepositoryPort {
  list(): Promise<readonly StoredDocument[]>
  findById(id: string): Promise<StoredDocumentDetail | undefined>
  search(query: string): Promise<readonly StoredDocumentDetail[]>
  create(document: StoredDocumentDetail): Promise<StoredDocumentDetail>
  remove(id: string): Promise<boolean>
}

export type StoredDocumentFile = Readonly<{
  documentId: string
  importJobId: string
  originalName: string
  storedPath: string
  contentHash: string
  fileSizeBytes: number
  createdAt: string
}>

export type StoredDocumentPage = Readonly<{
  id: string
  documentId: string
  pageNumber: number
  width: number
  height: number
  text: string
  textHash: string
  createdAt: string
}>

export type StoredDocumentTextBlock = Readonly<{
  id: string
  documentId: string
  pageId: string
  pageNumber: number
  blockIndex: number
  text: string
  x?: number
  y?: number
  width?: number
  height?: number
  createdAt: string
}>

export interface DocumentImportRepositoryPort {
  saveJob(job: DocumentImportJob): Promise<DocumentImportJob>
  updateJob(job: DocumentImportJob): Promise<DocumentImportJob>
  listJobsForDocument(documentId: string): Promise<readonly DocumentImportJob[]>
  saveFile(file: StoredDocumentFile): Promise<StoredDocumentFile>
  replacePagesAndBlocks(
    pages: readonly StoredDocumentPage[],
    blocks: readonly StoredDocumentTextBlock[],
  ): Promise<void>
  listPages(documentId: string): Promise<readonly StoredDocumentPage[]>
  listPageBlocks(
    documentId: string,
    pageNumber: number,
  ): Promise<readonly StoredDocumentTextBlock[]>
}

export interface DocumentTextHasherPort {
  hash(input: string): Promise<string>
}

export interface ClockPort {
  now(): string
}

export interface IdGeneratorPort {
  generate(): string
}
