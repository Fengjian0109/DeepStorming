import type {
  DocumentImportRepositoryPort,
  StoredDocumentChunk,
  StoredDocumentFile,
  StoredDocumentPage,
  StoredDocumentTextBlock,
} from '@deepstorming/application'
import {
  normalizeDocumentImportJob,
  type DocumentImportError,
  type DocumentImportJob,
} from '@deepstorming/domain'
import { databaseError, type SqliteDatabase } from './database'

type ImportJobRow = {
  id: string
  document_id: string | null
  source_kind: 'pdf_file'
  status: DocumentImportJob['status']
  original_name: string
  file_size_bytes: number
  content_hash: string
  error_json: string | null
  created_at: string
  updated_at: string
  finished_at: string | null
}

type FileRow = {
  document_id: string
  import_job_id: string
  original_name: string
  stored_path: string
  content_hash: string
  file_size_bytes: number
  created_at: string
}

type PageRow = {
  id: string
  document_id: string
  page_number: number
  width: number
  height: number
  text: string
  text_hash: string
  created_at: string
}

type BlockRow = {
  id: string
  document_id: string
  page_id: string
  page_number: number
  block_index: number
  text: string
  x: number | null
  y: number | null
  width: number | null
  height: number | null
  created_at: string
}

type ChunkRow = {
  id: string
  document_id: string
  chunk_index: number
  page_number_start: number
  page_number_end: number
  block_ids_json: string
  text: string
  char_count: number
  source_version: string
  rebuild_token: string
  created_at: string
}

const parseError = (value: string | null): DocumentImportError | null => {
  if (value === null) return null
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('invalid import error json')
  const candidate = parsed as Partial<DocumentImportError>
  if (
    typeof candidate.code !== 'string' ||
    typeof candidate.message !== 'string' ||
    typeof candidate.retryable !== 'boolean'
  ) {
    throw new Error('invalid import error json')
  }
  return {
    code: candidate.code,
    message: candidate.message,
    retryable: candidate.retryable,
  }
}

const serializeError = (error: DocumentImportError | null): string | null =>
  error === null
    ? null
    : JSON.stringify({
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      })

const mapJob = (row: ImportJobRow): DocumentImportJob =>
  normalizeDocumentImportJob({
    id: row.id,
    documentId: row.document_id,
    sourceKind: row.source_kind,
    status: row.status,
    originalName: row.original_name,
    fileSizeBytes: row.file_size_bytes,
    contentHash: row.content_hash,
    error: parseError(row.error_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  })

const mapFile = (row: FileRow): StoredDocumentFile => ({
  documentId: row.document_id,
  importJobId: row.import_job_id,
  originalName: row.original_name,
  storedPath: row.stored_path,
  contentHash: row.content_hash,
  fileSizeBytes: row.file_size_bytes,
  createdAt: row.created_at,
})

const mapPage = (row: PageRow): StoredDocumentPage => ({
  id: row.id,
  documentId: row.document_id,
  pageNumber: row.page_number,
  width: row.width,
  height: row.height,
  text: row.text,
  textHash: row.text_hash,
  createdAt: row.created_at,
})

const mapBlock = (row: BlockRow): StoredDocumentTextBlock => ({
  id: row.id,
  documentId: row.document_id,
  pageId: row.page_id,
  pageNumber: row.page_number,
  blockIndex: row.block_index,
  text: row.text,
  ...(row.x === null ? {} : { x: row.x }),
  ...(row.y === null ? {} : { y: row.y }),
  ...(row.width === null ? {} : { width: row.width }),
  ...(row.height === null ? {} : { height: row.height }),
  createdAt: row.created_at,
})

const parseBlockIds = (value: string): readonly string[] => {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('invalid document chunk block ids json')
  }
  return parsed
}

const mapChunk = (row: ChunkRow): StoredDocumentChunk => ({
  id: row.id,
  documentId: row.document_id,
  chunkIndex: row.chunk_index,
  pageNumberStart: row.page_number_start,
  pageNumberEnd: row.page_number_end,
  blockIds: parseBlockIds(row.block_ids_json),
  text: row.text,
  charCount: row.char_count,
  sourceVersion: row.source_version,
  rebuildToken: row.rebuild_token,
  createdAt: row.created_at,
})

const validateChunkDocumentIds = (
  documentId: string,
  chunks: readonly StoredDocumentChunk[],
): void => {
  for (const chunk of chunks) {
    if (chunk.documentId !== documentId) {
      throw new Error('Document chunk documentId does not match replace target')
    }
  }
}

export class SqliteDocumentImportRepository implements DocumentImportRepositoryPort {
  public constructor(private readonly db: SqliteDatabase) {}

