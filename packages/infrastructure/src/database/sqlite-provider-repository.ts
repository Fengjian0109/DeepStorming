import {
  ProviderUseCaseError,
  type ProviderActivateResult,
  type ProviderMutationResult,
  type ProviderRemoveResult,
  type ProviderRepositoryPort,
  type ProviderTestStatusTransitionResult,
  type ProviderUpdateResult,
  type ProviderWriteOperation,
  type ProviderWriteOutcome,
  type StoredProvider,
} from '@deepstorming/application'
import type { ProviderCapabilities, ProviderTestStatus, ProviderType } from '@deepstorming/domain'
import { databaseError, type SqliteDatabase } from './database'

type Row = Record<string, unknown>
const TYPES = new Set(['mock', 'deepseek', 'openai_compatible'])
const STATUSES = new Set(['testing', 'success', 'error', 'cancelled'])
const isString = (v: unknown): v is string => typeof v === 'string'
const validateCapabilities = (value: unknown): ProviderCapabilities => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('invalid')
  const record = value as Row
  const keys = Object.keys(record)
  if (
    keys.length !== 4 ||
    !['streaming', 'structuredOutput', 'embedding', 'vision'].every(
      (k) => typeof record[k] === 'boolean',
    )
  )
    throw new Error('invalid')
  return {
    streaming: record['streaming'] as boolean,
    structuredOutput: record['structuredOutput'] as boolean,
    embedding: record['embedding'] as boolean,
    vision: record['vision'] as boolean,
  }
}
const capabilities = (raw: unknown): ProviderCapabilities => {
  if (!isString(raw)) throw new Error('invalid')
  return validateCapabilities(JSON.parse(raw) as unknown)
}
const mapRow = (row: Row): StoredProvider => {
  if (
    !isString(row['id']) ||
    !isString(row['provider_type']) ||
    !TYPES.has(row['provider_type']) ||
    !isString(row['display_name']) ||
    !isString(row['model_name']) ||
    !isString(row['created_at']) ||
    !isString(row['updated_at']) ||
    typeof row['revision'] !== 'number' ||
    ![0, 1].includes(row['is_active'] as number)
  )
    throw new Error('invalid')
  if (
    (row['base_url'] !== null && !isString(row['base_url'])) ||
    (row['secret_ref'] !== null && !isString(row['secret_ref'])) ||
    (row['last_test_status'] !== null &&
      (!isString(row['last_test_status']) || !STATUSES.has(row['last_test_status']))) ||
    (row['last_tested_at'] !== null && !isString(row['last_tested_at']))
  )
    throw new Error('invalid')
  return {
    id: row['id'],
    providerType: row['provider_type'] as ProviderType,
    displayName: row['display_name'],
    ...(row['base_url'] === null ? {} : { baseUrl: row['base_url'] as string }),
    modelName: row['model_name'],
    ...(row['secret_ref'] === null ? {} : { secretRef: row['secret_ref'] as string }),
    capabilities: capabilities(row['capabilities_json']),
    isActive: row['is_active'] === 1,
    ...(row['last_test_status'] === null
      ? {}
      : { lastTestStatus: row['last_test_status'] as ProviderTestStatus }),
    ...(row['last_tested_at'] === null ? {} : { lastTestedAt: row['last_tested_at'] as string }),
    createdAt: row['created_at'],
    updatedAt: row['updated_at'],
    revision: row['revision'],
  }
}
const snapshot = (raw: unknown): StoredProvider => {
  if (!isString(raw)) throw new Error('invalid')
  const value: unknown = JSON.parse(raw)
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('invalid')
  const p = value as Row
  const required = [
    'id',
    'providerType',
    'displayName',
    'modelName',
    'capabilities',
    'isActive',
    'createdAt',
    'updatedAt',
    'revision',
  ]
  const optional = ['baseUrl', 'secretRef', 'lastTestStatus', 'lastTestedAt']
  if (
    !Object.keys(p).every((key) => required.includes(key) || optional.includes(key)) ||
    !required.every((key) => Object.hasOwn(p, key))
  )
    throw new Error('invalid')
  if (
    !isString(p['id']) ||
    !isString(p['providerType']) ||
    !TYPES.has(p['providerType']) ||
    !isString(p['displayName']) ||
    !isString(p['modelName']) ||
    typeof p['isActive'] !== 'boolean' ||
    !isString(p['createdAt']) ||
    !isString(p['updatedAt']) ||
    !Number.isInteger(p['revision']) ||
    (p['revision'] as number) < 1
  )
    throw new Error('invalid')
  if (
    (p['baseUrl'] !== undefined && !isString(p['baseUrl'])) ||
    (p['secretRef'] !== undefined && !isString(p['secretRef'])) ||
    (p['lastTestStatus'] !== undefined &&
      (!isString(p['lastTestStatus']) || !STATUSES.has(p['lastTestStatus']))) ||
    (p['lastTestedAt'] !== undefined && !isString(p['lastTestedAt']))
  )
    throw new Error('invalid')
  const result: StoredProvider = {
    id: p['id'],
    providerType: p['providerType'] as ProviderType,
    displayName: p['displayName'],
    ...(p['baseUrl'] === undefined ? {} : { baseUrl: p['baseUrl'] }),
    modelName: p['modelName'],
    ...(p['secretRef'] === undefined ? {} : { secretRef: p['secretRef'] }),
    capabilities: validateCapabilities(p['capabilities']),
    isActive: p['isActive'],
    ...(p['lastTestStatus'] === undefined
      ? {}
      : { lastTestStatus: p['lastTestStatus'] as ProviderTestStatus }),
    ...(p['lastTestedAt'] === undefined ? {} : { lastTestedAt: p['lastTestedAt'] }),
    createdAt: p['createdAt'],
    updatedAt: p['updatedAt'],
    revision: p['revision'] as number,
  }
  return Object.freeze(result)
}
const now = () => new Date().toISOString()

