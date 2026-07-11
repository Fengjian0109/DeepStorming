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
  expect(db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all()).toEqual([
    { version: 1, name: 'provider_foundation' },
    { version: 2, name: 'document_text_import' },
    { version: 3, name: 'lesson_session_foundation' },
    { version: 4, name: 'lesson_message_foundation' },
  ])

  db.close()
  rmSync(dir, { recursive: true, force: true })
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
  expect(db.prepare('SELECT version,name FROM schema_migrations ORDER BY version').all()).toEqual([
    { version: 1, name: 'provider_foundation' },
    { version: 2, name: 'document_text_import' },
    { version: 3, name: 'lesson_session_foundation' },
    { version: 4, name: 'lesson_message_foundation' },
  ])

  db.close()
  rmSync(dir, { recursive: true, force: true })
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
        { version: 5, name: 'broken', sql: 'CREATE TABLE broken(id); invalid SQL' },
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
