import { describe, expect, it, vi } from 'vitest'

import type { ProviderProfile, ProviderTestStatus } from '@deepstorming/domain'

import { ProviderUseCaseError } from './provider-errors'
import type {
  CancellationToken,
  ClockPort,
  ProviderGatewayFactoryPort,
  ProviderGatewayPort,
  ProviderRepositoryPort,
  ProviderTestStatusTransitionResult,
  SecretVaultPort,
  StoredProvider,
} from './provider-ports'
import {
  CancelProviderTest,
  ProviderTestOperations,
  TestProviderConnection,
} from './provider-test-operations'

const NOW = '2026-07-11T00:00:00.000Z'
const LATER = '2026-07-11T00:00:01.000Z'

const storedProvider = (overrides: Partial<StoredProvider> = {}): StoredProvider => ({
  id: 'provider-1',
  providerType: 'deepseek',
  displayName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
  secretRef: 'secret-ref',
  capabilities: {
    streaming: true,
    structuredOutput: true,
    embedding: false,
    vision: false,
  },
  isActive: false,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  revision: 1,
  ...overrides,
})

const mockStoredProvider = (): StoredProvider => {
  const provider = storedProvider({
    providerType: 'mock',
    modelName: 'mock-success',
  })
  return {
    id: provider.id,
    providerType: provider.providerType,
    displayName: provider.displayName,
    modelName: provider.modelName,
    capabilities: provider.capabilities,
    isActive: provider.isActive,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    revision: provider.revision,
  }
}

class FakeClock implements ClockPort {
  private readonly values = [NOW, LATER]

  public now(): string {
    return this.values.shift() ?? LATER
  }
}

class FakeRepository implements ProviderRepositoryPort {
  public readonly rows = new Map<string, StoredProvider>()
  public readonly transitions: Array<{
    readonly operationId: string
    readonly providerId: string
    readonly expectedStatus?: ProviderTestStatus
    readonly nextStatus: ProviderTestStatus
    readonly testedAt: string
  }> = []
  public staleTerminal = false

  public constructor(providers: readonly StoredProvider[] = [storedProvider()]) {
    for (const provider of providers) this.rows.set(provider.id, provider)
  }

  public async list(): Promise<readonly StoredProvider[]> {
    return [...this.rows.values()]
  }

  public async findById(id: string): Promise<StoredProvider | undefined> {
    return this.rows.get(id)
  }

  public async findWriteOutcome(): Promise<undefined> {
    return undefined
  }

  public async create(): Promise<never> {
    throw new Error('not used')
  }

  public async update(): Promise<never> {
    throw new Error('not used')
  }

  public async removeIfUnreferenced(): Promise<never> {
    throw new Error('not used')
  }

  public async activate(): Promise<never> {
    throw new Error('not used')
  }

  public async transitionTestStatus(transition: {
    operationId: string
    providerId: string
    expectedStatus?: ProviderTestStatus
    nextStatus: ProviderTestStatus
    testedAt: string
  }): Promise<ProviderTestStatusTransitionResult> {
    this.transitions.push(transition)
    const provider = this.rows.get(transition.providerId)
    if (provider === undefined) return { status: 'not_found' }
    if (this.staleTerminal && transition.nextStatus !== 'testing') return { status: 'stale' }
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
      revision: provider.revision + 1,
    }
    this.rows.set(provider.id, updated)
    return { status: 'applied', provider: updated }
  }

  public async referencedSecretRefs(): Promise<ReadonlySet<string>> {
    return new Set()
  }
}

class FakeVault implements SecretVaultPort {
  public readonly get = vi.fn(async () => 'api-key')

  public async put(): Promise<never> {
    throw new Error('not used')
  }

  public async remove(): Promise<never> {
    throw new Error('not used')
  }

  public async reconcile(): Promise<void> {}
}

class CapturingGateway implements ProviderGatewayPort {
  public readonly calls: Array<{
    readonly input: { readonly modelName: string; readonly apiKey?: string }
    readonly token: CancellationToken
  }> = []
  public failWith?: unknown
  public block = false
  public unblock?: () => void

  public async testConnection(
    input: { modelName: string; apiKey?: string },
    token: CancellationToken,
  ): Promise<void> {
    this.calls.push({ input, token })
    if (this.failWith !== undefined) throw this.failWith
    if (!this.block) return
    await new Promise<void>((resolve, reject) => {
      this.unblock = resolve
      token.onCancel(() =>
        reject(new ProviderUseCaseError('OPERATION_CANCELLED', 'Cancelled.', false)),
      )
    })
  }

  public async generateLessonTutorReply(
    input: {
      modelName: string
      apiKey?: string
      documentTitle: string
      sourceSnippet: string
      learnerReply: string
    },
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>> {
    this.calls.push({
      input:
        input.apiKey === undefined
          ? { modelName: input.modelName }
          : { modelName: input.modelName, apiKey: input.apiKey },
      token,
    })
    return { content: '追问' }
  }
}

class FakeGatewayFactory implements ProviderGatewayFactoryPort {
  public readonly gateway = new CapturingGateway()
  public readonly providers: ProviderProfile[] = []

