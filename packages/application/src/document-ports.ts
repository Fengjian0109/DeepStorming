import type { DocumentSourceKind, DocumentType } from '@deepstorming/domain'

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
  findByContentHash(hash: string): Promise<StoredDocument | undefined>
  create(document: StoredDocumentDetail): Promise<StoredDocumentDetail>
  remove(id: string): Promise<boolean>
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
