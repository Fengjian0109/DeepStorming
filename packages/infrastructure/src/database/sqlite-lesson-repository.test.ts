import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StoredLessonSession } from '@deepstorming/application'
import { migrateDatabase } from './migrations'
import { openDatabase, type SqliteDatabase } from './database'
import { SqliteLessonRepository } from './sqlite-lesson-repository'

let dir: string
let db: SqliteDatabase
let repo: SqliteLessonRepository

const session = (overrides: Partial<StoredLessonSession> = {}): StoredLessonSession => ({
  id: '00000000-0000-4000-8000-000000000101',
  title: 'Paper Map 课堂',
  status: 'active',
  documentId: '00000000-0000-4000-8000-000000000201',
  documentTitle: 'Paper Map',
  sourceAnchors: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      documentId: '00000000-0000-4000-8000-000000000201',
      startOffset: 4,
      endOffset: 12,
      snippet: 'Evidence',
    },
  ],
  messages: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      lessonId: '00000000-0000-4000-8000-000000000101',
      role: 'tutor',
      content: '我们先从《Paper Map》的这段证据开始：Evidence\n\n你觉得它想解决的核心问题是什么？',
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      promptVersion: 'mock-tutor-v1',
      createdAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
  ...overrides,
})

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'deepstorming-lesson-repo-'))
  db = openDatabase(join(dir, 'app.db'))
  await migrateDatabase(db, { databasePath: join(dir, 'app.db'), userDataPath: dir })
  db.prepare('INSERT INTO learning_documents VALUES (?,?,?,?,?,?,?,?)').run(
    '00000000-0000-4000-8000-000000000201',
    'generic',
    'Paper Map',
    'pasted_text',
    null,
    'hash-paper',
    '2026-07-11T00:00:00.000Z',
    '2026-07-11T00:00:00.000Z',
  )
  repo = new SqliteLessonRepository(db)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('SqliteLessonRepository', () => {
  it('creates, lists, and retrieves sessions with source anchors and messages', async () => {
    await repo.create(session())

    await expect(repo.list()).resolves.toEqual([session()])
    await expect(repo.findById(session().id)).resolves.toEqual(session())
  })

  it('sorts newest sessions first', async () => {
    await repo.create(session({ createdAt: '2026-07-11T00:00:00.000Z' }))
    await repo.create(
      session({
        id: '00000000-0000-4000-8000-000000000102',
        title: 'Later',
        createdAt: '2026-07-11T00:01:00.000Z',
        updatedAt: '2026-07-11T00:01:00.000Z',
        sourceAnchors: [
          {
            ...session().sourceAnchors[0]!,
            id: '00000000-0000-4000-8000-000000000302',
          },
        ],
        messages: [
          {
            ...session().messages[0]!,
            id: '00000000-0000-4000-8000-000000000402',
            lessonId: '00000000-0000-4000-8000-000000000102',
            sourceAnchorIds: ['00000000-0000-4000-8000-000000000302'],
          },
        ],
      }),
    )

    await expect(repo.list()).resolves.toMatchObject([
      { title: 'Later' },
      { title: 'Paper Map 课堂' },
    ])
  })
})
