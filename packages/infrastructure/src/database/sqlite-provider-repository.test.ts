import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { StoredProvider } from '@deepstorming/application'
import { openDatabase } from './database'
import { migrateDatabase } from './migrations'
import { SqliteProviderRepository } from './sqlite-provider-repository'

let dir: string, db: ReturnType<typeof openDatabase>, repo: SqliteProviderRepository
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'deepstorming-repo-'))
  const path = join(dir, 'app.db')
  db = openDatabase(path)
  await migrateDatabase(db, { databasePath: path, userDataPath: dir })
  repo = new SqliteProviderRepository(db)
})
afterEach(async () => {
  db.close()
  await rm(dir, { recursive: true, force: true })
})
const provider = (id = 'p1', overrides: Partial<StoredProvider> = {}): StoredProvider => ({
  id,
  providerType: 'mock',
  displayName: id,
  modelName: 'mock',
  capabilities: { streaming: true, structuredOutput: true, embedding: false, vision: false },
  isActive: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  revision: 1,
  ...overrides,
})

test('round trips providers, optional fields and referenced secret refs without raw keys', async () => {
  const p = provider('p1', {
    providerType: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    secretRef: 'vault-1',
    lastTestStatus: 'success',
    lastTestedAt: 'now',
  })
  expect(await repo.create('r1', p)).toEqual({ status: 'applied', provider: p })
  expect(await repo.list()).toEqual([p])
  expect(await repo.findById('p1')).toEqual(p)
  expect(await repo.referencedSecretRefs()).toEqual(new Set(['vault-1']))
  expect(JSON.stringify(db.prepare('SELECT * FROM ai_providers').all())).not.toContain('apiKey')
})

test('replays immutable create outcome and conflicts across target or operation', async () => {
  const p = provider()
  await repo.create('r1', p)
  expect(await repo.create('r1', provider('p1', { displayName: 'changed' }))).toEqual({
    status: 'replayed',
    provider: p,
  })
  expect(await repo.create('r1', provider('p2'))).toEqual({
    status: 'conflict',
    existingOperation: 'create',
  })
  expect(await repo.update('r1', 1, p)).toEqual({ status: 'conflict', existingOperation: 'create' })
})

test('updates by revision CAS even when timestamps match', async () => {
  await repo.create('r1', provider())
  const changed = provider('p1', { displayName: 'new' })
  expect(await repo.update('r2', 1, changed)).toMatchObject({
    status: 'applied',
    provider: { displayName: 'new', revision: 2 },
  })
  expect(await repo.update('r3', 1, changed)).toEqual({ status: 'stale' })
  expect(await repo.update('r4', 1, provider('missing'))).toEqual({ status: 'not_found' })
})

test('activates atomically with credential and preserves one active provider', async () => {
  await repo.create('r1', provider('p1'))
  await repo.create('r2', provider('p2', { providerType: 'deepseek' }))
  expect(await repo.activate('a1', 'p2', 1, 'now')).toEqual({ status: 'credential_missing' })
  await repo.update('u2', 1, provider('p2', { providerType: 'deepseek', secretRef: 's' }))
  expect(await repo.activate('a2', 'p2', 2, 'same')).toMatchObject({
    status: 'applied',
    provider: { isActive: true, revision: 3 },
  })
  expect(await repo.activate('a3', 'p1', 1, 'same')).toMatchObject({
    status: 'applied',
    provider: { isActive: true, revision: 2 },
  })
  expect((await repo.list()).filter((p) => p.isActive)).toHaveLength(1)
})

test('removes atomically, stores logical outcomes, and supports blocking checker', async () => {
  await repo.create('r1', provider())
  const blocked = new SqliteProviderRepository(db, () => true)
  expect(await blocked.removeIfUnreferenced('d1', 'p1')).toEqual({
    status: 'blocked',
    providerId: 'p1',
  })
  expect(await blocked.removeIfUnreferenced('d1', 'p1')).toEqual({
    status: 'blocked',
    providerId: 'p1',
  })
  expect(await repo.removeIfUnreferenced('d2', 'p1')).toMatchObject({
    status: 'removed',
    mutation: 'applied',
    provider: { id: 'p1' },
  })
  expect(await repo.removeIfUnreferenced('d2', 'p1')).toMatchObject({
    status: 'removed',
    mutation: 'replayed',
  })
  expect(await repo.removeIfUnreferenced('d3', 'missing')).toEqual({
    status: 'not_found',
    providerId: 'missing',
  })
})

test('rejects malformed capabilities JSON with a safe database error', async () => {
  await repo.create('r1', provider())
  db.prepare('UPDATE ai_providers SET capabilities_json=?').run('{secret payload')
  await expect(repo.list()).rejects.toMatchObject({
    code: 'DATABASE_UNAVAILABLE',
    message: expect.not.stringContaining('secret payload'),
  })
})