export class SqliteProviderRepository implements ProviderRepositoryPort {
  public constructor(
    private readonly db: SqliteDatabase,
    private readonly isReferenced: (id: string) => boolean = () => false,
  ) {}
  private safe<T>(fn: () => T): T {
    try {
      return fn()
    } catch (error) {
      if (error instanceof ProviderUseCaseError) throw error
      throw databaseError('DATABASE_UNAVAILABLE')
    }
  }
  private row(id: string): StoredProvider | undefined {
    const row = this.db.prepare('SELECT * FROM ai_providers WHERE id=?').get(id) as Row | undefined
    return row && mapRow(row)
  }
  private prior(
    requestId: string,
    operation: ProviderWriteOperation,
    target: string,
  ): { conflict?: ProviderWriteOperation; outcome?: ProviderWriteOutcome } | undefined {
    const r = this.db
      .prepare('SELECT * FROM provider_write_requests WHERE request_id=?')
      .get(requestId) as Row | undefined
    if (!r) return undefined
    if (r['operation'] !== operation || r['target_provider_id'] !== target)
      return { conflict: r['operation'] as ProviderWriteOperation }
    if (operation === 'delete') {
      const status = r['outcome_status']
      return {
        outcome: {
          operation: 'delete',
          outcome:
            status === 'removed'
              ? { status: 'removed', provider: snapshot(r['provider_snapshot_json']) }
              : { status: status as 'blocked' | 'not_found', providerId: target },
        },
      }
    }
    return {
      outcome: {
        operation: operation as Exclude<ProviderWriteOperation, 'delete'>,
        provider: snapshot(r['provider_snapshot_json']),
      },
    }
  }
  private insertOutcome(
    requestId: string,
    operation: ProviderWriteOperation,
    target: string,
    status: string,
    p?: StoredProvider,
  ) {
    this.db
      .prepare('INSERT INTO provider_write_requests VALUES (?,?,?,?,?,?)')
      .run(requestId, operation, target, status, p ? JSON.stringify(p) : null, now())
  }
  private insertProvider(p: StoredProvider) {
    this.db
      .prepare('INSERT INTO ai_providers VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        p['id'],
        p.providerType,
        p.displayName,
        p.baseUrl ?? null,
        p.modelName,
        p.secretRef ?? null,
        JSON.stringify(p.capabilities),
        p.isActive ? 1 : 0,
        p.lastTestStatus ?? null,
        p.lastTestedAt ?? null,
        p.createdAt,
        p.updatedAt,
        p['revision'],
      )
  }
  public async list() {
    return this.safe(() =>
      (this.db.prepare('SELECT * FROM ai_providers ORDER BY created_at,id').all() as Row[]).map(
        mapRow,
      ),
    )
  }
  public async findById(id: string) {
    return this.safe(() => this.row(id))
  }
  public async referencedSecretRefs() {
    return this.safe(
      () =>
        new Set(
          (
            this.db
              .prepare('SELECT DISTINCT secret_ref FROM ai_providers WHERE secret_ref IS NOT NULL')
              .all() as Array<{ secret_ref: string }>
          ).map((x) => x['secret_ref']),
        ),
    )
  }
  public async findWriteOutcome(requestId: string) {
    return this.safe(() => {
      const r = this.db
        .prepare(
          'SELECT operation,target_provider_id FROM provider_write_requests WHERE request_id=?',
        )
        .get(requestId) as Row | undefined
      return r
        ? this.prior(
            requestId,
            r['operation'] as ProviderWriteOperation,
            r['target_provider_id'] as string,
          )?.outcome
        : undefined
    })
  }
  public async create(requestId: string, p: StoredProvider): Promise<ProviderMutationResult> {
    return this.safe(() =>
      this.db.transaction(() => {
        const prior = this.prior(requestId, 'create', p['id'])
        if (prior?.conflict) return { status: 'conflict', existingOperation: prior.conflict }
        if (prior?.outcome && prior.outcome['operation'] !== 'delete')
          return { status: 'replayed', provider: prior.outcome.provider }
        const created = { ...p, revision: 1 }
        this.insertProvider(created)
        this.insertOutcome(requestId, 'create', p['id'], 'succeeded', created)
        return { status: 'applied', provider: created } as const
      })(),
    ) as ProviderMutationResult
  }
  public async update(
    requestId: string,
    expectedRevision: number,
    p: StoredProvider,
  ): Promise<ProviderUpdateResult> {
    return this.safe(() =>
      this.db.transaction(() => {
        const prior = this.prior(requestId, 'update', p['id'])
        if (prior?.conflict) return { status: 'conflict', existingOperation: prior.conflict }
        if (prior?.outcome && prior.outcome['operation'] !== 'delete')
          return { status: 'replayed', provider: prior.outcome.provider }
        const current = this.row(p['id'])
        if (!current) return { status: 'not_found' }
        if (current['revision'] !== expectedRevision) return { status: 'stale' }
        const updated = { ...p, revision: expectedRevision + 1 }
        this.db.prepare('DELETE FROM ai_providers WHERE id=?').run(p['id'])
        this.insertProvider(updated)
        this.insertOutcome(requestId, 'update', p['id'], 'succeeded', updated)
        return { status: 'applied', provider: updated } as const
      })(),
    ) as ProviderUpdateResult
  }
  public async activate(
    requestId: string,
    id: string,
    expectedRevision: number,
    updatedAt: string,
  ): Promise<ProviderActivateResult> {
    return this.safe(() =>
      this.db.transaction(() => {
        const prior = this.prior(requestId, 'activate', id)
        if (prior?.conflict) return { status: 'conflict', existingOperation: prior.conflict }
        if (prior?.outcome && prior.outcome['operation'] !== 'delete')
          return { status: 'replayed', provider: prior.outcome.provider }
        const p = this.row(id)
        if (!p) return { status: 'not_found' }
        if (p['revision'] !== expectedRevision) return { status: 'stale' }
        if (p.providerType !== 'mock' && !p.secretRef) return { status: 'credential_missing' }
        this.db.prepare('UPDATE ai_providers SET is_active=0 WHERE is_active=1').run()
        this.db
          .prepare(
            'UPDATE ai_providers SET is_active=1,updated_at=?,revision=revision+1 WHERE id=? AND revision=?',
          )
          .run(updatedAt, id, expectedRevision)
        const updated = this.row(id)!
        this.insertOutcome(requestId, 'activate', id, 'succeeded', updated)
        return { status: 'applied', provider: updated } as const
      })(),
    ) as ProviderActivateResult
  }
  public async removeIfUnreferenced(requestId: string, id: string): Promise<ProviderRemoveResult> {
    return this.safe(() =>
      this.db.transaction(() => {
        const prior = this.prior(requestId, 'delete', id)
        if (prior?.conflict) return { status: 'conflict', existingOperation: prior.conflict }
        if (prior?.outcome && prior.outcome['operation'] === 'delete') {
          const o = prior.outcome.outcome
          return o.status === 'removed'
            ? { status: 'removed', provider: o.provider, mutation: 'replayed' }
            : o
        }
        const p = this.row(id)
        if (!p) {
          this.insertOutcome(requestId, 'delete', id, 'not_found')
          return { status: 'not_found', providerId: id }
        }
        if (this.isReferenced(id)) {
          this.insertOutcome(requestId, 'delete', id, 'blocked')
          return { status: 'blocked', providerId: id }
        }
        this.db.prepare('DELETE FROM ai_providers WHERE id=?').run(id)
        this.insertOutcome(requestId, 'delete', id, 'removed', p)
        return { status: 'removed', provider: p, mutation: 'applied' } as const
      })(),
    ) as ProviderRemoveResult
  }
  public async transitionTestStatus(t: {
    operationId: string
    providerId: string
    expectedStatus?: ProviderTestStatus
    nextStatus: ProviderTestStatus
    testedAt: string
  }): Promise<ProviderTestStatusTransitionResult> {
    return this.safe(() =>
      this.db.transaction(() => {
        const p = this.row(t.providerId)
        if (!p) return { status: 'not_found' }
        const op = this.db
          .prepare('SELECT * FROM provider_test_operations WHERE operation_id=?')
          .get(t.operationId) as Row | undefined
        if (!op) {
          if (t.expectedStatus !== undefined || t.nextStatus !== 'testing')
            return { status: 'stale' }
        } else {
          if (op['provider_id'] !== t.providerId) return { status: 'stale' }
          if (op['current_status'] === t.nextStatus)
            return { status: 'replayed', provider: snapshot(op['provider_snapshot_json']) }
          if (
            t.expectedStatus !== 'testing' ||
            op['current_status'] !== 'testing' ||
            t.nextStatus === 'testing'
          )
            return { status: 'stale' }
        }
        this.db
          .prepare(
            'UPDATE ai_providers SET last_test_status=?,last_tested_at=?,revision=revision+1 WHERE id=?',
          )
          .run(t.nextStatus, t.testedAt, t.providerId)
        const updated = this.row(t.providerId)!
        if (!op) {
          this.db
            .prepare('INSERT INTO provider_test_operations VALUES (?,?,?,?,?,?)')
            .run(
              t.operationId,
              t.providerId,
              t.nextStatus,
              JSON.stringify(updated),
              t.testedAt,
              t.testedAt,
            )
        } else {
          this.db
            .prepare(
              'UPDATE provider_test_operations SET current_status=?,provider_snapshot_json=?,updated_at=? WHERE operation_id=?',
            )
            .run(t.nextStatus, JSON.stringify(updated), t.testedAt, t.operationId)
        }
        return { status: 'applied', provider: updated } as const
      })(),
    ) as ProviderTestStatusTransitionResult
  }
}
