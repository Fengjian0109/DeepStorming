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
