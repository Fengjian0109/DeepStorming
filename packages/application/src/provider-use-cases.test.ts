import { describe, expect, it } from 'vitest'

import { capabilitiesFor } from '@deepstorming/domain'
import type { ProviderDraft, ProviderProfile, ProviderTestStatus } from '@deepstorming/domain'

import { ProviderUseCaseError } from './provider-errors'
import type {
  ClockPort,
  IdGeneratorPort,
  ProviderMutationResult,
  ProviderUpdateResult,
  ProviderRemoveResult,
  ProviderRepositoryPort,
  ProviderWriteOutcome,
  SecretVaultPort,
  SecretCleanupReporterPort,
  StoredProvider,
} from './provider-ports'
import {
  ActivateProvider,
  CreateProvider,
  DeleteProvider,
  ListProviders,
  UpdateProvider,
  toProviderProfile,
} from './provider-use-cases'

const NOW = '2026-07-10T08:00:00.000Z'
const ID = '018f0000-0000-7000-8000-000000000001'

const storedProvider = (overrides: Partial<StoredProvider> = {}): StoredProvider => ({
  id: ID,
  providerType: 'deepseek',
  displayName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
  capabilities: {
    streaming: true,
    structuredOutput: true,
    embedding: false,
    vision: false,
  },
  isActive: false,
  createdAt: '2026-07-09T08:00:00.000Z',
  updatedAt: '2026-07-09T08:00:00.000Z',
  ...overrides,
})

class FakeRepository implements ProviderRepositoryPort {
  public readonly rows = new Map<string, StoredProvider>()
  public readonly outcomes = new Map<string, ProviderWriteOutcome>()
  public failCreate = false
  public failUpdate = false
  public createFailure?: unknown
  public blocking = false
  public createRaceProvider?: StoredProvider
  public updateRaceProvider?: StoredProvider
  public createRaceConflict = false
  public activateFailure?: unknown
  public updateResult?: 'stale' | 'not_found'
  public activateResult?: 'stale' | 'not_found' | 'credential_missing'
  public beforeUpdate?: () => void
  public beforeActivate?: () => void
  public commitCreateThenThrow = false
  public commitUpdateThenThrow = false
  public commitRemoveThenThrow = false
  public commitActivateThenThrow = false
  public failRecoveryLookup = false
  private writeAttempted = false

  public constructor(
    private readonly events: string[],
    providers: readonly StoredProvider[] = [],
  ) {
    for (const provider of providers) this.rows.set(provider.id, provider)
  }

  public async list(): Promise<readonly StoredProvider[]> {
    return [...this.rows.values()]
  }

  public async findById(id: string): Promise<StoredProvider | undefined> {
    return this.rows.get(id)
  }

  public async findWriteOutcome(requestId: string): Promise<ProviderWriteOutcome | undefined> {
    if (this.failRecoveryLookup && this.writeAttempted) throw new Error('lookup unavailable')
    return this.outcomes.get(requestId)
  }

  public async create(
    requestId: string,
    provider: StoredProvider,
  ): Promise<ProviderMutationResult> {
    this.events.push('repository.create')
    this.writeAttempted = true
    const replay = this.outcomes.get(requestId)
    if (replay?.operation === 'create') {
      return { status: 'replayed', provider: replay.provider }
    }
    if (this.createRaceConflict) return { status: 'conflict', existingOperation: 'activate' }
    if (this.createRaceProvider !== undefined) {
      this.rows.set(this.createRaceProvider.id, this.createRaceProvider)
      this.outcomes.set(requestId, { operation: 'create', provider: this.createRaceProvider })
      return { status: 'replayed', provider: this.createRaceProvider }
    }
    if (this.createFailure !== undefined) throw this.createFailure
    if (this.failCreate) throw new Error('sqlite path and secret must not escape')
    this.rows.set(provider.id, provider)
    this.outcomes.set(requestId, { operation: 'create', provider })
    if (this.commitCreateThenThrow) throw new Error('ambiguous commit')
    return { status: 'applied', provider }
  }

  public async update(
    requestId: string,
    expectedUpdatedAt: string,
    provider: StoredProvider,
  ): Promise<ProviderUpdateResult> {
    this.events.push('repository.update')
    this.writeAttempted = true
    this.beforeUpdate?.()
    const replay = this.outcomes.get(requestId)
    if (replay?.operation === 'update') {
      return { status: 'replayed', provider: replay.provider }
    }
    if (this.updateRaceProvider !== undefined) {
      this.rows.set(this.updateRaceProvider.id, this.updateRaceProvider)
      this.outcomes.set(requestId, { operation: 'update', provider: this.updateRaceProvider })
      return { status: 'replayed', provider: this.updateRaceProvider }
    }
    if (this.failUpdate) throw new Error('sqlite path and secret must not escape')
    if (this.updateResult !== undefined) return { status: this.updateResult }
    const current = this.rows.get(provider.id)
    if (current === undefined) return { status: 'not_found' }
    if (current.updatedAt !== expectedUpdatedAt) return { status: 'stale' }
    this.rows.set(provider.id, provider)
    this.outcomes.set(requestId, { operation: 'update', provider })
    if (this.commitUpdateThenThrow) throw new Error('ambiguous commit')
    return { status: 'applied', provider }
  }