  public create(provider: ProviderProfile): ProviderGatewayPort {
    this.providers.push(provider)
    return this.gateway
  }
}

const createSubject = (repository = new FakeRepository()) => {
  const vault = new FakeVault()
  const factory = new FakeGatewayFactory()
  const operations = new ProviderTestOperations()
  return {
    repository,
    vault,
    factory,
    operations,
    test: new TestProviderConnection(repository, vault, factory, new FakeClock(), operations),
    cancel: new CancelProviderTest(operations),
  }
}

describe('TestProviderConnection', () => {
  it('persists testing before vault reads and external gateway work, then persists success', async () => {
    const subject = createSubject()

    const profile = await subject.test.execute({
      requestId: 'request-1',
      providerId: 'provider-1',
      operationId: 'operation-1',
    })

    expect(subject.repository.transitions.map((transition) => transition.nextStatus)).toEqual([
      'testing',
      'success',
    ])
    expect(subject.repository.transitions[0]?.testedAt).toBe(NOW)
    expect(subject.vault.get).toHaveBeenCalledWith('secret-ref')
    expect(subject.factory.gateway.calls).toEqual([
      {
        input: { modelName: 'deepseek-chat', apiKey: 'api-key' },
        token: expect.objectContaining({ cancelled: false }),
      },
    ])
    expect(profile.lastTestStatus).toBe('success')
    expect(profile.hasApiKey).toBe(true)
  })

  it('does not read the vault for mock providers and omits apiKey from gateway input', async () => {
    const subject = createSubject(new FakeRepository([mockStoredProvider()]))

    await subject.test.execute({
      requestId: 'request-1',
      providerId: 'provider-1',
      operationId: 'operation-1',
    })

    expect(subject.vault.get).not.toHaveBeenCalled()
    expect(subject.factory.gateway.calls[0]?.input).toEqual({ modelName: 'mock-success' })
  })

  it('persists error when the gateway raises a provider-safe failure', async () => {
    const subject = createSubject()
    subject.factory.gateway.failWith = new ProviderUseCaseError(
      'PROVIDER_AUTH_FAILED',
      'Authentication failed.',
      false,
      { statusCode: 401 },
    )

    await expect(
      subject.test.execute({
        requestId: 'request-1',
        providerId: 'provider-1',
        operationId: 'operation-1',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_AUTH_FAILED' })

    expect(subject.repository.transitions.map((transition) => transition.nextStatus)).toEqual([
      'testing',
      'error',
    ])
  })

  it('persists error when cloud credential lookup fails after testing starts', async () => {
    const subject = createSubject()
    subject.vault.get.mockRejectedValueOnce(new Error('safe-storage unavailable'))

    await expect(
      subject.test.execute({
        requestId: 'request-1',
        providerId: 'provider-1',
        operationId: 'operation-1',
      }),
    ).rejects.toMatchObject({ code: 'SECRET_VAULT_UNAVAILABLE' })

    expect(subject.repository.transitions.map((transition) => transition.nextStatus)).toEqual([
      'testing',
      'error',
    ])
    expect(subject.factory.gateway.calls).toEqual([])
  })

  it('fails duplicate active operation IDs without starting duplicate external work', async () => {
    const subject = createSubject()
    subject.factory.gateway.block = true
    const first = subject.test.execute({
      requestId: 'request-1',
      providerId: 'provider-1',
      operationId: 'operation-1',
    })

    await vi.waitFor(() => expect(subject.factory.gateway.calls).toHaveLength(1))
    await expect(
      subject.test.execute({
        requestId: 'request-2',
        providerId: 'provider-1',
        operationId: 'operation-1',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_VALIDATION_FAILED' })

    expect(subject.factory.gateway.calls).toHaveLength(1)
    subject.factory.gateway.unblock?.()
    await first
  })

  it('cancels idempotently, persists cancelled, raises OPERATION_CANCELLED, and removes registry entries', async () => {
    const subject = createSubject()
    subject.factory.gateway.block = true
    const running = subject.test.execute({
      requestId: 'request-1',
      providerId: 'provider-1',
      operationId: 'operation-1',
    })
    await vi.waitFor(() => expect(subject.factory.gateway.calls).toHaveLength(1))

    expect(await subject.cancel.execute({ operationId: 'operation-1' })).toEqual({
      cancelled: true,
    })
    expect(await subject.cancel.execute({ operationId: 'operation-1' })).toEqual({
      cancelled: true,
    })
    await expect(running).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
    expect(subject.repository.transitions.map((transition) => transition.nextStatus)).toEqual([
      'testing',
      'cancelled',
    ])
    expect(await subject.cancel.execute({ operationId: 'operation-1' })).toEqual({
      cancelled: false,
    })
  })

  it('preserves cancellation when a terminal success transition loses the race', async () => {
    const subject = createSubject()
    subject.repository.staleTerminal = true

    await expect(
      subject.test.execute({
        requestId: 'request-1',
        providerId: 'provider-1',
        operationId: 'operation-1',
      }),
    ).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })

    expect(subject.repository.transitions.map((transition) => transition.nextStatus)).toEqual([
      'testing',
      'success',
    ])
  })
})
