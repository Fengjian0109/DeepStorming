import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { openDatabase } from './database'
import { MIGRATIONS, migrateDatabase } from './migrations'

const dirs: string[] = []
afterEach(async () =>
  Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))),
)
const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deepstorming-migrate-'))
  dirs.push(dir)
  return dir
}

test('applies migration one once and creates the provider tables', async () => {
  const dir = await setup()
  const db = openDatabase(join(dir, 'app.db'))
  await migrateDatabase(db, { databasePath: join(dir, 'app.db'), userDataPath: dir })
  await migrateDatabase(db, { databasePath: join(dir, 'app.db'), userDataPath: dir })
  expect(db.prepare('SELECT count(*) count FROM schema_migrations').get()).toEqual({
    count: MIGRATIONS.length,
  })
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
    name: string
  }>
  const names = rows.map((x) => x.name)
  expect(names).toEqual(
    expect.arrayContaining([
      'app_settings',
      'ai_providers',
      'provider_write_requests',
      'provider_test_operations',
    ]),
  )
  db.close()
})

test('applies migration two and creates document tables', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'deepstorming-doc-migration-'))
  const path = join(dir, 'app.db')
  const db = openDatabase(path)
  await migrateDatabase(db, { databasePath: path, userDataPath: dir })

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>
  expect(tables.map((row) => row.name)).toContain('learning_documents')
  expect(tables.map((row) => row.name)).toContain('document_text_versions')
  expect(tables.map((row) => row.name)).toContain('document_import_jobs')
  expect(tables.map((row) => row.name)).toContain('document_files')
  expect(tables.map((row) => row.name)).toContain('document_pages')
  expect(tables.map((row) => row.name)).toContain('document_text_blocks')
  expect(tables.map((row) => row.name)).toContain('document_figures')
  expect(db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all()).toEqual([
    { version: 1, name: 'provider_foundation' },
    { version: 2, name: 'document_text_import' },
    { version: 3, name: 'lesson_session_foundation' },
    { version: 4, name: 'lesson_message_foundation' },
    { version: 5, name: 'lesson_model_run_foundation' },
    { version: 6, name: 'lesson_follow_up_operation' },
    { version: 7, name: 'lesson_model_run_error_summary' },
    { version: 8, name: 'pdf_document_foundation' },
    { version: 9, name: 'lesson_source_target' },
    { version: 10, name: 'document_chunk_storage' },
    { version: 11, name: 'document_chunk_fts_sync' },
    { version: 12, name: 'lesson_state_machine' },
    { version: 13, name: 'lesson_mastery_evidence' },
    { version: 14, name: 'lesson_review_scheduler' },
    { version: 15, name: 'paper_lesson_metadata' },
    { version: 16, name: 'learning_settings' },
    { version: 17, name: 'lesson_tutor_configuration' },
    { version: 18, name: 'structured_tutor_turn' },
    { version: 19, name: 'document_figure_assets' },
    { version: 20, name: 'lesson_memory_lifecycle' },
    { version: 21, name: 'lesson_export_jobs' },
  ])

  db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('adds durable lesson lifecycle and versioned document memory storage', async () => {
  const dir = await setup()
  const path = join(dir, 'app.db')
  const db = openDatabase(path)
  await migrateDatabase(db, { databasePath: path, userDataPath: dir })

  const sessionColumns = db.prepare("PRAGMA table_info('lesson_sessions')").all() as Array<{
    name: string
  }>
  expect(sessionColumns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      'lesson_memory_json',
      'lesson_end_job_json',
      'post_lesson_action',
      'completed_at',
      'review_response',
    ]),
  )
  expect(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get('document_learning_memories'),
  ).toEqual({ name: 'document_learning_memories' })
  expect(
    db.prepare('SELECT version,name FROM schema_migrations ORDER BY version DESC LIMIT 1').get(),
  ).toEqual({ version: 21, name: 'lesson_export_jobs' })
  db.close()
})

