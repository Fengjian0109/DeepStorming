import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StoredDocumentDetail } from '@deepstorming/application'
import type { DocumentImportJob } from '@deepstorming/domain'
import { openDatabase, type SqliteDatabase } from './database'
import { migrateDatabase } from './migrations'
import { SqliteDocumentImportRepository } from './sqlite-document-import-repository'
import { SqliteDocumentRepository } from './sqlite-document-repository'

let dir: string
let db: SqliteDatabase
let repo: SqliteDocumentImportRepository
let documentRepo: SqliteDocumentRepository

const documentId = '00000000-0000-4000-8000-000000000101'
const jobId = '00000000-0000-4000-8000-000000000201'
const pageId = '00000000-0000-4000-8000-000000000301'

const document = (overrides: Partial<StoredDocumentDetail> = {}): StoredDocumentDetail => ({
  id: documentId,
  textVersionId: '00000000-0000-4000-8000-000000000102',
  documentType: 'paper',
  title: 'PDF Paper',
  sourceKind: 'text_file',
  originalFileName: 'paper.pdf',
  contentHash: 'pdf-document-hash',
  characterCount: 12,
  plainText: 'Paper text.',
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
  ...overrides,
})

const importJob = (overrides: Partial<DocumentImportJob> = {}): DocumentImportJob => ({
  id: jobId,
  documentId: null,
  sourceKind: 'pdf_file',
  status: 'queued',
  originalName: 'paper.pdf',
  fileSizeBytes: 4096,
  contentHash: 'a'.repeat(64),
  error: null,
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
  finishedAt: null,
  ...overrides,
})

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'deepstorming-pdf-repo-'))
  db = openDatabase(join(dir, 'app.db'))
  await migrateDatabase(db, { databasePath: join(dir, 'app.db'), userDataPath: dir })
  repo = new SqliteDocumentImportRepository(db)
  documentRepo = new SqliteDocumentRepository(db)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('SqliteDocumentImportRepository', () => {
  it('saves a queued job without leaking local paths', async () => {
    await expect(
      repo.saveJob(importJob({ originalName: '/Users/me/private/paper.pdf' })),
    ).resolves.toMatchObject({
      id: jobId,
      status: 'queued',
      originalName: 'paper.pdf',
      error: null,
    })

    expect(JSON.stringify(await repo.listJobsForDocument(documentId))).not.toContain('/Users/me')
  })

  it('updates a queued job to parsing', async () => {
    await repo.saveJob(importJob())
    await expect(
      repo.updateJob(importJob({ status: 'parsing', updatedAt: '2026-07-12T00:01:00.000Z' })),
    ).resolves.toMatchObject({ id: jobId, status: 'parsing' })
  })

  it('persists ready pages and text blocks for a document', async () => {
    await documentRepo.create(document())
    await repo.saveJob(importJob())
    await repo.updateJob(
      importJob({
        documentId,
        status: 'ready',
        updatedAt: '2026-07-12T00:02:00.000Z',
        finishedAt: '2026-07-12T00:02:00.000Z',
      }),
    )
    await repo.saveFile({
      documentId,
      importJobId: jobId,
      originalName: 'paper.pdf',
      storedPath: 'documents/00/paper.pdf',
      contentHash: 'a'.repeat(64),
      fileSizeBytes: 4096,
      createdAt: '2026-07-12T00:02:00.000Z',
    })
    await repo.replacePagesAndBlocks(
      [
        {
          id: pageId,
          documentId,
          pageNumber: 1,
          width: 612,
          height: 792,
          text: 'Paper text.',
          textHash: 'b'.repeat(64),
          createdAt: '2026-07-12T00:02:00.000Z',
        },
      ],
      [
        {
          id: '00000000-0000-4000-8000-000000000401',
          documentId,
          pageId,
          pageNumber: 1,
          blockIndex: 0,
          text: 'Paper text.',
          x: 12,
          y: 20,
          width: 100,
          height: 16,
          createdAt: '2026-07-12T00:02:00.000Z',
        },
      ],
    )

    await expect(repo.listPages(documentId)).resolves.toEqual([
      expect.objectContaining({ id: pageId, pageNumber: 1, text: 'Paper text.' }),
    ])
    await expect(repo.listPageBlocks(documentId, 1)).resolves.toEqual([
      expect.objectContaining({ pageId, blockIndex: 0, text: 'Paper text.' }),
    ])
  })

  it('persists failed jobs with safe error summaries', async () => {
    await repo.saveJob(importJob())
    await expect(
      repo.updateJob(
        importJob({
          status: 'failed',
          error: {
            code: 'DOCUMENT_PDF_PARSE_FAILED',
            message: 'The PDF could not be parsed.',
            retryable: false,
          },
          updatedAt: '2026-07-12T00:03:00.000Z',
          finishedAt: '2026-07-12T00:03:00.000Z',
        }),
      ),
    ).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'DOCUMENT_PDF_PARSE_FAILED', retryable: false },
    })
  })

  it('lists jobs for a document', async () => {
    await documentRepo.create(document())
    await repo.saveJob(importJob({ documentId, status: 'ready' }))
    await repo.saveJob(
      importJob({
        id: '00000000-0000-4000-8000-000000000202',
        status: 'queued',
      }),
    )

    await expect(repo.listJobsForDocument(documentId)).resolves.toEqual([
      expect.objectContaining({ id: jobId, documentId, status: 'ready' }),
    ])
  })
})