  public async removeIfUnreferenced(requestId: string, id: string): Promise<ProviderRemoveResult> {
    this.events.push('repository.remove')
    const replay = this.outcomes.get(requestId)
    if (replay?.operation === 'delete') {
      return replay.outcome.status === 'removed'
        ? { ...replay.outcome, mutation: 'replayed' }
        : replay.outcome
    }
    if (this.blocking) {
      const outcome = { status: 'blocked' } as const
      this.outcomes.set(requestId, { operation: 'delete', outcome })
      if (this.commitRemoveThenThrow) throw new Error('ambiguous commit')
      return outcome
    }
    const provider = this.rows.get(id)
    if (provider === undefined) {
      const outcome = { status: 'not_found' } as const
      this.outcomes.set(requestId, { operation: 'delete', outcome })
      if (this.commitRemoveThenThrow) throw new Error('ambiguous commit')
      return outcome
    }
    this.rows.delete(id)
    const outcome = { status: 'removed', provider } as const
    this.outcomes.set(requestId, { operation: 'delete', outcome })
    if (this.commitRemoveThenThrow) throw new Error('ambiguous commit')
    return { ...outcome, mutation: 'applied' }
  }

  public async activate(
    requestId: string,
    id: string,
    expectedUpdatedAt: string,
    updatedAt: string,
  ): Promise<ProviderMutationResult | { status: 'stale' | 'not_found' | 'credential_missing' }> {
    this.events.push('repository.activate')
    this.beforeActivate?.()
    if (this.activateFailure !== undefined) throw this.activateFailure
    const replay = this.outcomes.get(requestId)
    if (replay?.operation === 'activate') {
      return { status: 'replayed', provider: replay.provider }
    }
    if (this.activateResult !== undefined) return { status: this.activateResult }
    const selected = this.rows.get(id)
    if (selected === undefined) return { status: 'not_found' }
    if (selected.updatedAt !== expectedUpdatedAt) return { status: 'stale' }
    if (selected.providerType !== 'mock' && selected.secretRef === undefined) {
      return { status: 'credential_missing' }
    }
    for (const [rowId, provider] of this.rows) {
      this.rows.set(rowId, { ...provider, isActive: rowId === id, updatedAt })
    }
    const provider = this.rows.get(id) as StoredProvider
    this.outcomes.set(requestId, { operation: 'activate', provider })
    if (this.commitActivateThenThrow) throw new Error('ambiguous commit')
    return { status: 'applied', provider }
  }

  public async transitionTestStatus(transition: {
    operationId: string
    providerId: string
    expectedStatus?: ProviderTestStatus
    nextStatus: ProviderTestStatus
    testedAt: string
  }): Promise<
    | { status: 'applied' | 'replayed'; provider: StoredProvider }
    | { status: 'stale' }
    | { status: 'not_found' }
  > {
    const provider = this.rows.get(transition.providerId)
    if (provider === undefined) return { status: 'not_found' }
    if (
      transition.expectedStatus !== undefined &&
      provider.lastTestStatus !== transition.expectedStatus
    ) {
      return { status: 'stale' }
    }
    const updated = {
      ...provider,
      lastTestStatus: transition.nextStatus,
      lastTestedAt: transition.testedAt,
    }
    this.rows.set(transition.providerId, updated)
    return { status: 'applied', provider: updated }
  }

  public async referencedSecretRefs(): Promise<ReadonlySet<string>> {
    return new Set(
      [...this.rows.values()].flatMap((provider) =>
        provider.secretRef === undefined ? [] : [provider.secretRef],
      ),
    )
  }
}

class FakeCleanupReporter implements SecretCleanupReporterPort {
  public readonly failures: Array<{
    readonly secretRef: string
    readonly code: 'SECRET_DELETE_FAILED'
  }> = []

  public reportFailure(failure: {
    readonly secretRef: string
    readonly code: 'SECRET_DELETE_FAILED'
  }): void {
    this.failures.push(failure)
  }
}

class FakeVault implements SecretVaultPort {
  public readonly secrets = new Map<string, string>()
  public failPut = false
  public failRemove = false
  private nextRef = 1

  public constructor(private readonly events: string[]) {}

  public async put(secret: string): Promise<string> {
    this.events.push('vault.put')
    if (this.failPut) throw new Error(`vault leaked ${secret}`)
    const ref = `secret-${this.nextRef++}`
    this.secrets.set(ref, secret)
    return ref
  }

  public async get(ref: string): Promise<string> {
    const secret = this.secrets.get(ref)
    if (secret === undefined) throw new Error('missing secret')
    return secret
  }

  public async remove(ref: string): Promise<void> {
    this.events.push(`vault.remove:${ref}`)
    if (this.failRemove) throw new Error(`vault path ${ref}`)
    this.secrets.delete(ref)
  }

  public async reconcile(_referencedRefs: ReadonlySet<string>): Promise<void> {}
}

const clock: ClockPort = { now: () => NOW }
const ids: IdGeneratorPort = { generate: () => ID }
const REQUEST_ID = '018f0000-0000-7000-8000-000000000010'
const write = (provider: ProviderDraft, requestId = REQUEST_ID) => ({ requestId, provider })
const deepSeekDraft = (apiKey?: string): ProviderDraft => ({
  providerType: 'deepseek',
  displayName: ' DeepSeek ',
  modelName: ' deepseek-chat ',
  ...(apiKey === undefined ? {} : { apiKey }),
})

const expectStableError = async (
  promise: Promise<unknown>,
  code: ProviderUseCaseError['code'],
): Promise<ProviderUseCaseError> => {
  const error = await promise.catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(ProviderUseCaseError)
  expect(error).toMatchObject({ code })
  expect(JSON.stringify(error)).not.toMatch(/sqlite path|vault leaked|vault path|api-key/u)
  return error as ProviderUseCaseError
}