test('persists test status transitions with replay and CAS semantics', async () => {
  await repo.create('r1', provider())
  expect(
    await repo.transitionTestStatus({
      operationId: 'op1',
      providerId: 'p1',
      nextStatus: 'testing',
      testedAt: 't1',
    }),
  ).toMatchObject({ status: 'applied', provider: { lastTestStatus: 'testing', revision: 2 } })
  expect(
    await repo.transitionTestStatus({
      operationId: 'op1',
      providerId: 'p1',
      nextStatus: 'testing',
      testedAt: 't1',
    }),
  ).toMatchObject({ status: 'replayed', provider: { revision: 2 } })
  expect(
    await repo.transitionTestStatus({
      operationId: 'op1',
      providerId: 'p1',
      expectedStatus: 'testing',
      nextStatus: 'success',
      testedAt: 't2',
    }),
  ).toMatchObject({ status: 'applied', provider: { lastTestStatus: 'success', revision: 3 } })
  expect(
    await repo.transitionTestStatus({
      operationId: 'op1',
      providerId: 'p1',
      expectedStatus: 'testing',
      nextStatus: 'success',
      testedAt: 't2',
    }),
  ).toMatchObject({ status: 'replayed', provider: { revision: 3 } })
  expect(
    await repo.transitionTestStatus({
      operationId: 'op1',
      providerId: 'p1',
      expectedStatus: 'testing',
      nextStatus: 'error',
      testedAt: 't3',
    }),
  ).toEqual({ status: 'stale' })
})

test('replays the original test transition snapshot after later provider changes', async () => {
  await repo.create('r1', provider())
  const first = await repo.transitionTestStatus({
    operationId: 'op1',
    providerId: 'p1',
    nextStatus: 'testing',
    testedAt: 't1',
  })
  await repo.update('u1', 2, provider('p1', { displayName: 'later', revision: 2 }))
  const replay = await repo.transitionTestStatus({
    operationId: 'op1',
    providerId: 'p1',
    nextStatus: 'testing',
    testedAt: 't1',
  })
  expect(replay).toEqual({
    status: 'replayed',
    provider: (first as { provider: StoredProvider }).provider,
  })
})

test.each([
  ['unknown field', { arbitrary: 'secret payload' }],
  ['api key', { apiKey: 'secret payload' }],
  ['authorization', { authorization: 'Bearer secret payload' }],
  ['invalid nested capabilities', { capabilities: { streaming: true } }],
  ['invalid revision', { revision: 0 }],
  ['invalid active flag', { isActive: 'yes' }],
] as const)(
  'rejects write snapshots containing %s without leaking payloads',
  async (_name, contamination) => {
    await repo.create('r1', provider())
    const raw = { ...provider(), ...contamination }
    db.prepare(
      'UPDATE provider_write_requests SET provider_snapshot_json=? WHERE request_id=?',
    ).run(JSON.stringify(raw), 'r1')
    await expect(repo.findWriteOutcome('r1')).rejects.toMatchObject({
      code: 'DATABASE_UNAVAILABLE',
      message: expect.not.stringContaining('secret payload'),
    })
  },
)

test('strictly validates persisted test-operation snapshots', async () => {
  await repo.create('r1', provider())
  await repo.transitionTestStatus({
    operationId: 'op1',
    providerId: 'p1',
    nextStatus: 'testing',
    testedAt: 't1',
  })
  db.prepare(
    'UPDATE provider_test_operations SET provider_snapshot_json=? WHERE operation_id=?',
  ).run(JSON.stringify({ ...provider(), apiKey: 'secret payload' }), 'op1')
  await expect(
    repo.transitionTestStatus({
      operationId: 'op1',
      providerId: 'p1',
      nextStatus: 'testing',
      testedAt: 't1',
    }),
  ).rejects.toMatchObject({
    code: 'DATABASE_UNAVAILABLE',
    message: expect.not.stringContaining('secret payload'),
  })
})

test('returns stale across two connections that started from the same revision', async () => {
  await repo.create('r1', provider())
  const secondDb = openDatabase(join(dir, 'app.db'))
  const second = new SqliteProviderRepository(secondDb)
  expect((await repo.findById('p1'))?.revision).toBe(1)
  expect((await second.findById('p1'))?.revision).toBe(1)
  expect(await repo.update('u1', 1, provider('p1', { displayName: 'winner' }))).toMatchObject({
    status: 'applied',
  })
  expect(await second.update('u2', 1, provider('p1', { displayName: 'loser' }))).toEqual({
    status: 'stale',
  })
  expect((await repo.findById('p1'))?.displayName).toBe('winner')
  secondDb.close()
})

test('replays a completed test transition after the live provider is deleted', async () => {
  await repo.create('r1', provider())
  const applied = await repo.transitionTestStatus({
    operationId: 'op1',
    providerId: 'p1',
    nextStatus: 'testing',
    testedAt: 't1',
  })
  await repo.removeIfUnreferenced('d1', 'p1')
  expect(
    await repo.transitionTestStatus({
      operationId: 'op1',
      providerId: 'p1',
      nextStatus: 'testing',
      testedAt: 't1',
    }),
  ).toEqual({ status: 'replayed', provider: (applied as { provider: StoredProvider }).provider })
})

test('rejects non-integer live revisions safely', async () => {
  await repo.create('r1', provider())
  db.exec('PRAGMA ignore_check_constraints=ON')
  db.prepare('UPDATE ai_providers SET revision=?').run(1.5)
  await expect(repo.findById('p1')).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
})
