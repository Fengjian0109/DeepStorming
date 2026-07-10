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

export const MIGRATIONS: readonly Migration[] = Object.freeze([
  { version: 1, name: 'provider_foundation', sql: INITIAL_SQL },
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
