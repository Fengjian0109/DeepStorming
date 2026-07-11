import type {
  DocumentRepositoryPort,
  StoredDocument,
  StoredDocumentDetail,
} from '@deepstorming/application'
import { DocumentUseCaseError } from '@deepstorming/application'
import { databaseError, type SqliteDatabase } from './database'

type DocumentRow = {
  id: string
  document_type: StoredDocument['documentType']
  title: string
  source_kind: StoredDocument['sourceKind']
  original_file_name: string | null
  content_hash: string
  character_count: number
  created_at: string
  updated_at: string
  plain_text?: string
  text_version_id?: string
}

const mapSummary = (row: DocumentRow): StoredDocument => ({
  id: row.id,
  documentType: row.document_type,
  title: row.title,
  sourceKind: row.source_kind,
  ...(row.original_file_name === null ? {} : { originalFileName: row.original_file_name }),
  contentHash: row.content_hash,
  characterCount: row.character_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapDetail = (row: DocumentRow): StoredDocumentDetail => {
  if (row.plain_text === undefined || row.text_version_id === undefined) {
    throw new Error('invalid document detail row')
  }
  return {
    ...mapSummary(row),
    plainText: row.plain_text,
    textVersionId: row.text_version_id,
  }
}

type ErrorWithCode = Readonly<{ code?: unknown; message?: unknown }>

const isDuplicateContentHashError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as ErrorWithCode
  if (candidate.code === 'DOCUMENT_DUPLICATE') return true
  if (candidate.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return typeof candidate.message === 'string' && candidate.message.includes('content_hash')
  }
  if (candidate.code === 'SQLITE_CONSTRAINT') {
    return typeof candidate.message === 'string' && candidate.message.includes('content_hash')
  }
  return (
    typeof candidate.message === 'string' &&
    candidate.message.includes('UNIQUE constraint failed') &&
    candidate.message.includes('content_hash')
  )
}

export class SqliteDocumentRepository implements DocumentRepositoryPort {
  public constructor(private readonly db: SqliteDatabase) {}

  private safe<T>(fn: () => T): T {
    try {
      return fn()
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }

  private safeCreate<T>(fn: () => T): T {
    try {
      return fn()
    } catch (error) {
      if (isDuplicateContentHashError(error)) {
        throw new DocumentUseCaseError(
          'DOCUMENT_DUPLICATE',
          'This document text has already been imported.',
          false,
        )
      }
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }

  public async list(): Promise<readonly StoredDocument[]> {
    return this.safe(() =>
      (
        this.db
          .prepare(
            `SELECT d.id,d.document_type,d.title,d.source_kind,d.original_file_name,d.content_hash,
                    d.created_at,d.updated_at,v.character_count
             FROM learning_documents d
             JOIN document_text_versions v ON v.document_id = d.id
             ORDER BY d.created_at,d.id`,
          )
          .all() as DocumentRow[]
      ).map(mapSummary),
    )
  }

  public async findById(id: string): Promise<StoredDocumentDetail | undefined> {
    return this.safe(() => {
      const row = this.db
        .prepare(
          `SELECT d.*, v.id text_version_id, v.plain_text, v.character_count
           FROM learning_documents d
           JOIN document_text_versions v ON v.document_id = d.id
           WHERE d.id=?
           ORDER BY v.created_at DESC
           LIMIT 1`,
        )
        .get(id) as DocumentRow | undefined
      return row === undefined ? undefined : mapDetail(row)
    })
  }

  public async findByContentHash(hash: string): Promise<StoredDocument | undefined> {
    return this.safe(() => {
      const row = this.db
        .prepare(
          `SELECT d.id,d.document_type,d.title,d.source_kind,d.original_file_name,d.content_hash,
                  d.created_at,d.updated_at,v.character_count
           FROM learning_documents d
           JOIN document_text_versions v ON v.document_id = d.id
           WHERE d.content_hash=?
           ORDER BY v.created_at DESC
           LIMIT 1`,
        )
        .get(hash) as DocumentRow | undefined
      return row === undefined ? undefined : mapSummary(row)
    })
  }

  public async create(document: StoredDocumentDetail): Promise<StoredDocumentDetail> {
    return this.safeCreate(() =>
      this.db.transaction(() => {
        this.db
          .prepare('INSERT INTO learning_documents VALUES (?,?,?,?,?,?,?,?)')
          .run(
            document.id,
            document.documentType,
            document.title,
            document.sourceKind,
            document.originalFileName ?? null,
            document.contentHash,
            document.createdAt,
            document.updatedAt,
          )
        this.db
          .prepare('INSERT INTO document_text_versions VALUES (?,?,?,?,?)')
          .run(
            document.textVersionId,
            document.id,
            document.plainText,
            document.characterCount,
            document.createdAt,
          )
        return document
      })(),
    )
  }

  public async remove(id: string): Promise<boolean> {
    return this.safe(
      () => this.db.prepare('DELETE FROM learning_documents WHERE id=?').run(id).changes > 0,
    )
  }
}
