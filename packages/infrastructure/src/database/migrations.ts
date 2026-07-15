import { createHash } from 'node:crypto'
import { mkdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { databaseError, type SqliteDatabase } from './database'

export type Migration = Readonly<{
  version: number
  name: string
  sql: string
  foreignKeysOff?: boolean
}>

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

const PDF_DOCUMENT_SQL = `
CREATE TABLE document_import_jobs (
 id TEXT PRIMARY KEY,
 document_id TEXT REFERENCES learning_documents(id) ON DELETE SET NULL,
 source_kind TEXT NOT NULL CHECK (source_kind = 'pdf_file'),
 status TEXT NOT NULL CHECK (status IN ('queued','copying','parsing','ready','failed','cancelled')),
 original_name TEXT NOT NULL,
 file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes >= 0),
 content_hash TEXT NOT NULL,
 error_json TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 finished_at TEXT,
 CHECK ((status = 'failed' AND error_json IS NOT NULL) OR (status != 'failed' AND error_json IS NULL))
);
CREATE INDEX document_import_jobs_document_id ON document_import_jobs(document_id);
CREATE TABLE document_files (
 document_id TEXT PRIMARY KEY REFERENCES learning_documents(id) ON DELETE CASCADE,
 import_job_id TEXT NOT NULL REFERENCES document_import_jobs(id) ON DELETE CASCADE,
 original_name TEXT NOT NULL,
 stored_path TEXT NOT NULL,
 content_hash TEXT NOT NULL,
 file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes >= 0),
 created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX unique_document_file_content_hash ON document_files(content_hash);
CREATE TABLE document_pages (
 id TEXT PRIMARY KEY,
 document_id TEXT NOT NULL REFERENCES learning_documents(id) ON DELETE CASCADE,
 page_number INTEGER NOT NULL CHECK (page_number > 0),
 width REAL NOT NULL CHECK (width > 0),
 height REAL NOT NULL CHECK (height > 0),
 text TEXT NOT NULL,
 text_hash TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(document_id,page_number)
);
CREATE INDEX document_pages_document_id ON document_pages(document_id);
CREATE TABLE document_text_blocks (
 id TEXT PRIMARY KEY,
 document_id TEXT NOT NULL REFERENCES learning_documents(id) ON DELETE CASCADE,
 page_id TEXT NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,
 page_number INTEGER NOT NULL CHECK (page_number > 0),
 block_index INTEGER NOT NULL CHECK (block_index >= 0),
 text TEXT NOT NULL,
 x REAL CHECK (x IS NULL OR x >= 0),
 y REAL CHECK (y IS NULL OR y >= 0),
 width REAL CHECK (width IS NULL OR width > 0),
 height REAL CHECK (height IS NULL OR height > 0),
 created_at TEXT NOT NULL,
 UNIQUE(page_id,block_index)
);
CREATE INDEX document_text_blocks_document_page ON document_text_blocks(document_id,page_number,block_index);`

const LESSON_SOURCE_TARGET_SQL = `
ALTER TABLE lesson_source_anchors ADD COLUMN target_json TEXT;`

const DOCUMENT_CHUNK_SQL = `
CREATE TABLE document_chunks (
 id TEXT PRIMARY KEY,
 document_id TEXT NOT NULL REFERENCES learning_documents(id) ON DELETE CASCADE,
 chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
 page_number_start INTEGER NOT NULL CHECK (page_number_start > 0),
 page_number_end INTEGER NOT NULL CHECK (page_number_end >= page_number_start),
 block_ids_json TEXT NOT NULL,
 text TEXT NOT NULL,
 char_count INTEGER NOT NULL CHECK (char_count >= 0),
 source_version TEXT NOT NULL,
 rebuild_token TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(document_id, chunk_index)
);
CREATE INDEX document_chunks_document_index ON document_chunks(document_id, chunk_index);
CREATE INDEX document_chunks_freshness_index ON document_chunks(document_id, source_version, rebuild_token);
CREATE VIRTUAL TABLE document_chunks_fts USING fts5(
 chunk_id UNINDEXED,
 document_id UNINDEXED,
 body
);`

const DOCUMENT_CHUNK_FTS_SYNC_SQL = `
CREATE TRIGGER document_chunks_fts_insert AFTER INSERT ON document_chunks BEGIN
  INSERT INTO document_chunks_fts(rowid,chunk_id,document_id,body)
  VALUES (new.rowid,new.id,new.document_id,new.text);
END;
CREATE TRIGGER document_chunks_fts_delete AFTER DELETE ON document_chunks BEGIN
  DELETE FROM document_chunks_fts WHERE rowid = old.rowid;
END;
CREATE TRIGGER document_chunks_fts_update AFTER UPDATE ON document_chunks BEGIN
  DELETE FROM document_chunks_fts WHERE rowid = old.rowid;
  INSERT INTO document_chunks_fts(rowid,chunk_id,document_id,body)
  VALUES (new.rowid,new.id,new.document_id,new.text);
END;
INSERT INTO document_chunks_fts(rowid,chunk_id,document_id,body)
SELECT rowid,id,document_id,text
FROM document_chunks;`

const LESSON_STATE_MACHINE_SQL = `
ALTER TABLE lesson_sessions ADD COLUMN current_state TEXT NOT NULL DEFAULT 'opening'
 CHECK (current_state IN ('opening','probing','hinting','explaining','reflecting','summarizing','completed','paused','error'));
CREATE TABLE lesson_steps (
 id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 sequence_no INTEGER NOT NULL CHECK (sequence_no >= 0),
 state_before TEXT NOT NULL CHECK (state_before IN ('opening','probing','hinting','explaining','reflecting','summarizing','completed','paused','error')),
 state_after TEXT NOT NULL CHECK (state_after IN ('opening','probing','hinting','explaining','reflecting','summarizing','completed','paused','error')),
 action_type TEXT NOT NULL CHECK (action_type IN ('ask','hint','explain','reflect','summarize')),
 status TEXT NOT NULL CHECK (status IN ('started','succeeded','failed','cancelled')),
 model_run_id TEXT NOT NULL REFERENCES lesson_model_runs(id) ON DELETE CASCADE,
 message_id TEXT REFERENCES lesson_messages(id) ON DELETE SET NULL,
 rationale TEXT,
 error_summary_json TEXT,
 created_at TEXT NOT NULL,
 finished_at TEXT,
 UNIQUE(lesson_id, sequence_no),
 CHECK (
   (status = 'succeeded' AND message_id IS NOT NULL AND rationale IS NOT NULL AND finished_at IS NOT NULL AND error_summary_json IS NULL)
   OR (status = 'started' AND message_id IS NULL AND rationale IS NULL AND finished_at IS NULL AND error_summary_json IS NULL)
   OR (status IN ('failed','cancelled') AND finished_at IS NOT NULL)
 )
);
CREATE INDEX lesson_steps_lesson_sequence ON lesson_steps(lesson_id, sequence_no);
CREATE INDEX lesson_steps_model_run ON lesson_steps(model_run_id);`

const LESSON_MASTERY_EVIDENCE_SQL = `
CREATE TABLE lesson_mastery_evidence (
 id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 step_id TEXT NOT NULL REFERENCES lesson_steps(id) ON DELETE CASCADE,
 learner_message_id TEXT NOT NULL REFERENCES lesson_messages(id) ON DELETE CASCADE,
 tutor_message_id TEXT NOT NULL REFERENCES lesson_messages(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('teach_back','stuck_signal','self_report')),
 judgement TEXT NOT NULL CHECK (judgement IN ('insufficient','partial_understanding','needs_review')),
 confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
 rationale TEXT NOT NULL,
 suggested_review INTEGER NOT NULL CHECK (suggested_review IN (0,1)),
 created_at TEXT NOT NULL,
 UNIQUE(tutor_message_id)
);
CREATE INDEX lesson_mastery_evidence_lesson_created ON lesson_mastery_evidence(lesson_id, created_at);
CREATE INDEX lesson_mastery_evidence_step ON lesson_mastery_evidence(step_id);
CREATE TABLE lesson_misconception_signals (
 id TEXT PRIMARY KEY,
 evidence_id TEXT NOT NULL REFERENCES lesson_mastery_evidence(id) ON DELETE CASCADE,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 label TEXT NOT NULL,
 severity TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
 rationale TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(evidence_id, label)
);
CREATE INDEX lesson_misconception_signals_lesson_created ON lesson_misconception_signals(lesson_id, created_at);`

const LESSON_REVIEW_SCHEDULER_SQL = `
CREATE TABLE lesson_review_items (
 id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 mastery_evidence_id TEXT NOT NULL REFERENCES lesson_mastery_evidence(id) ON DELETE CASCADE,
 misconception_signal_id TEXT REFERENCES lesson_misconception_signals(id) ON DELETE SET NULL,
 prompt TEXT NOT NULL,
 answer_outline_json TEXT NOT NULL,
 status TEXT NOT NULL CHECK (status IN ('active','completed','suspended')),
 due_at TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(mastery_evidence_id)
);
CREATE INDEX lesson_review_items_lesson_due ON lesson_review_items(lesson_id, status, due_at);
CREATE INDEX lesson_review_items_due ON lesson_review_items(status, due_at);
CREATE TABLE lesson_review_events (
 id TEXT PRIMARY KEY,
 review_item_id TEXT NOT NULL REFERENCES lesson_review_items(id) ON DELETE CASCADE,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 rating TEXT NOT NULL CHECK (rating IN ('remembered','forgot')),
 response TEXT NOT NULL,
 previous_due_at TEXT NOT NULL,
 next_due_at TEXT,
 reviewed_at TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX lesson_review_events_item_reviewed ON lesson_review_events(review_item_id, reviewed_at);
CREATE INDEX lesson_review_events_lesson_reviewed ON lesson_review_events(lesson_id, reviewed_at);`

const PAPER_LESSON_METADATA_SQL = `
ALTER TABLE lesson_sessions ADD COLUMN lesson_mode TEXT NOT NULL DEFAULT 'standard'
 CHECK (lesson_mode IN ('standard','paper'));
ALTER TABLE lesson_sessions ADD COLUMN paper_profile_json TEXT;`

const LEARNING_SETTINGS_SQL = `
CREATE TABLE user_profile (
 singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
 display_name TEXT NOT NULL,
 avatar_asset_id TEXT,
 revision INTEGER NOT NULL CHECK (revision > 0),
 updated_at TEXT NOT NULL
);
CREATE TABLE tutor_profiles (
 id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL CHECK (revision > 0),
 status TEXT NOT NULL CHECK (status IN ('active','archived')),
 name TEXT NOT NULL,
 avatar_asset_id TEXT,
 personality TEXT NOT NULL,
 tone TEXT NOT NULL,
 expertise_tags_json TEXT NOT NULL,
 strictness INTEGER NOT NULL CHECK (strictness BETWEEN 1 AND 5),
 socratic_intensity INTEGER NOT NULL CHECK (socratic_intensity BETWEEN 1 AND 5),
 guidance_style TEXT NOT NULL CHECK (guidance_style IN ('question_first','balanced','explain_first')),
 book_strategy TEXT NOT NULL,
 paper_strategy TEXT NOT NULL,
 custom_instructions TEXT NOT NULL,
 prompt_version TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX tutor_profiles_status_name ON tutor_profiles(status, name);
CREATE TABLE tutor_profile_revisions (
 tutor_id TEXT NOT NULL REFERENCES tutor_profiles(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK (revision > 0),
 snapshot_json TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(tutor_id, revision)
);
CREATE TABLE classroom_preferences (
 singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
 default_book_tutor_id TEXT REFERENCES tutor_profiles(id) ON DELETE SET NULL,
 default_paper_tutor_id TEXT REFERENCES tutor_profiles(id) ON DELETE SET NULL,
 default_pace TEXT NOT NULL CHECK (default_pace IN ('slow','standard','fast')),
 send_shortcut TEXT NOT NULL CHECK (send_shortcut IN ('enter','mod_enter')),
 auto_scroll INTEGER NOT NULL CHECK (auto_scroll IN (0,1)),
 context_compression_remaining_percent INTEGER NOT NULL CHECK (context_compression_remaining_percent BETWEEN 10 AND 50),
 recent_turn_count INTEGER NOT NULL CHECK (recent_turn_count BETWEEN 1 AND 50)
);`

const LESSON_TUTOR_CONFIGURATION_SQL = `
ALTER TABLE lesson_sessions ADD COLUMN lesson_pace TEXT CHECK (lesson_pace IN ('slow','standard','fast'));
ALTER TABLE lesson_sessions ADD COLUMN tutor_snapshot_json TEXT;`

const STRUCTURED_TUTOR_TURN_SQL = `
ALTER TABLE lesson_messages ADD COLUMN tutor_turn_json TEXT;`

const DOCUMENT_FIGURE_ASSETS_SQL = `
ALTER TABLE document_files ADD COLUMN figure_extraction_status TEXT NOT NULL DEFAULT 'pending'
 CHECK (figure_extraction_status IN ('pending','ready'));
CREATE TABLE document_figures (
 id TEXT PRIMARY KEY,
 document_id TEXT NOT NULL REFERENCES learning_documents(id) ON DELETE CASCADE,
 page_number INTEGER NOT NULL CHECK (page_number > 0),
 label TEXT NOT NULL,
 caption TEXT NOT NULL,
 asset_id TEXT NOT NULL,
 asset_kind TEXT NOT NULL CHECK (asset_kind IN ('embedded_image','page_render')),
 width REAL NOT NULL CHECK (width > 0),
 height REAL NOT NULL CHECK (height > 0),
 created_at TEXT NOT NULL,
 UNIQUE(document_id, asset_id)
);
CREATE INDEX document_figures_document_page ON document_figures(document_id, page_number, id);`

const LESSON_MEMORY_LIFECYCLE_SQL = `
PRAGMA legacy_alter_table=ON;
PRAGMA defer_foreign_keys=ON;
ALTER TABLE lesson_sessions RENAME TO lesson_sessions_legacy;
CREATE TABLE lesson_sessions (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 status TEXT NOT NULL CHECK (status IN ('preparing','active','summarizing','pending_review','reviewing','completed','paused','error','archived')),
 document_id TEXT NOT NULL REFERENCES learning_documents(id) ON DELETE CASCADE,
 document_title TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 current_state TEXT NOT NULL DEFAULT 'opening'
  CHECK (current_state IN ('opening','probing','hinting','explaining','reflecting','summarizing','completed','paused','error')),
 lesson_mode TEXT NOT NULL DEFAULT 'standard' CHECK (lesson_mode IN ('standard','paper')),
 paper_profile_json TEXT,
 lesson_pace TEXT CHECK (lesson_pace IN ('slow','standard','fast')),
 tutor_snapshot_json TEXT,
 lesson_memory_json TEXT,
 lesson_end_job_json TEXT,
 post_lesson_action TEXT CHECK (post_lesson_action IN ('immediate_review','rest')),
 completed_at TEXT,
 review_response TEXT
);
INSERT INTO lesson_sessions
 (id,title,status,document_id,document_title,created_at,updated_at,current_state,lesson_mode,paper_profile_json,lesson_pace,tutor_snapshot_json)
SELECT id,title,status,document_id,document_title,created_at,updated_at,current_state,lesson_mode,paper_profile_json,lesson_pace,tutor_snapshot_json
FROM lesson_sessions_legacy;
DROP TABLE lesson_sessions_legacy;
PRAGMA legacy_alter_table=OFF;
CREATE TABLE document_learning_memories (
 document_id TEXT PRIMARY KEY REFERENCES learning_documents(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK (revision > 0),
 memory_json TEXT NOT NULL,
 updated_at TEXT NOT NULL
);`

const LESSON_EXPORT_JOB_SQL = `CREATE TABLE lesson_export_jobs (
 operation_id TEXT PRIMARY KEY,
 lesson_id TEXT NOT NULL REFERENCES lesson_sessions(id) ON DELETE CASCADE,
 format TEXT NOT NULL CHECK (format IN ('markdown','pdf')),
 target_path TEXT NOT NULL,
 status TEXT NOT NULL CHECK (status IN ('started','succeeded','failed','cancelled')),
 error_code TEXT,
 started_at TEXT NOT NULL,
 finished_at TEXT
);
CREATE INDEX lesson_export_jobs_lesson_started_idx
ON lesson_export_jobs(lesson_id,started_at DESC);`

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  { version: 1, name: 'provider_foundation', sql: INITIAL_SQL },
  { version: 2, name: 'document_text_import', sql: DOCUMENT_SQL },
  { version: 3, name: 'lesson_session_foundation', sql: LESSON_SQL },
  { version: 4, name: 'lesson_message_foundation', sql: LESSON_MESSAGE_SQL },
  { version: 5, name: 'lesson_model_run_foundation', sql: LESSON_MODEL_RUN_SQL },
  { version: 6, name: 'lesson_follow_up_operation', sql: LESSON_FOLLOW_UP_SQL },
  { version: 7, name: 'lesson_model_run_error_summary', sql: LESSON_MODEL_RUN_ERROR_SUMMARY_SQL },
  { version: 8, name: 'pdf_document_foundation', sql: PDF_DOCUMENT_SQL },
  { version: 9, name: 'lesson_source_target', sql: LESSON_SOURCE_TARGET_SQL },
  { version: 10, name: 'document_chunk_storage', sql: DOCUMENT_CHUNK_SQL },
  { version: 11, name: 'document_chunk_fts_sync', sql: DOCUMENT_CHUNK_FTS_SYNC_SQL },
  { version: 12, name: 'lesson_state_machine', sql: LESSON_STATE_MACHINE_SQL },
  { version: 13, name: 'lesson_mastery_evidence', sql: LESSON_MASTERY_EVIDENCE_SQL },
  { version: 14, name: 'lesson_review_scheduler', sql: LESSON_REVIEW_SCHEDULER_SQL },
  { version: 15, name: 'paper_lesson_metadata', sql: PAPER_LESSON_METADATA_SQL },
  { version: 16, name: 'learning_settings', sql: LEARNING_SETTINGS_SQL },
  { version: 17, name: 'lesson_tutor_configuration', sql: LESSON_TUTOR_CONFIGURATION_SQL },
  { version: 18, name: 'structured_tutor_turn', sql: STRUCTURED_TUTOR_TURN_SQL },
  { version: 19, name: 'document_figure_assets', sql: DOCUMENT_FIGURE_ASSETS_SQL },
  {
    version: 20,
    name: 'lesson_memory_lifecycle',
    sql: LESSON_MEMORY_LIFECYCLE_SQL,
    foreignKeysOff: true,
  },
  { version: 21, name: 'lesson_export_jobs', sql: LESSON_EXPORT_JOB_SQL },
])
const checksum = (migration: Migration): string =>
  createHash('sha256')
    .update(
      `${migration.name}\n${migration.sql}${migration.foreignKeysOff === true ? '\nforeign_keys_off' : ''}`,
    )
    .digest('hex')

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
      if (migration.foreignKeysOff === true) db.pragma('foreign_keys = OFF')
      try {
        db.transaction(() => {
          db.exec(migration.sql)
          db.prepare(
            'INSERT INTO schema_migrations(version,name,checksum,applied_at) VALUES (?,?,?,?)',
          ).run(migration.version, migration.name, checksum(migration), new Date().toISOString())
        })()
      } finally {
        if (migration.foreignKeysOff === true) db.pragma('foreign_keys = ON')
      }
      if (
        migration.foreignKeysOff === true &&
        (db.pragma('foreign_key_check') as readonly unknown[]).length > 0
      )
        throw new Error('foreign key check failed')
    }
  } catch {
    throw databaseError('DATABASE_MIGRATION_FAILED')
  }
}
