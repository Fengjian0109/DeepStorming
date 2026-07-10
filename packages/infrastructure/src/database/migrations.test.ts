import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
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
  expect(db.prepare('SELECT count(*) count FROM schema_migrations').get()).toEqual({ count: 1 })
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
        { version: 2, name: 'broken', sql: 'CREATE TABLE broken(id); invalid SQL' },
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