test('applies migrations three and four and creates lesson tables', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'deepstorming-lesson-migration-'))
  const path = join(dir, 'app.db')
  const db = openDatabase(path)
  await migrateDatabase(db, { databasePath: path, userDataPath: dir })

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>
  expect(tables.map((row) => row.name)).toContain('lesson_sessions')
  expect(tables.map((row) => row.name)).toContain('lesson_source_anchors')
  expect(tables.map((row) => row.name)).toContain('lesson_messages')
  expect(tables.map((row) => row.name)).toContain('lesson_model_runs')
  expect(tables.map((row) => row.name)).toContain('lesson_mastery_evidence')
  expect(tables.map((row) => row.name)).toContain('lesson_misconception_signals')
  expect(db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all()).toEqual([
    { version: 1, name: 'provider_foundation' },
    { version: 2, name: 'document_text_import' },
    { version: 3, name: 'lesson_session_foundation' },
    { version: 4, name: 'lesson_message_foundation' },
    { version: 5, name: 'lesson_model_run_foundation' },
    { version: 6, name: 'lesson_follow_up_operation' },
    { version: 7, name: 'lesson_model_run_error_summary' },
    { version: 8, name: 'pdf_document_foundation' },
    { version: 9, name: 'lesson_source_target' },
    { version: 10, name: 'document_chunk_storage' },
    { version: 11, name: 'document_chunk_fts_sync' },
    { version: 12, name: 'lesson_state_machine' },
    { version: 13, name: 'lesson_mastery_evidence' },
    { version: 14, name: 'lesson_review_scheduler' },
    { version: 15, name: 'paper_lesson_metadata' },
    { version: 16, name: 'learning_settings' },
    { version: 17, name: 'lesson_tutor_configuration' },
    { version: 18, name: 'structured_tutor_turn' },
    { version: 19, name: 'document_figure_assets' },
    { version: 20, name: 'lesson_memory_lifecycle' },
    { version: 21, name: 'lesson_export_jobs' },
  ])
  const columns = db.prepare('PRAGMA table_info(lesson_model_runs)').all() as Array<{
    name: string
  }>
  expect(columns.map((column) => column.name)).toContain('error_summary_json')

  const chunkColumns = db.prepare("PRAGMA table_info('document_chunks')").all() as Array<{
    name: string
  }>
  expect(chunkColumns.map((column) => column.name)).toEqual(
    expect.arrayContaining(['chunk_index', 'block_ids_json', 'source_version', 'rebuild_token']),
  )
  expect(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_chunks_fts'")
      .get(),
  ).toEqual({ name: 'document_chunks_fts' })
  expect(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lesson_steps'").get(),
  ).toEqual({ name: 'lesson_steps' })
  const sessionColumns = db.prepare("PRAGMA table_info('lesson_sessions')").all() as Array<{
    name: string
  }>
  expect(sessionColumns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      'current_state',
      'lesson_mode',
      'paper_profile_json',
      'lesson_pace',
      'tutor_snapshot_json',
    ]),
  )
  const messageColumns = db.prepare("PRAGMA table_info('lesson_messages')").all() as Array<{
    name: string
  }>
  expect(messageColumns.map((column) => column.name)).toContain('tutor_turn_json')
  const stepColumns = db.prepare("PRAGMA table_info('lesson_steps')").all() as Array<{
    name: string
  }>
  expect(stepColumns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      'id',
      'lesson_id',
      'sequence_no',
      'state_before',
      'state_after',
      'action_type',
      'status',
      'model_run_id',
      'message_id',
      'rationale',
      'error_summary_json',
      'created_at',
      'finished_at',
    ]),
  )
  const triggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='document_chunks'")
    .all() as Array<{ name: string }>
  expect(triggers.map((trigger) => trigger.name)).toEqual(
    expect.arrayContaining([
      'document_chunks_fts_insert',
      'document_chunks_fts_delete',
      'document_chunks_fts_update',
    ]),
  )

  db.close()
  rmSync(dir, { recursive: true, force: true })
})

