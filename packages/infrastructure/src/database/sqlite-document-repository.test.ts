import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StoredDocumentDetail } from '@deepstorming/application'
import { migrateDatabase } from './migrations'
import { openDatabase, type SqliteDatabase } from './database'
import { SqliteDocumentRepository } from './sqlite-document-repository'

let dir: string
let db: SqliteDatabase
let repo: SqliteDocumentRepository

const document = (overrides: Partial<StoredDocumentDetail> = {}): StoredDocumentDetail => ({
  id: '00000000-0000-4000-8000-000000000001',
  textVersionId: '00000000-0000-4000-8000-000000000002',
  documentType: 'generic',
  title: 'Notes',
  sourceKind: 'pasted_text',
  contentHash: 'hash-a',
  characterCount: 4,
  plainText: 'body',
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
  ...overrides,
})

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'deepstorming-doc-repo-'))
  db = openDatabase(join(dir, 'app.db'))
  await migrateDatabase(db, { databasePath: join(dir, 'app.db'), userDataPath: dir })
  repo = new SqliteDocumentRepository(db)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('SqliteDocumentRepository', () => {
  it('creates, lists, and retrieves document details', async () => {
    await repo.create(document())

    expect(await repo.list()).toEqual([
      expect.objectContaining({ title: 'Notes', characterCount: 4 }),
    ])
    expect(JSON.stringify(await repo.list())).not.toContain('plainText')
    await expect(repo.findById(document().id)).resolves.toMatchObject({ plainText: 'body' })
  })

  it('finds duplicate content hashes', async () => {
    await repo.create(document())
    await expect(repo.findByContentHash('hash-a')).resolves.toMatchObject({ id: document().id })
  })

  it('enforces unique content hash', async () => {
    await repo.create(document())
    await expect(
      repo.create(document({ id: '00000000-0000-4000-8000-000000000003' })),
    ).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
  })

  it('deletes text versions through cascade', async () => {
    await repo.create(document())
    await expect(repo.remove(document().id)).resolves.toBe(true)
    expect(db.prepare('SELECT count(*) count FROM document_text_versions').get()).toEqual({
      count: 0,
    })
    await expect(repo.remove(document().id)).resolves.toBe(false)
  })
})