  private safe<T>(fn: () => T): T {
    try {
      return fn()
    } catch {
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }

  public async saveJob(job: DocumentImportJob): Promise<DocumentImportJob> {
    return this.safe(() => {
      const normalized = normalizeDocumentImportJob(job)
      this.db
        .prepare(
          `INSERT INTO document_import_jobs
           (id,document_id,source_kind,status,original_name,file_size_bytes,content_hash,error_json,created_at,updated_at,finished_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          normalized.id,
          normalized.documentId,
          normalized.sourceKind,
          normalized.status,
          normalized.originalName,
          normalized.fileSizeBytes,
          normalized.contentHash,
          serializeError(normalized.error),
          normalized.createdAt,
          normalized.updatedAt,
          normalized.finishedAt,
        )
      return normalized
    })
  }

  public async updateJob(job: DocumentImportJob): Promise<DocumentImportJob> {
    return this.safe(() => {
      const normalized = normalizeDocumentImportJob(job)
      this.db
        .prepare(
          `UPDATE document_import_jobs
           SET document_id=?, source_kind=?, status=?, original_name=?, file_size_bytes=?,
               content_hash=?, error_json=?, created_at=?, updated_at=?, finished_at=?
           WHERE id=?`,
        )
        .run(
          normalized.documentId,
          normalized.sourceKind,
          normalized.status,
          normalized.originalName,
          normalized.fileSizeBytes,
          normalized.contentHash,
          serializeError(normalized.error),
          normalized.createdAt,
          normalized.updatedAt,
          normalized.finishedAt,
          normalized.id,
        )
      return normalized
    })
  }

  public async listJobsForDocument(documentId: string): Promise<readonly DocumentImportJob[]> {
    return this.safe(() =>
      (
        this.db
          .prepare(
            `SELECT id,document_id,source_kind,status,original_name,file_size_bytes,content_hash,
                    error_json,created_at,updated_at,finished_at
             FROM document_import_jobs
             WHERE document_id=?
             ORDER BY created_at,id`,
          )
          .all(documentId) as ImportJobRow[]
      ).map(mapJob),
    )
  }

  public async saveFile(file: StoredDocumentFile): Promise<StoredDocumentFile> {
    return this.safe(() => {
      this.db
        .prepare(
          `INSERT INTO document_files
           (document_id,import_job_id,original_name,stored_path,content_hash,file_size_bytes,created_at)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(document_id) DO UPDATE SET
             import_job_id=excluded.import_job_id,
             original_name=excluded.original_name,
             stored_path=excluded.stored_path,
             content_hash=excluded.content_hash,
             file_size_bytes=excluded.file_size_bytes,
             created_at=excluded.created_at`,
        )
        .run(
          file.documentId,
          file.importJobId,
          file.originalName,
          file.storedPath,
          file.contentHash,
          file.fileSizeBytes,
          file.createdAt,
        )
      const row = this.db
        .prepare(
          `SELECT document_id,import_job_id,original_name,stored_path,content_hash,file_size_bytes,created_at
           FROM document_files
           WHERE document_id=?`,
        )
        .get(file.documentId) as FileRow
      return mapFile(row)
    })
  }

  public async replacePagesAndBlocks(
    pages: readonly StoredDocumentPage[],
    blocks: readonly StoredDocumentTextBlock[],
  ): Promise<void> {
    return this.safe(() =>
      this.db.transaction(() => {
        const documentIds = new Set(pages.map((page) => page.documentId))
        for (const block of blocks) documentIds.add(block.documentId)
        for (const documentId of documentIds) {
          this.db.prepare('DELETE FROM document_pages WHERE document_id=?').run(documentId)
        }

        const insertPage = this.db.prepare(
          `INSERT INTO document_pages
           (id,document_id,page_number,width,height,text,text_hash,created_at)
           VALUES (?,?,?,?,?,?,?,?)`,
        )
        for (const page of pages) {
          insertPage.run(
            page.id,
            page.documentId,
            page.pageNumber,
            page.width,
            page.height,
            page.text,
            page.textHash,
            page.createdAt,
          )
        }

        const insertBlock = this.db.prepare(
          `INSERT INTO document_text_blocks
           (id,document_id,page_id,page_number,block_index,text,x,y,width,height,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        for (const block of blocks) {
          insertBlock.run(
            block.id,
            block.documentId,
            block.pageId,
            block.pageNumber,
            block.blockIndex,
            block.text,
            block.x ?? null,
            block.y ?? null,
            block.width ?? null,
            block.height ?? null,
            block.createdAt,
          )
        }
      })(),
    )
  }

  public async listPages(documentId: string): Promise<readonly StoredDocumentPage[]> {
    return this.safe(() =>
      (
        this.db
          .prepare(
            `SELECT id,document_id,page_number,width,height,text,text_hash,created_at
             FROM document_pages
             WHERE document_id=?
             ORDER BY page_number`,
          )
          .all(documentId) as PageRow[]
      ).map(mapPage),
    )
  }

  public async listPageBlocks(
    documentId: string,
    pageNumber: number,
  ): Promise<readonly StoredDocumentTextBlock[]> {
    return this.safe(() =>
      (
        this.db
          .prepare(
            `SELECT id,document_id,page_id,page_number,block_index,text,x,y,width,height,created_at
             FROM document_text_blocks
             WHERE document_id=? AND page_number=?
             ORDER BY block_index`,
          )
          .all(documentId, pageNumber) as BlockRow[]
      ).map(mapBlock),
    )
  }

  public async findTextBlock(
    documentId: string,
    pageNumber: number,
    blockId: string,
  ): Promise<StoredDocumentTextBlock | undefined> {
    return this.safe(() => {
      const row = this.db
        .prepare(
          `SELECT id,document_id,page_id,page_number,block_index,text,x,y,width,height,created_at
           FROM document_text_blocks
           WHERE document_id=? AND page_number=? AND id=?`,
        )
        .get(documentId, pageNumber, blockId) as BlockRow | undefined
      return row === undefined ? undefined : mapBlock(row)
    })
  }

  public async replaceChunks(
    documentId: string,
    chunks: readonly StoredDocumentChunk[],
  ): Promise<void> {
    validateChunkDocumentIds(documentId, chunks)
    return this.safe(() =>
      this.db.transaction(() => {
        this.db.prepare('DELETE FROM document_chunks WHERE document_id=?').run(documentId)

        const insertChunk = this.db.prepare(
          `INSERT INTO document_chunks
           (id,document_id,chunk_index,page_number_start,page_number_end,block_ids_json,text,char_count,source_version,rebuild_token,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )

        for (const chunk of chunks) {
          insertChunk.run(
            chunk.id,
            chunk.documentId,
            chunk.chunkIndex,
            chunk.pageNumberStart,
            chunk.pageNumberEnd,
            JSON.stringify(chunk.blockIds),
            chunk.text,
            chunk.charCount,
            chunk.sourceVersion,
            chunk.rebuildToken,
            chunk.createdAt,
          )
        }
      })(),
    )
  }

  public async listChunks(documentId: string): Promise<readonly StoredDocumentChunk[]> {
    return this.safe(() =>
      (
        this.db
          .prepare(
            `SELECT id,document_id,chunk_index,page_number_start,page_number_end,block_ids_json,text,
                    char_count,source_version,rebuild_token,created_at
             FROM document_chunks
             WHERE document_id=?
             ORDER BY chunk_index,id`,
          )
          .all(documentId) as ChunkRow[]
      ).map(mapChunk),
    )
  }

  public async searchChunks(input: {
    documentId: string
    query: string
    limit: number
  }): Promise<readonly StoredDocumentChunk[]> {
    return this.safe(() =>
      (
        this.db
          .prepare(
            `SELECT c.id,c.document_id,c.chunk_index,c.page_number_start,c.page_number_end,
                    c.block_ids_json,c.text,c.char_count,c.source_version,c.rebuild_token,c.created_at
             FROM document_chunks_fts f
             INNER JOIN document_chunks c ON c.id = f.chunk_id
             WHERE f.document_id=? AND document_chunks_fts MATCH ?
             ORDER BY bm25(document_chunks_fts), c.chunk_index, c.id
             LIMIT ?`,
          )
          .all(input.documentId, input.query, input.limit) as ChunkRow[]
      ).map(mapChunk),
    )
  }

  public async hasFreshChunks(
    documentId: string,
    sourceVersion: string,
    rebuildToken: string,
  ): Promise<boolean> {
    return this.safe(() => {
      const row = this.db
        .prepare(
          `SELECT EXISTS(
               SELECT 1
               FROM document_chunks
               WHERE document_id=?
             ) has_chunks,
             EXISTS(
               SELECT 1
               FROM document_chunks
               WHERE document_id=?
                 AND source_version=?
                 AND rebuild_token=?
             ) has_matching_chunks,
             EXISTS(
               SELECT 1
               FROM document_chunks
               WHERE document_id=?
                 AND (source_version<>? OR rebuild_token<>?)
             ) has_stale_chunks`,
        )
        .get(
          documentId,
          documentId,
          sourceVersion,
          rebuildToken,
          documentId,
          sourceVersion,
          rebuildToken,
        ) as {
        has_chunks: number
        has_matching_chunks: number
        has_stale_chunks: number
      }

      return row.has_chunks === 1 && row.has_matching_chunks === 1 && row.has_stale_chunks === 0
    })
  }
}