test('applies migrations through learning settings and creates review scheduler tables', async () => {
  const dir = await setup()
  const path = join(dir, 'app.db')
  const db = openDatabase(path)
  await migrateDatabase(db, { databasePath: path, userDataPath: dir })

  expect(MIGRATIONS.at(-1)).toMatchObject({
    version: 21,
    name: 'lesson_export_jobs',
  })
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>
  expect(tables.map((row) => row.name)).toEqual(
    expect.arrayContaining([
      'lesson_review_items',
      'lesson_review_events',
      'user_profile',
      'tutor_profiles',
      'tutor_profile_revisions',
      'classroom_preferences',
      'document_figures',
    ]),
  )
  const reviewItemIndexes = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='lesson_review_items'")
    .all() as Array<{ name: string }>
  expect(reviewItemIndexes.map((row) => row.name)).toEqual(
    expect.arrayContaining(['lesson_review_items_lesson_due', 'lesson_review_items_due']),
  )

  db.close()
})

test('enforces lesson state machine migration constraints', async () => {
  const dir = await setup()
  const path = join(dir, 'app.db')
  const db = openDatabase(path)
  await migrateDatabase(db, { databasePath: path, userDataPath: dir })

  expect(MIGRATIONS.find((migration) => migration.version === 12)).toMatchObject({
    version: 12,
    name: 'lesson_state_machine',
  })
  db.prepare(
    `INSERT INTO learning_documents
     (id,document_type,title,source_kind,original_file_name,content_hash,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000000201',
    'generic',
    'Paper Map',
    'pasted_text',
    null,
    'hash-paper',
    '2026-07-13T00:00:00.000Z',
    '2026-07-13T00:00:00.000Z',
  )
  db.prepare(
    `INSERT INTO lesson_sessions
     (id,title,status,document_id,document_title,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000000101',
    'Paper Map 课堂',
    'active',
    '00000000-0000-4000-8000-000000000201',
    'Paper Map',
    '2026-07-13T00:00:00.000Z',
    '2026-07-13T00:00:00.000Z',
  )
  db.prepare(
    `INSERT INTO lesson_source_anchors
     (id,lesson_id,document_id,start_offset,end_offset,snippet)
     VALUES (?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    0,
    8,
    'Evidence',
  )
  db.prepare(
    `INSERT INTO lesson_messages
     (id,lesson_id,role,content,source_anchor_ids_json,prompt_version,message_index,created_at,model_run_id)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000101',
    'tutor',
    'Question',
    '["00000000-0000-4000-8000-000000000301"]',
    'mock-tutor-v1',
    0,
    '2026-07-13T00:00:00.000Z',
    '00000000-0000-4000-8000-000000000501',
  )
  db.prepare(
    `INSERT INTO lesson_model_runs
     (id,lesson_id,provider_id,model_name,operation,status,prompt_manifest_json,input_summary_json,source_anchor_ids_json,output_message_id,started_at,finished_at,error_summary_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000101',
    null,
    'mock-local',
    'lesson_tutor_first_question',
    'succeeded',
    '{"key":"lesson.mockTutor.firstQuestion","version":1,"hash":"sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff"}',
    '{"documentId":"00000000-0000-4000-8000-000000000201","documentTitle":"Paper Map","sourceAnchorIds":["00000000-0000-4000-8000-000000000301"],"sourceCharacterRange":{"startOffset":0,"endOffset":8},"snippetCharacterCount":8,"contextCharacterCount":0,"contextChunks":[]}',
    '["00000000-0000-4000-8000-000000000301"]',
    '00000000-0000-4000-8000-000000000401',
    '2026-07-13T00:00:00.000Z',
    '2026-07-13T00:00:00.000Z',
    null,
  )

  expect(() =>
    db
      .prepare(
        `INSERT INTO lesson_steps
         (id,lesson_id,sequence_no,state_before,state_after,action_type,status,model_run_id,message_id,rationale,error_summary_json,created_at,finished_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        '00000000-0000-4000-8000-000000000701',
        '00000000-0000-4000-8000-000000000101',
        0,
        'opening',
        'probing',
        'dance',
        'succeeded',
        '00000000-0000-4000-8000-000000000501',
        '00000000-0000-4000-8000-000000000401',
        'bad action',
        null,
        '2026-07-13T00:00:00.000Z',
        '2026-07-13T00:00:00.000Z',
      ),
  ).toThrow()
  expect(() =>
    db
      .prepare(
        `INSERT INTO lesson_steps
         (id,lesson_id,sequence_no,state_before,state_after,action_type,status,model_run_id,message_id,rationale,error_summary_json,created_at,finished_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        '00000000-0000-4000-8000-000000000702',
        '00000000-0000-4000-8000-000000000101',
        0,
        'opening',
        'probing',
        'ask',
        'done',
        '00000000-0000-4000-8000-000000000501',
        '00000000-0000-4000-8000-000000000401',
        'bad status',
        null,
        '2026-07-13T00:00:00.000Z',
        '2026-07-13T00:00:00.000Z',
      ),
  ).toThrow()

  db.close()
})

test('enforces lesson mastery evidence migration constraints', async () => {
  const dir = await setup()
  const path = join(dir, 'app.db')
  const db = openDatabase(path)
  await migrateDatabase(db, { databasePath: path, userDataPath: dir })

  expect(MIGRATIONS.at(-1)).toMatchObject({
    version: 21,
    name: 'lesson_export_jobs',
  })
  db.prepare(
    `INSERT INTO learning_documents
     (id,document_type,title,source_kind,original_file_name,content_hash,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000001201',
    'generic',
    'Paper Map',
    'pasted_text',
    null,
    'hash-mastery-paper',
    '2026-07-13T00:00:00.000Z',
    '2026-07-13T00:00:00.000Z',
  )
  db.prepare(
    `INSERT INTO lesson_sessions
     (id,title,status,document_id,document_title,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000001101',
    'Paper Map 课堂',
    'active',
    '00000000-0000-4000-8000-000000001201',
    'Paper Map',
    '2026-07-13T00:00:00.000Z',
    '2026-07-13T00:00:00.000Z',
  )
  db.prepare(
    `INSERT INTO lesson_messages
     (id,lesson_id,role,content,source_anchor_ids_json,prompt_version,message_index,created_at,model_run_id)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000001401',
    '00000000-0000-4000-8000-000000001101',
    'learner',
    '我卡住了。',
    '[]',
    'learner-input-v1',
    0,
    '2026-07-13T00:00:00.000Z',
    null,
  )
  db.prepare(
    `INSERT INTO lesson_messages
     (id,lesson_id,role,content,source_anchor_ids_json,prompt_version,message_index,created_at,model_run_id)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000001402',
    '00000000-0000-4000-8000-000000001101',
    'tutor',
    '我们先回到关键证据。',
    '[]',
    'mock-tutor-follow-up-v2',
    1,
    '2026-07-13T00:01:00.000Z',
    '00000000-0000-4000-8000-000000001501',
  )
  db.prepare(
    `INSERT INTO lesson_model_runs
     (id,lesson_id,provider_id,model_name,operation,status,prompt_manifest_json,input_summary_json,source_anchor_ids_json,output_message_id,started_at,finished_at,error_summary_json)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000001501',
    '00000000-0000-4000-8000-000000001101',
    null,
    'mock-local',
    'lesson_tutor_follow_up',
    'succeeded',
    '{"key":"lesson.mockTutor.followUp","version":2,"hash":"sha256:ad9d6476b98dc6a93a16144bb3ba2a79f7be4e9741176c1e564e0b02ab49265b"}',
    '{"documentId":"00000000-0000-4000-8000-000000001201","documentTitle":"Paper Map","sourceAnchorIds":[],"sourceCharacterRange":{"startOffset":0,"endOffset":8},"snippetCharacterCount":8,"contextCharacterCount":0,"contextChunks":[],"learnerReplyCharacterCount":5}',
    '[]',
    '00000000-0000-4000-8000-000000001402',
    '2026-07-13T00:01:00.000Z',
    '2026-07-13T00:01:00.000Z',
    null,
  )
  db.prepare(
    `INSERT INTO lesson_steps
     (id,lesson_id,sequence_no,state_before,state_after,action_type,status,model_run_id,message_id,rationale,error_summary_json,created_at,finished_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000001701',
    '00000000-0000-4000-8000-000000001101',
    0,
    'probing',
    'hinting',
    'hint',
    'succeeded',
    '00000000-0000-4000-8000-000000001501',
    '00000000-0000-4000-8000-000000001402',
    'Learner was stuck.',
    null,
    '2026-07-13T00:01:00.000Z',
    '2026-07-13T00:01:00.000Z',
  )

  expect(() =>
    db
      .prepare(
        `INSERT INTO lesson_mastery_evidence
         (id,lesson_id,step_id,learner_message_id,tutor_message_id,kind,judgement,confidence,rationale,suggested_review,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        '00000000-0000-4000-8000-000000001801',
        '00000000-0000-4000-8000-000000001101',
        '00000000-0000-4000-8000-000000001701',
        '00000000-0000-4000-8000-000000001401',
        '00000000-0000-4000-8000-000000001402',
        'stuck_signal',
        'needs_review',
        2,
        'Confidence must be normalized.',
        1,
        '2026-07-13T00:01:00.000Z',
      ),
  ).toThrow()

  db.close()
})

test('rejects an applied migration checksum mismatch safely', async () => {
  const dir = await setup()
  const path = join(dir, 'app.db')
  const db = openDatabase(path)
  await migrateDatabase(db, { databasePath: path, userDataPath: dir })
  db.prepare('UPDATE schema_migrations SET checksum = ? WHERE version = 1').run('wrong')
  await expect(
    migrateDatabase(db, { databasePath: path, userDataPath: dir }),
  ).rejects.toMatchObject({ code: 'DATABASE_MIGRATION_FAILED' })
  db.close()
})

test('backs up nonempty databases and rolls back a failed pending migration', async () => {
  const dir = await setup()
  const path = join(dir, 'app.db')
  const db = openDatabase(path)
  db.exec("CREATE TABLE legacy(value TEXT); INSERT INTO legacy VALUES ('kept')")
  await expect(
    migrateDatabase(db, {
      databasePath: path,
      userDataPath: dir,
      migrations: [
        ...MIGRATIONS,
        { version: 22, name: 'broken', sql: 'CREATE TABLE broken(id); invalid SQL' },
      ],
    }),
  ).rejects.toMatchObject({ code: 'DATABASE_MIGRATION_FAILED' })
  expect(db.prepare('SELECT value FROM legacy').get()).toEqual({ value: 'kept' })
  expect(db.prepare("SELECT name FROM sqlite_master WHERE name='broken'").get()).toBeUndefined()
  const [backupName] = await readdir(join(dir, 'backups'))
  expect(backupName).toBeDefined()
  const backup = openDatabase(join(dir, 'backups', backupName!))
  expect(backup.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all()).toEqual([
    expect.objectContaining({ name: 'legacy' }),
  ])
  expect(
    backup.prepare("SELECT name FROM sqlite_master WHERE name='schema_migrations'").get(),
  ).toBeUndefined()
  expect(backup.prepare('SELECT value FROM legacy').get()).toEqual({ value: 'kept' })
  backup.close()
  db.close()
})

test('does not mutate an existing database when its pre-upgrade backup fails', async () => {
  const dir = await setup()
  const path = join(dir, 'app.db')
  const invalidUserData = join(dir, 'not-a-directory')
  await writeFile(invalidUserData, 'occupied')
  const db = openDatabase(path)
  db.exec("CREATE TABLE legacy(value TEXT); INSERT INTO legacy VALUES ('untouched')")
  const schemaBefore = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table'").all()
  await expect(
    migrateDatabase(db, { databasePath: path, userDataPath: invalidUserData }),
  ).rejects.toMatchObject({ code: 'DATABASE_MIGRATION_FAILED' })
  expect(db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table'").all()).toEqual(
    schemaBefore,
  )
  expect(db.prepare('SELECT value FROM legacy').get()).toEqual({ value: 'untouched' })
  db.close()
})

test.each([
  ['nonpositive', [{ version: 0, name: 'invalid', sql: 'CREATE TABLE bad(id)' }]],
  [
    'duplicate',
    [
      { version: 1, name: 'a', sql: 'SELECT 1' },
      { version: 1, name: 'b', sql: 'SELECT 1' },
    ],
  ],
  [
    'out of order',
    [
      { version: 2, name: 'a', sql: 'SELECT 1' },
      { version: 1, name: 'b', sql: 'SELECT 1' },
    ],
  ],
] as const)(
  'rejects %s migration definitions without backup or mutation',
  async (_name, migrations) => {
    const dir = await setup()
    const path = join(dir, 'app.db')
    const db = openDatabase(path)
    db.exec("CREATE TABLE legacy(value TEXT); INSERT INTO legacy VALUES ('untouched')")
    const before = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table'").all()
    await expect(
      migrateDatabase(db, { databasePath: path, userDataPath: dir, migrations }),
    ).rejects.toMatchObject({ code: 'DATABASE_MIGRATION_FAILED' })
    expect(db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table'").all()).toEqual(
      before,
    )
    await expect(access(join(dir, 'backups'))).rejects.toBeDefined()
    db.close()
  },
)

test('upgrades a database with published v10 chunks to add v11 fts sync triggers', async () => {
  const dir = await setup()
  const path = join(dir, 'app.db')
  const db = openDatabase(path)
  await migrateDatabase(db, {
    databasePath: path,
    userDataPath: dir,
    migrations: MIGRATIONS.filter((migration) => migration.version <= 10),
  })
  db.prepare(
    `INSERT INTO learning_documents
     (id,document_type,title,source_kind,original_file_name,content_hash,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000000101',
    'paper',
    'Migrated paper',
    'text_file',
    'paper.pdf',
    'hash-migrated-paper',
    '2026-07-12T00:00:00.000Z',
    '2026-07-12T00:00:00.000Z',
  )
  db.prepare(
    `INSERT INTO document_text_versions
     (id,document_id,plain_text,character_count,created_at)
     VALUES (?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000101',
    'Migrated text',
    13,
    '2026-07-12T00:00:00.000Z',
  )
  db.prepare(
    `INSERT INTO document_chunks
     (id,document_id,chunk_index,page_number_start,page_number_end,block_ids_json,text,char_count,source_version,rebuild_token,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-4000-8000-000000000101',
    0,
    1,
    1,
    '["00000000-0000-4000-8000-000000000401"]',
    'Gradient descent migrated from v10 data.',
    39,
    'page-text:v1',
    'chunk-rule:v1',
    '2026-07-12T00:02:00.000Z',
  )
  expect(db.prepare('SELECT count(*) count FROM document_chunks_fts').get()).toEqual({ count: 0 })

  await migrateDatabase(db, { databasePath: path, userDataPath: dir })

  expect(
    db.prepare('SELECT version,name FROM schema_migrations ORDER BY version DESC LIMIT 1').get(),
  ).toEqual({ version: 21, name: 'lesson_export_jobs' })
  const triggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='document_chunks'")
    .all() as Array<{ name: string }>
  expect(triggers.map((trigger) => trigger.name)).toEqual(
    expect.arrayContaining([
      'document_chunks_fts_insert',
      'document_chunks_fts_delete',
      'document_chunks_fts_update',
    ]),
  )
  expect(
    db
      .prepare(
        `SELECT chunk_id,document_id,body
       FROM document_chunks_fts
       WHERE document_id=?
       ORDER BY rowid`,
      )
      .all('00000000-0000-4000-8000-000000000101'),
  ).toEqual([
    {
      chunk_id: '00000000-0000-4000-8000-000000000501',
      document_id: '00000000-0000-4000-8000-000000000101',
      body: 'Gradient descent migrated from v10 data.',
    },
  ])
  expect(
    db
      .prepare(
        `SELECT c.id
       FROM document_chunks_fts f
       INNER JOIN document_chunks c ON c.id = f.chunk_id
       WHERE f.document_id=? AND document_chunks_fts MATCH ?
       ORDER BY bm25(document_chunks_fts), c.chunk_index, c.id`,
      )
      .all('00000000-0000-4000-8000-000000000101', 'gradient descent'),
  ).toEqual([{ id: '00000000-0000-4000-8000-000000000501' }])

  db.close()
})