describe('CreateProvider', () => {
  it('writes a secret before persisting normalized metadata and returns only a public profile', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events)
    const vault = new FakeVault(events)
    const input = deepSeekDraft(' api-key ')
    const snapshot = { ...input }

    const result = await new CreateProvider(
      repository,
      vault,
      clock,
      ids,
      new FakeCleanupReporter(),
    ).execute(write(input))

    expect(events).toEqual(['vault.put', 'repository.create'])
    expect(vault.secrets.get('secret-1')).toBe('api-key')
    expect(repository.rows.get(ID)).toEqual(
      storedProvider({
        displayName: 'DeepSeek',
        secretRef: 'secret-1',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    )
    expect(result).toEqual({
      ...storedProvider({ displayName: 'DeepSeek', createdAt: NOW, updatedAt: NOW }),
      hasApiKey: true,
    })
    expect(result).not.toHaveProperty('secretRef')
    expect(result).not.toHaveProperty('apiKey')
    expect(input).toEqual(snapshot)
  })

  it('preserves a new secret for reconciliation when create outcome is unknown', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events)
    repository.failCreate = true
    const vault = new FakeVault(events)

    const reporter = new FakeCleanupReporter()
    await expectStableError(
      new CreateProvider(repository, vault, clock, ids, reporter).execute(
        write(deepSeekDraft('api-key')),
      ),
      'DATABASE_UNAVAILABLE',
    )

    expect(events).toEqual(['vault.put', 'repository.create'])
    expect(repository.rows.size).toBe(0)
    expect(vault.secrets.get('secret-1')).toBe('api-key')
    expect(reporter.failures).toEqual([{ secretRef: 'secret-1', code: 'SECRET_DELETE_FAILED' }])
  })

  it('keeps the primary database error when outcome lookup fails and reports cleanup pending', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events)
    repository.failCreate = true
    repository.failRecoveryLookup = true
    const vault = new FakeVault(events)
    const reporter = new FakeCleanupReporter()

    const error = await expectStableError(
      new CreateProvider(repository, vault, clock, ids, reporter).execute(
        write(deepSeekDraft('api-key')),
      ),
      'DATABASE_UNAVAILABLE',
    )

    expect(error.retryable).toBe(true)
    expect(events).toEqual(['vault.put', 'repository.create'])
    expect(vault.secrets.has('secret-1')).toBe(true)
    expect(reporter.failures).toEqual([{ secretRef: 'secret-1', code: 'SECRET_DELETE_FAILED' }])
  })

  it('maps validation and Vault write failures without persisting a row', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events)
    const vault = new FakeVault(events)

    await expectStableError(
      new CreateProvider(repository, vault, clock, ids, new FakeCleanupReporter()).execute(
        write({
          providerType: 'deepseek',
          displayName: ' ',
          modelName: 'chat',
        }),
      ),
      'PROVIDER_VALIDATION_FAILED',
    )

    vault.failPut = true
    await expectStableError(
      new CreateProvider(repository, vault, clock, ids, new FakeCleanupReporter()).execute(
        write(deepSeekDraft('api-key')),
      ),
      'SECRET_WRITE_FAILED',
    )
    expect(repository.rows.size).toBe(0)
    expect(events).toEqual(['vault.put'])
  })

  it('canonicalizes an already-typed adapter error instead of exposing its message or details', async () => {
    const repository = new FakeRepository([])
    repository.createFailure = new ProviderUseCaseError(
      'DATABASE_UNAVAILABLE',
      'sqlite /private/path contains api-key',
      true,
      { fieldName: 'api-key' },
    )
    const error = await expectStableError(
      new CreateProvider(
        repository,
        new FakeVault([]),
        clock,
        ids,
        new FakeCleanupReporter(),
      ).execute(write(deepSeekDraft())),
      'DATABASE_UNAVAILABLE',
    )

    expect(error.message).toBe('Provider storage is temporarily unavailable.')
    expect(error.details).toBeUndefined()
  })

  it('generates the ID and timestamp before writing a secret', async () => {
    const events: string[] = []
    const orderedClock: ClockPort = {
      now: () => {
        events.push('clock.now')
        return NOW
      },
    }
    const orderedIds: IdGeneratorPort = {
      generate: () => {
        events.push('ids.generate')
        return ID
      },
    }

    await new CreateProvider(
      new FakeRepository(events),
      new FakeVault(events),
      orderedClock,
      orderedIds,
      new FakeCleanupReporter(),
    ).execute(write(deepSeekDraft('api-key')))

    expect(events).toEqual(['ids.generate', 'clock.now', 'vault.put', 'repository.create'])
  })

  it('replays a request ID without writing another secret or row', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events)
    const vault = new FakeVault(events)
    const create = new CreateProvider(repository, vault, clock, ids, new FakeCleanupReporter())

    const first = await create.execute(write(deepSeekDraft('api-key')))
    const stateAfterFirst = new Map(repository.rows)
    const eventsAfterFirst = [...events]
    const second = await create.execute(write(deepSeekDraft('different-key')))

    expect(second).toEqual(first)
    expect(repository.rows).toEqual(stateAfterFirst)
    expect(events).toEqual(eventsAfterFirst)
    expect(vault.secrets).toEqual(new Map([['secret-1', 'api-key']]))
  })

  it('compensates only the new secret when a concurrent create already cached the outcome', async () => {
    const events: string[] = []
    const original = storedProvider({ secretRef: 'original-ref', createdAt: NOW, updatedAt: NOW })
    const repository = new FakeRepository(events)
    repository.createRaceProvider = original
    const vault = new FakeVault(events)

    const result = await new CreateProvider(
      repository,
      vault,
      clock,
      ids,
      new FakeCleanupReporter(),
    ).execute(write(deepSeekDraft('racing-key')))

    expect(result).toMatchObject({ id: original.id, hasApiKey: true })
    expect(events).toEqual(['vault.put', 'repository.create', 'vault.remove:secret-1'])
    expect(vault.secrets.size).toBe(0)
    expect(repository.rows.get(ID)).toBe(original)
  })

  it('maps a cross-operation race to validation and compensates its new secret', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events)
    repository.createRaceConflict = true
    const vault = new FakeVault(events)

    await expectStableError(
      new CreateProvider(repository, vault, clock, ids, new FakeCleanupReporter()).execute(
        write(deepSeekDraft('racing-key')),
      ),
      'PROVIDER_VALIDATION_FAILED',
    )

    expect(events).toEqual(['vault.put', 'repository.create', 'vault.remove:secret-1'])
    expect(vault.secrets.size).toBe(0)
    expect(repository.rows.size).toBe(0)
  })

  it('recovers committed create success after an ambiguous repository exception', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events)
    repository.commitCreateThenThrow = true
    const vault = new FakeVault(events)
    const reporter = new FakeCleanupReporter()

    const result = await new CreateProvider(repository, vault, clock, ids, reporter).execute(
      write(deepSeekDraft('committed-key')),
    )

    expect(result).toMatchObject({ id: ID, hasApiKey: true })
    expect(repository.rows.get(ID)?.secretRef).toBe('secret-1')
    expect(vault.secrets.get('secret-1')).toBe('committed-key')
    expect(reporter.failures).toEqual([])
  })

  it('keeps replay success when loser-secret cleanup fails and reports only the ref and code', async () => {
    const original = storedProvider({ secretRef: 'winner-ref', createdAt: NOW, updatedAt: NOW })
    const repository = new FakeRepository([])
    repository.createRaceProvider = original
    const vault = new FakeVault([])
    vault.failRemove = true
    const reporter = new FakeCleanupReporter()

    const result = await new CreateProvider(repository, vault, clock, ids, reporter).execute(
      write(deepSeekDraft('losing-key')),
    )

    expect(result).toMatchObject({ id: original.id, hasApiKey: true })
    expect(reporter.failures).toEqual([{ secretRef: 'secret-1', code: 'SECRET_DELETE_FAILED' }])
  })

  it('keeps conflict validation primary when orphan cleanup fails', async () => {
    const repository = new FakeRepository([])
    repository.createRaceConflict = true
    const vault = new FakeVault([])
    vault.failRemove = true
    const reporter = new FakeCleanupReporter()

    await expectStableError(
      new CreateProvider(repository, vault, clock, ids, reporter).execute(
        write(deepSeekDraft('losing-key')),
      ),
      'PROVIDER_VALIDATION_FAILED',
    )
    expect(reporter.failures).toEqual([{ secretRef: 'secret-1', code: 'SECRET_DELETE_FAILED' }])
  })
})

