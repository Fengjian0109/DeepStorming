import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import type { ContextSnapshot } from '@deepstorming/domain'
import { openDatabase } from './database'
import { migrateDatabase } from './migrations'
import { SqliteContextSnapshotRepository } from './sqlite-context-snapshot-repository'

const dirs: string[] = []
afterEach(async () =>
  Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))),
)

it('stores immutable snapshots, activates one, and retains every raw message', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deepstorming-context-'))
  dirs.push(dir)
  const path = join(dir, 'app.db')
  const db = openDatabase(path)
  await migrateDatabase(db, { databasePath: path, userDataPath: dir })
  const documentId = '00000000-0000-4000-8000-000000000101'
  const lessonId = '00000000-0000-4000-8000-000000000201'
  db.prepare(
    "INSERT INTO learning_documents(id,document_type,title,source_kind,content_hash,created_at,updated_at) VALUES (?,'textbook','doc','pasted_text','hash','2026-07-15','2026-07-15')",
  ).run(documentId)
  db.prepare(
    "INSERT INTO lesson_sessions(id,title,status,document_id,document_title,created_at,updated_at,current_state,lesson_mode) VALUES (?,'lesson','active',?,'doc','2026-07-15','2026-07-15','probing','standard')",
  ).run(lessonId, documentId)
  for (const [index, id] of [
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000302',
  ].entries()) {
    db.prepare(
      "INSERT INTO lesson_messages(id,lesson_id,role,content,source_anchor_ids_json,model_run_id,prompt_version,message_index,created_at) VALUES (?,?,'learner','raw', '[]',NULL,'v1',?,'2026-07-15')",
    ).run(id, lessonId, index)
  }
  const snapshot: ContextSnapshot = {
    id: '00000000-0000-4000-8000-000000000401',
    lessonId,
    version: 1,
    modelName: 'deepseek-chat',
    contextWindowTokens: 65_536,
    estimatedInputTokens: 44_000,
    reservedOutputTokens: 2_000,
    remainingTokens: 19_536,
    remainingPercent: 29.81,
    thresholdPercent: 30,
    coveredMessageIds: [
      '00000000-0000-4000-8000-000000000301',
      '00000000-0000-4000-8000-000000000302',
    ],
    preservedRecentMessageIds: ['00000000-0000-4000-8000-000000000302'],
    summaryMarkdown: 'summary',
    facts: ['fact'],
    mastery: [],
    misconceptions: [],
    unresolvedQuestions: [],
    sourceAnchorIds: [],
    figureIds: [],
    createdAt: '2026-07-15T02:00:00.000Z',
  }
  const repository = new SqliteContextSnapshotRepository(db)
  expect(await repository.create(snapshot)).toBe('created')
  expect(await repository.create(snapshot)).toBe('exists')
  expect(await repository.activate(lessonId, snapshot.id)).toBe('activated')
  expect(await repository.findActive(lessonId)).toEqual(snapshot)
  expect(await repository.listForLesson(lessonId)).toEqual([snapshot])
  expect(
    db.prepare('SELECT count(*) count FROM lesson_messages WHERE lesson_id=?').get(lessonId),
  ).toEqual({ count: 2 })
  expect(() =>
    db.prepare('UPDATE context_snapshots SET version=2 WHERE id=?').run(snapshot.id),
  ).toThrow()
  db.close()
})
