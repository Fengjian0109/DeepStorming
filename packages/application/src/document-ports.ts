import type {
  DocumentFigure,
  DocumentFigureAssetKind,
  DocumentImportJob,
  DocumentSourceKind,
  DocumentType,
} from '@deepstorming/domain'
import type { CancellationToken } from './provider-ports'

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

export type StoredDocumentChunk = Readonly<{
  id: string
  documentId: string
  chunkIndex: number
  pageNumberStart: number
  pageNumberEnd: number
  blockIds: readonly string[]
  text: string
  charCount: number
  sourceVersion: string
  rebuildToken: string
  createdAt: string
}>

export interface DocumentFigureRepositoryPort {
  isFigureExtractionComplete(documentId: string): Promise<boolean>
  completeFigureExtraction(
    documentId: string,
    figures: readonly StoredDocumentFigure[],
  ): Promise<void>
  listFigures(documentId: string): Promise<readonly StoredDocumentFigure[]>
}

export interface DocumentImportRepositoryPort extends DocumentFigureRepositoryPort {
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
  findTextBlock(
    documentId: string,
    pageNumber: number,
    blockId: string,
  ): Promise<StoredDocumentTextBlock | undefined>
  replaceChunks(documentId: string, chunks: readonly StoredDocumentChunk[]): Promise<void>
  listChunks(documentId: string): Promise<readonly StoredDocumentChunk[]>
  searchChunks(input: {
    documentId: string
    query: string
    limit: number
  }): Promise<readonly StoredDocumentChunk[]>
  hasFreshChunks(documentId: string, sourceVersion: string, rebuildToken: string): Promise<boolean>
}

export type PdfFileDescription = Readonly<{
  fileSizeBytes: number
  contentHash: string
}>

export type StoredPdfFile = Readonly<{
  /** Relocatable path persisted as metadata. */
  storedPath: string
  /** App-private absolute path used only by main-process processing adapters. */
  processingPath: string
}>

export interface PdfFileStorePort {
  describe(filePath: string): Promise<PdfFileDescription>
  copyIntoLibrary(
    input: Readonly<{ filePath: string; contentHash: string }>,
  ): Promise<StoredPdfFile>
}

export type ExtractedPdfTextBlock = Readonly<{
  text: string
  x?: number
  y?: number
  width?: number
  height?: number
}>

export type ExtractedPdfPage = Readonly<{
  pageNumber: number
  width: number
  height: number
  text: string
  blocks: readonly ExtractedPdfTextBlock[]
}>

export interface PdfTextExtractorPort {
  extract(filePath: string): Promise<Readonly<{ pages: readonly ExtractedPdfPage[] }>>
}

export type ExtractedDocumentFigureAsset = Readonly<{
  pageNumber: number
  label: string
  caption: string
  assetKind: DocumentFigureAssetKind
  width: number
  height: number
  data: Uint8Array
}>

export interface PdfFigureExtractorPort {
  extract(
    input: Readonly<{
      filePath: string
      pages: readonly Readonly<{ pageNumber: number; text: string }>[]
    }>,
    token: CancellationToken,
  ): Promise<readonly ExtractedDocumentFigureAsset[]>
}

export type StoredDocumentFigure = DocumentFigure

export interface DocumentAssetStorePort {
  writeFigure(
    input: Readonly<{
      documentId: string
      assetId: string
      data: Uint8Array
    }>,
  ): Promise<Readonly<{ assetId: string; storedPath: string }>>
  readFigure(documentId: string, assetId: string): Promise<Uint8Array>
  deleteFigure(documentId: string, assetId: string): Promise<void>
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
