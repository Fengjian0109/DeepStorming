import { createHash } from 'node:crypto'
import { mkdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { databaseError, type SqliteDatabase } from './database'

export type Migration = Readonly<{ version: number; name: string; sql: string }>

const INITIAL_SQL = `
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE ai_providers (
 id TEXT PRIMARY KEY,
 provider_type TEXT NOT NULL CHECK (provider_type IN ('mock','deepseek','openai_compatible')),
 display_name TEXT NOT NULL, base_url TEXT, model_name TEXT NOT NULL, secret_ref TEXT,
 capabilities_json TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
 last_test_status TEXT CHECK (last_test_status IS NULL OR last_test_status IN ('testing','success','error','cancelled')),
 last_tested_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
);
CREATE UNIQUE INDEX one_active_ai_provider ON ai_providers(is_active) WHERE is_active = 1;
CREATE TABLE provider_write_requests (
 request_id TEXT PRIMARY KEY, operation TEXT NOT NULL CHECK (operation IN ('create','update','delete','activate')),
 target_provider_id TEXT NOT NULL, outcome_status TEXT NOT NULL CHECK (outcome_status IN ('succeeded','removed','blocked','not_found')),
 provider_snapshot_json TEXT, created_at TEXT NOT NULL
);
CREATE TABLE provider_test_operations (
 operation_id TEXT PRIMARY KEY, provider_id TEXT NOT NULL,
 current_status TEXT NOT NULL CHECK (current_status IN ('testing','success','error','cancelled')),
 provider_snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);`

const DOCUMENT_SQL = `
CREATE TABLE learning_documents (
 id TEXT PRIMARY KEY,
 document_type TEXT NOT NULL CHECK (document_type IN ('generic','textbook','paper')),
 title TEXT NOT NULL,
 source_kind TEXT NOT NULL CHECK (source_kind IN ('pasted_text','text_file')),
 original_file_name TEXT,
 content_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX unique_learning_document_content_hash ON learning_documents(content_hash);
CREATE TABLE document_text_versions (
 id TEXT PRIMARY KEY,
 document_id TEXT NOT NULL REFERENCES learning_documents(id) ON DELETE CASCADE,
 plain_text TEXT NOT NULL,
 character_count INTEGER NOT NULL CHECK (character_count >= 0),
 created_at TEXT NOT NULL
);`

const LESSON_SQL = `
CREATE TABLE lesson_sessions (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 status TEXT NOT NULL CHECK (status IN ('active','archived')),
 document_id TEXT NOT NULL REFERENCES learning_documents(id) ON DELETE CASCADE,
 document_title TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE TABLE lesson_source_anchors (
 id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 document_id TEXT NOT NULL REFERENCES learning_documents(id) ON DELETE CASCADE,
 start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
 end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
 snippet TEXT NOT NULL
);`

const LESSON_MESSAGE_SQL = `
CREATE TABLE lesson_messages (
 id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK (role IN ('system','tutor','learner')),
 content TEXT NOT NULL,
 source_anchor_ids_json TEXT NOT NULL,
 prompt_version TEXT NOT NULL,
 message_index INTEGER NOT NULL CHECK (message_index >= 0),
 created_at TEXT NOT NULL,
 UNIQUE(lesson_id,message_index)
);`

const LESSON_MODEL_RUN_SQL = `
ALTER TABLE lesson_messages ADD COLUMN model_run_id TEXT;
CREATE TABLE lesson_model_runs (
 id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 provider_id TEXT REFERENCES ai_providers(id) ON DELETE SET NULL,
 model_name TEXT NOT NULL,
 operation TEXT NOT NULL CHECK (operation IN ('lesson_tutor_first_question')),
 status TEXT NOT NULL CHECK (status IN ('started','succeeded','failed','cancelled')),
 prompt_manifest_json TEXT NOT NULL,
 input_summary_json TEXT NOT NULL,
 source_anchor_ids_json TEXT NOT NULL,
 output_message_id TEXT,
 started_at TEXT NOT NULL,
 finished_at TEXT
);`

const LESSON_FOLLOW_UP_SQL = `
CREATE TABLE lesson_model_runs_new (
 id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 provider_id TEXT REFERENCES ai_providers(id) ON DELETE SET NULL,
 model_name TEXT NOT NULL,
 operation TEXT NOT NULL CHECK (operation IN ('lesson_tutor_first_question','lesson_tutor_follow_up')),
 status TEXT NOT NULL CHECK (status IN ('started','succeeded','failed','cancelled')),
 prompt_manifest_json TEXT NOT NULL,
 input_summary_json TEXT NOT NULL,
 source_anchor_ids_json TEXT NOT NULL,
 output_message_id TEXT,
 started_at TEXT NOT NULL,
 finished_at TEXT
);
INSERT INTO lesson_model_runs_new SELECT * FROM lesson_model_runs;
DROP TABLE lesson_model_runs;
ALTER TABLE lesson_model_runs_new RENAME TO lesson_model_runs;`

const LESSON_MODEL_RUN_ERROR_SUMMARY_SQL = `
ALTER TABLE lesson_model_runs ADD COLUMN error_summary_json TEXT;`

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  { version: 1, name: 'provider_foundation', sql: INITIAL_SQL },
  { version: 2, name: 'document_text_import', sql: DOCUMENT_SQL },
  { version: 3, name: 'lesson_session_foundation', sql: LESSON_SQL },
  { version: 4, name: 'lesson_message_foundation', sql: LESSON_MESSAGE_SQL },
  { version: 5, name: 'lesson_model_run_foundation', sql: LESSON_MODEL_RUN_SQL },
  { version: 6, name: 'lesson_follow_up_operation', sql: LESSON_FOLLOW_UP_SQL },
  { version: 7, name: 'lesson_model_run_error_summary', sql: LESSON_MODEL_RUN_ERROR_SUMMARY_SQL },
])
const checksum = (migration: Migration): string =>
  createHash('sha256').update(`${migration.name}\n${migration.sql}`).digest('hex')

