import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { openDatabase } from './database'

const dirs: string[] = []
afterEach(async () =>
  Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))),
)

test('opens SQLite with required reliability pragmas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deepstorming-db-'))
  dirs.push(dir)
  const db = openDatabase(join(dir, 'app.db'))
  expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
  expect(db.pragma('busy_timeout', { simple: true })).toBe(5000)
  db.close()
})

test('closes a partially opened connection when pragma setup fails', () => {
  let closed = false
  const partial = {
    pragma: () => {
      throw new Error('raw path sql')
    },
    close: () => {
      closed = true
    },
  }
  expect(() => openDatabase('secret-path', () => partial as never)).toThrowError(
    expect.objectContaining({
      code: 'DATABASE_UNAVAILABLE',
      message: expect.not.stringContaining('secret-path'),
    }),
  )
  expect(closed).toBe(true)
})