describe('UpdateProvider', () => {
  it.each([undefined, '', '   '])(
    'retains the old secret for an absent or blank key: %s',
    async (apiKey) => {
      const events: string[] = []
      const existing = storedProvider({
        secretRef: 'old-ref',
        isActive: true,
        lastTestStatus: 'success',
        lastTestedAt: '2026-07-09T09:00:00.000Z',
      })
      const repository = new FakeRepository(events, [existing])
      const vault = new FakeVault(events)
      vault.secrets.set('old-ref', 'old-key')
      const input = {
        ...deepSeekDraft(apiKey),
        displayName: ' Updated ',
      }
      const snapshot = { ...input }

      const result = await new UpdateProvider(
        repository,
        vault,
        new FakeCleanupReporter(),
        clock,
      ).execute({ requestId: REQUEST_ID, id: ID, provider: input })

      expect(events).toEqual(['repository.update'])
      expect(repository.rows.get(ID)).toEqual({
        ...existing,
        displayName: 'Updated',
        updatedAt: NOW,
      })
      expect(result).toMatchObject({
        displayName: 'Updated',
        hasApiKey: true,
        isActive: true,
        lastTestStatus: 'success',
        lastTestedAt: '2026-07-09T09:00:00.000Z',
        createdAt: existing.createdAt,
      })
      expect(input).toEqual(snapshot)
    },
  )

  it('commits a replacement before removing the old secret', async () => {
    const events: string[] = []
    const existing = storedProvider({ secretRef: 'old-ref' })
    const repository = new FakeRepository(events, [existing])
    const vault = new FakeVault(events)
    vault.secrets.set('old-ref', 'old-key')

    await new UpdateProvider(repository, vault, new FakeCleanupReporter(), clock).execute({
      requestId: REQUEST_ID,
      id: ID,
      provider: deepSeekDraft('new-key'),
    })

    expect(events).toEqual(['vault.put', 'repository.update', 'vault.remove:old-ref'])
    expect(repository.rows.get(ID)?.secretRef).toBe('secret-1')
    expect(vault.secrets).toEqual(new Map([['secret-1', 'new-key']]))
  })

  it('leaves the row and old secret untouched when the new Vault write fails', async () => {
    const events: string[] = []
    const existing = storedProvider({ secretRef: 'old-ref' })
    const repository = new FakeRepository(events, [existing])
    const vault = new FakeVault(events)
    vault.secrets.set('old-ref', 'old-key')
    vault.failPut = true

    await expectStableError(
      new UpdateProvider(repository, vault, new FakeCleanupReporter(), clock).execute({
        requestId: REQUEST_ID,
        id: ID,
        provider: deepSeekDraft('new-key'),
      }),
      'SECRET_WRITE_FAILED',
    )

    expect(events).toEqual(['vault.put'])
    expect(repository.rows.get(ID)).toBe(existing)
    expect(vault.secrets.get('old-ref')).toBe('old-key')
  })

  it('preserves the new secret for reconciliation after an unknown update outcome', async () => {
    const events: string[] = []
    const existing = storedProvider({ secretRef: 'old-ref' })
    const repository = new FakeRepository(events, [existing])
    repository.failUpdate = true
    const vault = new FakeVault(events)
    vault.secrets.set('old-ref', 'old-key')

    const reporter = new FakeCleanupReporter()
    await expectStableError(
      new UpdateProvider(repository, vault, reporter, clock).execute({
        requestId: REQUEST_ID,
        id: ID,
        provider: deepSeekDraft('new-key'),
      }),
      'DATABASE_UNAVAILABLE',
    )

    expect(events).toEqual(['vault.put', 'repository.update'])
    expect(repository.rows.get(ID)).toBe(existing)
    expect(vault.secrets).toEqual(
      new Map([
        ['old-ref', 'old-key'],
        ['secret-1', 'new-key'],
      ]),
    )
    expect(reporter.failures).toEqual([{ secretRef: 'secret-1', code: 'SECRET_DELETE_FAILED' }])
  })

  it('recovers committed update success after an ambiguous repository exception', async () => {
    const existing = storedProvider({ secretRef: 'old-ref' })
    const repository = new FakeRepository([], [existing])
    repository.commitUpdateThenThrow = true
    const vault = new FakeVault([])
    vault.secrets.set('old-ref', 'old-key')

    const result = await new UpdateProvider(
      repository,
      vault,
      new FakeCleanupReporter(),
      clock,
    ).execute({ requestId: REQUEST_ID, id: ID, provider: deepSeekDraft('new-key') })

    expect(result.hasApiKey).toBe(true)
    expect(repository.rows.get(ID)?.secretRef).toBe('secret-1')
    expect(vault.secrets.get('secret-1')).toBe('new-key')
    expect(vault.secrets.has('old-ref')).toBe(false)
  })

  it('preserves a new ref when update outcome lookup is unavailable', async () => {
    const repository = new FakeRepository([], [storedProvider({ secretRef: 'old-ref' })])
    repository.failUpdate = true
    repository.failRecoveryLookup = true
    const vault = new FakeVault([])
    const reporter = new FakeCleanupReporter()

    await expectStableError(
      new UpdateProvider(repository, vault, reporter, clock).execute({
        requestId: REQUEST_ID,
        id: ID,
        provider: deepSeekDraft('new-key'),
      }),
      'DATABASE_UNAVAILABLE',
    )
    expect(vault.secrets.get('secret-1')).toBe('new-key')
    expect(reporter.failures).toEqual([{ secretRef: 'secret-1', code: 'SECRET_DELETE_FAILED' }])
  })

  it('rejects a stale concurrent update without losing the winning row', async () => {
    const existing = storedProvider({ secretRef: 'old-ref' })
    const winner = storedProvider({
      displayName: 'Winner',
      secretRef: 'winner-ref',
      updatedAt: NOW,
    })
    const repository = new FakeRepository([], [existing])
    repository.beforeUpdate = () => repository.rows.set(ID, winner)

    await expectStableError(
      new UpdateProvider(repository, new FakeVault([]), new FakeCleanupReporter(), clock).execute({
        requestId: REQUEST_ID,
        id: ID,
        provider: deepSeekDraft(),
      }),
      'PROVIDER_VALIDATION_FAILED',
    )
    expect(repository.rows.get(ID)).toBe(winner)
  })

  it('does not retain a contaminated Mock secret when changing to cloud without a key', async () => {
    const contaminated = storedProvider({ providerType: 'mock', secretRef: 'legacy-ref' })
    const repository = new FakeRepository([], [contaminated])

    const result = await new UpdateProvider(
      repository,
      new FakeVault([]),
      new FakeCleanupReporter(),
      clock,
    ).execute({ requestId: REQUEST_ID, id: ID, provider: deepSeekDraft() })

    expect(result.hasApiKey).toBe(false)
    expect(repository.rows.get(ID)).not.toHaveProperty('secretRef')
  })

  it('rejects changing an active unkeyed Mock into a cloud provider', async () => {
    const events: string[] = []
    const mock: StoredProvider = {
      id: ID,
      providerType: 'mock',
      displayName: 'Mock',
      modelName: 'deterministic',
      capabilities: {
        streaming: true,
        structuredOutput: true,
        embedding: false,
        vision: false,
      },
      isActive: true,
      createdAt: '2026-07-09T08:00:00.000Z',
      updatedAt: '2026-07-09T08:00:00.000Z',
    }
    const repository = new FakeRepository(events, [mock])

    await expectStableError(
      new UpdateProvider(
        repository,
        new FakeVault(events),
        new FakeCleanupReporter(),
        clock,
      ).execute({ requestId: REQUEST_ID, id: ID, provider: deepSeekDraft() }),
      'PROVIDER_VALIDATION_FAILED',
    )

    expect(events).toEqual([])
    expect(repository.rows.get(ID)).toBe(mock)
  })

  it('clears an old identity secret when changing to Mock and ignores a supplied Mock key', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events, [storedProvider({ secretRef: 'old-ref' })])
    const vault = new FakeVault(events)
    vault.secrets.set('old-ref', 'old-key')

    const result = await new UpdateProvider(
      repository,
      vault,
      new FakeCleanupReporter(),
      clock,
    ).execute({
      requestId: REQUEST_ID,
      id: ID,
      provider: {
        providerType: 'mock',
        displayName: 'Mock',
        modelName: 'deterministic',
        apiKey: 'ignored-key',
      },
    })

    expect(events).toEqual(['repository.update', 'vault.remove:old-ref'])
    expect(result.hasApiKey).toBe(false)
    expect(repository.rows.get(ID)).not.toHaveProperty('secretRef')
    expect(vault.secrets.size).toBe(0)
  })

  it('requires a new credential when changing between cloud identity types', async () => {
    const events: string[] = []
    const existing = storedProvider({ secretRef: 'deepseek-ref' })
    const repository = new FakeRepository(events, [existing])

    await expectStableError(
      new UpdateProvider(
        repository,
        new FakeVault(events),
        new FakeCleanupReporter(),
        clock,
      ).execute({
        requestId: REQUEST_ID,
        id: ID,
        provider: {
          providerType: 'openai_compatible',
          displayName: 'Compatible',
          baseUrl: 'https://models.example.com/v1',
          modelName: 'chat',
        },
      }),
      'PROVIDER_VALIDATION_FAILED',
    )

    expect(events).toEqual([])
    expect(repository.rows.get(ID)).toBe(existing)
  })

  it('replaces the identity credential when changing between cloud types', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events, [storedProvider({ secretRef: 'old-ref' })])
    const vault = new FakeVault(events)
    vault.secrets.set('old-ref', 'old-key')

    const result = await new UpdateProvider(
      repository,
      vault,
      new FakeCleanupReporter(),
      clock,
    ).execute({
      requestId: REQUEST_ID,
      id: ID,
      provider: {
        providerType: 'openai_compatible',
        displayName: 'Compatible',
        baseUrl: 'https://models.example.com/v1',
        modelName: 'chat',
        apiKey: 'new-identity-key',
      },
    })

    expect(events).toEqual(['vault.put', 'repository.update', 'vault.remove:old-ref'])
    expect(result).toMatchObject({ providerType: 'openai_compatible', hasApiKey: true })
    expect(repository.rows.get(ID)?.secretRef).toBe('secret-1')
  })

  it('allows an inactive Mock to become an unkeyed cloud configuration', async () => {
    const mock: StoredProvider = {
      id: ID,
      providerType: 'mock',
      displayName: 'Mock',
      modelName: 'deterministic',
      capabilities: capabilitiesFor('mock'),
      isActive: false,
      createdAt: NOW,
      updatedAt: NOW,
    }
    const repository = new FakeRepository([], [mock])

    const result = await new UpdateProvider(
      repository,
      new FakeVault([]),
      new FakeCleanupReporter(),
      clock,
    ).execute({ requestId: REQUEST_ID, id: ID, provider: deepSeekDraft() })

    expect(result).toMatchObject({ providerType: 'deepseek', hasApiKey: false, isActive: false })
    expect(repository.rows.get(ID)).not.toHaveProperty('secretRef')
  })

  it('clears stale connection-test state when effective configuration changes', async () => {
    const existing = storedProvider({
      secretRef: 'old-ref',
      lastTestStatus: 'success',
      lastTestedAt: '2026-07-09T09:00:00.000Z',
    })
    const repository = new FakeRepository([], [existing])

    const result = await new UpdateProvider(
      repository,
      new FakeVault([]),
      new FakeCleanupReporter(),
      clock,
    ).execute({
      requestId: REQUEST_ID,
      id: ID,
      provider: { ...deepSeekDraft(), modelName: 'deepseek-reasoner' },
    })

    expect(result).not.toHaveProperty('lastTestStatus')
    expect(result).not.toHaveProperty('lastTestedAt')
    expect(repository.rows.get(ID)).not.toHaveProperty('lastTestStatus')
    expect(repository.rows.get(ID)).not.toHaveProperty('lastTestedAt')
  })

  it('reports post-commit cleanup pending and replays success without rotating again', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events, [storedProvider({ secretRef: 'old-ref' })])
    const vault = new FakeVault(events)
    vault.secrets.set('old-ref', 'old-key')
    vault.failRemove = true
    const reporter = new FakeCleanupReporter()
    const update = new UpdateProvider(repository, vault, reporter, clock)
    const request = {
      requestId: REQUEST_ID,
      id: ID,
      provider: deepSeekDraft('new-key'),
    } as const

    const first = await update.execute(request)
    const eventsAfterFirst = [...events]
    const second = await update.execute(request)

    expect(first).toEqual(second)
    expect(first.hasApiKey).toBe(true)
    expect(repository.rows.get(ID)?.secretRef).toBe('secret-1')
    expect(eventsAfterFirst).toEqual(['vault.put', 'repository.update', 'vault.remove:old-ref'])
    expect(events).toEqual(eventsAfterFirst)
    expect(reporter.failures).toEqual([{ secretRef: 'old-ref', code: 'SECRET_DELETE_FAILED' }])
  })

  it('compensates the new ref when a concurrent update returns the cached original result', async () => {
    const events: string[] = []
    const existing = storedProvider({ secretRef: 'old-ref' })
    const originalResult = storedProvider({ displayName: 'Concurrent', secretRef: 'winner-ref' })
    const repository = new FakeRepository(events, [existing])
    repository.updateRaceProvider = originalResult
    const vault = new FakeVault(events)

    const result = await new UpdateProvider(
      repository,
      vault,
      new FakeCleanupReporter(),
      clock,
    ).execute({
      requestId: REQUEST_ID,
      id: ID,
      provider: deepSeekDraft('losing-key'),
    })

    expect(result).toMatchObject({ displayName: 'Concurrent', hasApiKey: true })
    expect(events).toEqual(['vault.put', 'repository.update', 'vault.remove:secret-1'])
    expect(vault.secrets.size).toBe(0)
    expect(repository.rows.get(ID)).toBe(originalResult)
  })
})