export const migrateDatabase = async (
  db: SqliteDatabase,
  options: Readonly<{
    databasePath: string
    userDataPath: string
    migrations?: readonly Migration[]
  }>,
): Promise<void> => {
  const migrations = options.migrations ?? MIGRATIONS
  try {
    let previousVersion = 0
    const seen = new Set<number>()
    for (const migration of migrations) {
      if (
        !Number.isInteger(migration.version) ||
        migration.version <= 0 ||
        seen.has(migration.version) ||
        migration.version <= previousVersion
      )
        throw new Error('invalid migrations')
      seen.add(migration.version)
      previousVersion = migration.version
    }
    const initialSize = (await stat(options.databasePath)).size
    const hasMigrationTable =
      db
        .prepare(
          "SELECT 1 present FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
        )
        .get() !== undefined
    const applied = hasMigrationTable
      ? (db
          .prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version')
          .all() as Array<{ version: number; name: string; checksum: string }>)
      : []
    for (const row of applied) {
      const migration = migrations.find((item) => item.version === row.version)
      if (
        migration === undefined ||
        row.name !== migration.name ||
        row.checksum !== checksum(migration)
      )
        throw new Error('checksum')
    }
    const pending = migrations.filter(
      (item) => !applied.some((row) => row.version === item.version),
    )
    if (pending.length > 0 && initialSize > 0) {
      const backupDir = join(options.userDataPath, 'backups')
      await mkdir(backupDir, { recursive: true })
      await db.backup(
        join(
          backupDir,
          `${basename(options.databasePath)}-${new Date().toISOString().replaceAll(':', '-')}.bak`,
        ),
      )
    }
    if (!hasMigrationTable) {
      db.exec(
        'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)',
      )
    }
    for (const migration of pending) {
      db.transaction(() => {
        db.exec(migration.sql)
        db.prepare(
          'INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES (?,?,?,?)',
        ).run(migration.version, migration.name, checksum(migration), new Date().toISOString())
      })()
    }
  } catch {
    throw databaseError('DATABASE_MIGRATION_FAILED')
  }
}
