import { describe, expect, it } from 'vitest'

import type { ProviderDraft, ProviderProfile, ProviderTestStatus } from '@deepstorming/domain'

import { ProviderUseCaseError } from './provider-errors'
import type {
  ClockPort,
  IdGeneratorPort,
  ProviderRepositoryPort,
  SecretVaultPort,
  StoredProvider,
} from './provider-ports'
import {
  ActivateProvider,
  CreateProvider,
  DeleteProvider,
  ListProviders,
  UpdateProvider,
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
  public failCreate = false
  public failUpdate = false
  public createFailure?: unknown
  public blocking = false

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

  public async create(provider: StoredProvider): Promise<void> {
    this.events.push('repository.create')
    if (this.createFailure !== undefined) throw this.createFailure
    if (this.failCreate) throw new Error('sqlite path and secret must not escape')
    this.rows.set(provider.id, provider)
  }

  public async update(provider: StoredProvider): Promise<void> {
    this.events.push('repository.update')
    if (this.failUpdate) throw new Error('sqlite path and secret must not escape')
    this.rows.set(provider.id, provider)
  }

  public async remove(id: string): Promise<StoredProvider | undefined> {
    this.events.push('repository.remove')
    const provider = this.rows.get(id)
    this.rows.delete(id)
    return provider
  }

  public async activate(id: string, updatedAt: string): Promise<StoredProvider> {
    const selected = this.rows.get(id)
    if (selected === undefined) throw new Error('missing row')
    for (const [rowId, provider] of this.rows) {
      this.rows.set(rowId, { ...provider, isActive: rowId === id, updatedAt })
    }
    return this.rows.get(id) as StoredProvider
  }

  public async updateTestStatus(
    id: string,
    status: ProviderTestStatus,
    testedAt: string,
  ): Promise<StoredProvider> {
    const provider = this.rows.get(id)
    if (provider === undefined) throw new Error('missing row')
    const updated = { ...provider, lastTestStatus: status, lastTestedAt: testedAt }
    this.rows.set(id, updated)
    return updated
  }

  public async referencedSecretRefs(): Promise<ReadonlySet<string>> {
    return new Set(
      [...this.rows.values()].flatMap((provider) =>
        provider.secretRef === undefined ? [] : [provider.secretRef],
      ),
    )
  }

  public async hasBlockingReferences(_id: string): Promise<boolean> {
    return this.blocking
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

    const result = await new CreateProvider(repository, vault, clock, ids).execute(input)

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

  it('removes a newly written secret when repository create fails', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events)
    repository.failCreate = true
    const vault = new FakeVault(events)

    await expectStableError(
      new CreateProvider(repository, vault, clock, ids).execute(deepSeekDraft('api-key')),
      'DATABASE_UNAVAILABLE',
    )

    expect(events).toEqual(['vault.put', 'repository.create', 'vault.remove:secret-1'])
    expect(repository.rows.size).toBe(0)
    expect(vault.secrets.size).toBe(0)
  })

  it('reports a stable secret cleanup error when compensation removal fails', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events)
    repository.failCreate = true
    const vault = new FakeVault(events)
    vault.failRemove = true

    const error = await expectStableError(
      new CreateProvider(repository, vault, clock, ids).execute(deepSeekDraft('api-key')),
      'SECRET_DELETE_FAILED',
    )

    expect(error.retryable).toBe(false)
    expect(events).toEqual(['vault.put', 'repository.create', 'vault.remove:secret-1'])
    expect(vault.secrets.has('secret-1')).toBe(true)
  })

  it('maps validation and Vault write failures without persisting a row', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events)
    const vault = new FakeVault(events)

    await expectStableError(
      new CreateProvider(repository, vault, clock, ids).execute({
        providerType: 'deepseek',
        displayName: ' ',
        modelName: 'chat',
      }),
      'PROVIDER_VALIDATION_FAILED',
    )

    vault.failPut = true
    await expectStableError(
      new CreateProvider(repository, vault, clock, ids).execute(deepSeekDraft('api-key')),
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
      new CreateProvider(repository, new FakeVault([]), clock, ids).execute(deepSeekDraft()),
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
    ).execute(deepSeekDraft('api-key'))

    expect(events).toEqual(['ids.generate', 'clock.now', 'vault.put', 'repository.create'])
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

      const result = await new UpdateProvider(repository, vault, clock).execute(ID, input)

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

    await new UpdateProvider(repository, vault, clock).execute(ID, deepSeekDraft('new-key'))

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
      new UpdateProvider(repository, vault, clock).execute(ID, deepSeekDraft('new-key')),
      'SECRET_WRITE_FAILED',
    )

    expect(events).toEqual(['vault.put'])
    expect(repository.rows.get(ID)).toBe(existing)
    expect(vault.secrets.get('old-ref')).toBe('old-key')
  })

  it('removes the new secret after repository failure while preserving the old row and secret', async () => {
    const events: string[] = []
    const existing = storedProvider({ secretRef: 'old-ref' })
    const repository = new FakeRepository(events, [existing])
    repository.failUpdate = true
    const vault = new FakeVault(events)
    vault.secrets.set('old-ref', 'old-key')

    await expectStableError(
      new UpdateProvider(repository, vault, clock).execute(ID, deepSeekDraft('new-key')),
      'DATABASE_UNAVAILABLE',
    )

    expect(events).toEqual(['vault.put', 'repository.update', 'vault.remove:secret-1'])
    expect(repository.rows.get(ID)).toBe(existing)
    expect(vault.secrets).toEqual(new Map([['old-ref', 'old-key']]))
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
      new UpdateProvider(repository, new FakeVault(events), clock).execute(ID, deepSeekDraft()),
      'PROVIDER_VALIDATION_FAILED',
    )

    expect(events).toEqual([])
    expect(repository.rows.get(ID)).toBe(mock)
  })
})

describe('DeleteProvider', () => {
  it('removes metadata before cleaning up its secret', async () => {
    const events: string[] = []
    const repository = new FakeRepository(events, [storedProvider({ secretRef: 'old-ref' })])
    const vault = new FakeVault(events)
    vault.secrets.set('old-ref', 'old-key')

    await new DeleteProvider(repository, vault).execute(ID)

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
      new DeleteProvider(repository, vault).execute(ID),
      'PROVIDER_VALIDATION_FAILED',
    )

    expect(events).toEqual([])
    expect(repository.rows.get(ID)).toBe(existing)
    expect(vault.secrets.get('old-ref')).toBe('old-key')
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

    await expectStableError(activate.execute(cloud.id), 'PROVIDER_VALIDATION_FAILED')
    expect(repository.rows.get(cloud.id)?.isActive).toBe(false)

    expect(await activate.execute(mock.id)).toMatchObject({ isActive: true, hasApiKey: false })
    expect(await activate.execute(keyed.id)).toMatchObject({ isActive: true, hasApiKey: true })
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

  it.each([
    [
      'update',
      () =>
        new UpdateProvider(new FakeRepository([]), new FakeVault([]), clock).execute(
          ID,
          deepSeekDraft(),
        ),
    ],
    ['delete', () => new DeleteProvider(new FakeRepository([]), new FakeVault([])).execute(ID)],
    ['activate', () => new ActivateProvider(new FakeRepository([]), clock).execute(ID)],
  ] as const)('returns a stable not-found error from %s', async (_name, run) => {
    await expectStableError(run(), 'PROVIDER_NOT_FOUND')
  })
})