describe('DeleteProvider', () => {
  it('removes metadata before cleaning up its secret', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events, [storedProvider({ secretRef: 'old-ref' })])
    const vault = new FakeVault(events)
    vault.secrets.set('old-ref', 'old-key')

    await new DeleteProvider(repository, vault, new FakeCleanupReporter()).execute({
      requestId: REQUEST_ID,
      id: ID,
    })

    expect(events).toEqual(['repository.remove', 'vault.remove:old-ref'])
    expect(repository.rows.has(ID)).toBe(false)
    expect(vault.secrets.has('old-ref')).toBe(false)
  })

  it('rejects blocking references without changing metadata or secrets', async () => {
    const events: string[] = []
    const existing = storedProvider({ secretRef: 'old-ref' })
    const repository = new FakeRepository(events, [existing])
    repository.blocking = true
    const vault = new FakeVault(events)
    vault.secrets.set('old-ref', 'old-key')

    await expectStableError(
      new DeleteProvider(repository, vault, new FakeCleanupReporter()).execute({
        requestId: REQUEST_ID,
        id: ID,
      }),
      'PROVIDER_VALIDATION_FAILED',
    )

    expect(events).toEqual(['repository.remove'])
    expect(repository.rows.get(ID)).toBe(existing)
    expect(vault.secrets.get('old-ref')).toBe('old-key')
  })

  it('reports cleanup pending after atomic deletion and replays success without deleting again', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events, [storedProvider({ secretRef: 'old-ref' })])
    const vault = new FakeVault(events)
    vault.secrets.set('old-ref', 'old-key')
    vault.failRemove = true
    const reporter = new FakeCleanupReporter()
    const remove = new DeleteProvider(repository, vault, reporter)
    const request = { requestId: REQUEST_ID, id: ID }

    await remove.execute(request)
    const eventsAfterFirst = [...events]
    await remove.execute(request)

    expect(repository.rows.has(ID)).toBe(false)
    expect(eventsAfterFirst).toEqual(['repository.remove', 'vault.remove:old-ref'])
    expect(events).toEqual(eventsAfterFirst)
    expect(reporter.failures).toEqual([{ secretRef: 'old-ref', code: 'SECRET_DELETE_FAILED' }])
  })

  it('recovers a committed deletion and performs post-commit secret cleanup', async () => {
    const repository = new FakeRepository([], [storedProvider({ secretRef: 'old-ref' })])
    repository.commitRemoveThenThrow = true
    const vault = new FakeVault([])
    vault.secrets.set('old-ref', 'old-key')

    await new DeleteProvider(repository, vault, new FakeCleanupReporter()).execute({
      requestId: REQUEST_ID,
      id: ID,
    })

    expect(repository.rows.has(ID)).toBe(false)
    expect(vault.secrets.has('old-ref')).toBe(false)
  })

  it.each([
    ['blocked', true, 'PROVIDER_VALIDATION_FAILED'],
    ['not_found', false, 'PROVIDER_NOT_FOUND'],
  ] as const)('recovers a committed %s deletion outcome', async (_status, blocking, code) => {
    const providers = blocking ? [storedProvider()] : []
    const repository = new FakeRepository([], providers)
    repository.blocking = blocking
    repository.commitRemoveThenThrow = true

    await expectStableError(
      new DeleteProvider(repository, new FakeVault([]), new FakeCleanupReporter()).execute({
        requestId: REQUEST_ID,
        id: ID,
      }),
      code,
    )
  })
})

