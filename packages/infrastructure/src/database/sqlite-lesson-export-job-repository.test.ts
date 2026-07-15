import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { openDatabase } from './database'
import { migrateDatabase } from './migrations'
import { SqliteLessonExportJobRepository } from './sqlite-lesson-export-job-repository'

const dirs: string[] = []
afterEach(async () =>
  Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))),
)

it('persists export jobs and rejects duplicate operation ids idempotently', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deepstorming-export-job-'))
  dirs.push(dir)
  const db = openDatabase(join(dir, 'app.db'))
  await migrateDatabase(db, { databasePath: join(dir, 'app.db'), userDataPath: dir })
  const repository = new SqliteLessonExportJobRepository(db)
  const lessonId = '00000000-0000-4000-8000-000000000101'
  db.prepare(
    "INSERT INTO learning_documents(id,document_type,title,source_kind,content_hash,created_at,updated_at) VALUES (?,'textbook',?,'pasted_text',?,?,?)",
  ).run('00000000-0000-4000-8000-000000000201', 'doc', 'hash', '2026-07-15', '2026-07-15')
  db.prepare(
    "INSERT INTO lesson_sessions(id,title,status,document_id,document_title,created_at,updated_at,current_state,lesson_mode) VALUES (?,?,'completed',?,?,?,?,'completed','standard')",
  ).run(
    lessonId,
    'lesson',
    '00000000-0000-4000-8000-000000000201',
    'doc',
    '2026-07-15',
    '2026-07-15',
  )
  const job = {
    operationId: '00000000-0000-4000-8000-000000000301',
    lessonId,
    format: 'markdown' as const,
    targetPath: '/tmp/a.md',
    status: 'started' as const,
    errorCode: null,
    startedAt: '2026-07-15',
    finishedAt: null,
  }
  expect(await repository.create(job)).toBe('created')
  expect(await repository.create(job)).toBe('exists')
  await repository.save({ ...job, status: 'succeeded', finishedAt: '2026-07-15T01:00:00Z' })
  expect(await repository.find(job.operationId)).toMatchObject({
    status: 'succeeded',
    targetPath: '/tmp/a.md',
  })
  db.close()
})