describe('ActivateProvider and ListProviders', () => {
  it('rejects an unkeyed cloud provider and activates Mock and keyed cloud providers', async () => {
    const events: string[] = []
    const cloud = storedProvider()
    const mock: StoredProvider = {
      id: '018f0000-0000-7000-8000-000000000002',
      providerType: 'mock',
      displayName: 'Mock',
      modelName: 'deterministic',
      capabilities: {
        streaming: true,
        structuredOutput: true,
        embedding: false,
        vision: false,
      },
      isActive: false,
      createdAt: '2026-07-09T08:00:00.000Z',
      updatedAt: '2026-07-09T08:00:00.000Z',
    }
    const keyed = storedProvider({
      id: '018f0000-0000-7000-8000-000000000003',
      secretRef: 'keyed-ref',
    })
    const repository = new FakeRepository(events, [cloud, mock, keyed])
    const activate = new ActivateProvider(repository, clock)

    await expectStableError(
      activate.execute({ requestId: REQUEST_ID, id: cloud.id }),
      'PROVIDER_VALIDATION_FAILED',
    )
    expect(repository.rows.get(cloud.id)?.isActive).toBe(false)

    expect(
      await activate.execute({
        requestId: '018f0000-0000-7000-8000-000000000011',
        id: mock.id,
      }),
    ).toMatchObject({ isActive: true, hasApiKey: false })
    expect(
      await activate.execute({
        requestId: '018f0000-0000-7000-8000-000000000012',
        id: keyed.id,
      }),
    ).toMatchObject({ isActive: true, hasApiKey: true })
    expect(repository.rows.get(mock.id)?.isActive).toBe(false)
    expect(repository.rows.get(keyed.id)?.updatedAt).toBe(NOW)
  })

  it('lists public profiles with hasApiKey and no private fields', async () => {
    const repository = new FakeRepository(
      [],
      [
        storedProvider({ secretRef: 'secret-ref' }),
        storedProvider({ id: '018f0000-0000-7000-8000-000000000002', providerType: 'mock' }),
      ],
    )

    const result: readonly ProviderProfile[] = await new ListProviders(repository).execute()

    expect(result.map((provider) => provider.hasApiKey)).toEqual([true, false])
    for (const provider of result) {
      expect(provider).not.toHaveProperty('secretRef')
      expect(provider).not.toHaveProperty('apiKey')
    }
  })

  it('projects profiles through an explicit allowlist even when an adapter object is contaminated', () => {
    const contaminated = {
      ...storedProvider({ secretRef: 'secret-ref' }),
      apiKey: 'must-not-cross',
      adapterMetadata: 'private',
    } as StoredProvider

    const result = toProviderProfile(contaminated)

    expect(result).not.toHaveProperty('secretRef')
    expect(result).not.toHaveProperty('apiKey')
    expect(result).not.toHaveProperty('adapterMetadata')
  })

  it.each([
    [
      'update',
      () =>
        new UpdateProvider(
          new FakeRepository([]),
          new FakeVault([]),
          new FakeCleanupReporter(),
          clock,
        ).execute({ requestId: REQUEST_ID, id: ID, provider: deepSeekDraft() }),
    ],
    [
      'delete',
      () =>
        new DeleteProvider(
          new FakeRepository([]),
          new FakeVault([]),
          new FakeCleanupReporter(),
        ).execute({ requestId: REQUEST_ID, id: ID }),
    ],
    [
      'activate',
      () =>
        new ActivateProvider(new FakeRepository([]), clock).execute({
          requestId: REQUEST_ID,
          id: ID,
        }),
    ],
  ] as const)('returns a stable not-found error from %s', async (_name, run) => {
    await expectStableError(run(), 'PROVIDER_NOT_FOUND')
  })

  it('rejects activation when a Mock becomes an unkeyed cloud provider after the initial read', async () => {
    const mock = storedProvider({ providerType: 'mock' })
    const repository = new FakeRepository([], [mock])
    repository.beforeActivate = () => {
      repository.rows.set(ID, storedProvider({ updatedAt: NOW }))
    }

    await expectStableError(
      new ActivateProvider(repository, clock).execute({ requestId: REQUEST_ID, id: ID }),
      'PROVIDER_VALIDATION_FAILED',
    )
    expect(repository.rows.get(ID)?.isActive).toBe(false)
  })

  it('returns not found when the provider is deleted after the activation read', async () => {
    const repository = new FakeRepository([], [storedProvider({ secretRef: 'key-ref' })])
    repository.beforeActivate = () => {
      repository.rows.delete(ID)
    }

    await expectStableError(
      new ActivateProvider(repository, clock).execute({ requestId: REQUEST_ID, id: ID }),
      'PROVIDER_NOT_FOUND',
    )
  })

  it('replays activation without applying it again', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events, [storedProvider({ secretRef: 'key-ref' })])
    let tick = 0
    const changingClock: ClockPort = {
      now: () => `2026-07-10T08:00:0${tick++}.000Z`,
    }
    const activate = new ActivateProvider(repository, changingClock)
    const request = { requestId: REQUEST_ID, id: ID }

    const first = await activate.execute(request)
    const second = await activate.execute(request)

    expect(second).toEqual(first)
    expect(events).toEqual(['repository.activate'])
    expect(repository.rows.get(ID)?.updatedAt).toBe(first.updatedAt)
  })

  it('recovers committed activation after an ambiguous repository exception', async () => {
    const repository = new FakeRepository([], [storedProvider({ secretRef: 'key-ref' })])
    repository.commitActivateThenThrow = true

    const result = await new ActivateProvider(repository, clock).execute({
      requestId: REQUEST_ID,
      id: ID,
    })

    expect(result).toMatchObject({ id: ID, isActive: true, hasApiKey: true })
    expect(repository.rows.get(ID)?.isActive).toBe(true)
  })

  it('canonicalizes typed activation adapter failures as safe database errors', async () => {
    const repository = new FakeRepository([], [storedProvider({ secretRef: 'key-ref' })])
    repository.activateFailure = new ProviderUseCaseError(
      'SECRET_WRITE_FAILED',
      'unsafe adapter path with api-key',
      true,
      { fieldName: 'api-key' },
    )

    const error = await expectStableError(
      new ActivateProvider(repository, clock).execute({ requestId: REQUEST_ID, id: ID }),
      'DATABASE_UNAVAILABLE',
    )

    expect(error.message).toBe('Provider storage is temporarily unavailable.')
    expect(error.details).toBeUndefined()
    expect(JSON.stringify(error)).not.toContain('api-key')
  })

  it.each([
    ['stale', 'PROVIDER_VALIDATION_FAILED'],
    ['not_found', 'PROVIDER_NOT_FOUND'],
    ['credential_missing', 'PROVIDER_VALIDATION_FAILED'],
  ] as const)('maps atomic activation %s safely', async (status, code) => {
    const repository = new FakeRepository([], [storedProvider({ secretRef: 'key-ref' })])
    repository.activateResult = status
    await expectStableError(
      new ActivateProvider(repository, clock).execute({ requestId: REQUEST_ID, id: ID }),
      code,
    )
  })

  it('rejects a request ID reused for another operation before side effects', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events, [storedProvider({ secretRef: 'old-ref' })])
    repository.outcomes.set(REQUEST_ID, {
      operation: 'activate',
      provider: storedProvider({ secretRef: 'old-ref', isActive: true }),
    })
    const vault = new FakeVault(events)

    await expectStableError(
      new UpdateProvider(repository, vault, new FakeCleanupReporter(), clock).execute({
        requestId: REQUEST_ID,
        id: ID,
        provider: deepSeekDraft('new-key'),
      }),
      'PROVIDER_VALIDATION_FAILED',
    )

    expect(events).toEqual([])
    expect(vault.secrets.size).toBe(0)
  })
})
