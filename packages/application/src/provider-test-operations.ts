import type { ProviderProfile } from '@deepstorming/domain'

import { ProviderUseCaseError } from './provider-errors'
import type {
  CancellationToken,
  ClockPort,
  ProviderGatewayFactoryPort,
  ProviderRepositoryPort,
  ProviderTestStatusTransitionResult,
  SecretVaultPort,
  StoredProvider,
} from './provider-ports'
import { toProviderProfile } from './provider-use-cases'

export type TestProviderConnectionInput = Readonly<{
  requestId: string
  providerId: string
  operationId: string
}>

export type CancelProviderTestInput = Readonly<{ operationId: string }>
export type CancelProviderTestResult = Readonly<{ cancelled: boolean }>

class CancellationSource implements CancellationToken {
  private isCancelled = false
  private readonly listeners = new Set<() => void>()

  public get cancelled(): boolean {
    return this.isCancelled
  }

  public onCancel(listener: () => void): () => void {
    if (this.isCancelled) {
      listener()
      return () => undefined
    }
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  public cancel(): void {
    if (this.isCancelled) return
    this.isCancelled = true
    for (const listener of [...this.listeners]) listener()
  }
}

export class ProviderTestOperations {
  private readonly operations = new Map<string, CancellationSource>()

  public start(operationId: string): CancellationToken {
    if (this.operations.has(operationId)) {
      throw new ProviderUseCaseError(
        'PROVIDER_VALIDATION_FAILED',
        'A provider test with this operation ID is already running.',
        false,
        { operationId },
      )
    }
    const source = new CancellationSource()
    this.operations.set(operationId, source)
    return source
  }

  public cancel(operationId: string): boolean {
    const source = this.operations.get(operationId)
    if (source === undefined) return false
    source.cancel()
    return true
  }

  public complete(operationId: string): void {
    this.operations.delete(operationId)
  }
}

const databaseError = (): ProviderUseCaseError =>
  new ProviderUseCaseError(
    'DATABASE_UNAVAILABLE',
    'Provider storage is temporarily unavailable.',
    true,
  )

const notFoundError = (): ProviderUseCaseError =>
  new ProviderUseCaseError('PROVIDER_NOT_FOUND', 'The provider was not found.', false)

const validationError = (operationId?: string): ProviderUseCaseError =>
  new ProviderUseCaseError(
    'PROVIDER_VALIDATION_FAILED',
    'The provider test request is invalid.',
    false,
    operationId === undefined ? undefined : { operationId },
  )

const cancelledError = (operationId?: string): ProviderUseCaseError =>
  new ProviderUseCaseError(
    'OPERATION_CANCELLED',
    'The provider test was cancelled.',
    false,
    operationId === undefined ? undefined : { operationId },
  )

const secretVaultError = (): ProviderUseCaseError =>
  new ProviderUseCaseError(
    'SECRET_VAULT_UNAVAILABLE',
    'The provider credential could not be read.',
    true,
  )

const safeGatewayError = (error: unknown): ProviderUseCaseError => {
  if (error instanceof ProviderUseCaseError) return error
  return new ProviderUseCaseError(
    'PROVIDER_NETWORK_ERROR',
    'The provider test could not reach the provider.',
    true,
  )
}

const transition = async (
  repository: ProviderRepositoryPort,
  input: {
    operationId: string
    providerId: string
    expectedStatus?: 'testing'
    nextStatus: 'testing' | 'success' | 'error' | 'cancelled'
    testedAt: string
  },
): Promise<ProviderTestStatusTransitionResult> => {
  try {
    return await repository.transitionTestStatus(input)
  } catch {
    throw databaseError()
  }
}

const readProvider = async (
  repository: ProviderRepositoryPort,
  providerId: string,
): Promise<StoredProvider> => {
  try {
    const provider = await repository.findById(providerId)
    if (provider === undefined) throw notFoundError()
    return provider
  } catch (error) {
    if (error instanceof ProviderUseCaseError) throw error
    throw databaseError()
  }
}

const persistTesting = async (
  repository: ProviderRepositoryPort,
  operationId: string,
  providerId: string,
  testedAt: string,
): Promise<ProviderProfile> => {
  const result = await transition(repository, {
    operationId,
    providerId,
    nextStatus: 'testing',
    testedAt,
  })
  if (result.status === 'not_found') throw notFoundError()
  if (result.status !== 'applied') throw validationError(operationId)
  return toProviderProfile(result.provider)
}

const persistTerminal = async (
  repository: ProviderRepositoryPort,
  operationId: string,
  providerId: string,
  nextStatus: 'success' | 'error' | 'cancelled',
  testedAt: string,
): Promise<ProviderProfile> => {
  const result = await transition(repository, {
    operationId,
    providerId,
    expectedStatus: 'testing',
    nextStatus,
    testedAt,
  })
  if (result.status === 'not_found') throw notFoundError()
  if (result.status === 'stale') throw cancelledError(operationId)
  return toProviderProfile(result.provider)
}

const readApiKey = async (vault: SecretVaultPort, provider: StoredProvider): Promise<string> => {
  if (provider.secretRef === undefined) throw validationError()
  try {
    return await vault.get(provider.secretRef)
  } catch {
    throw secretVaultError()
  }
}

export class TestProviderConnection {
  public constructor(
    private readonly repository: ProviderRepositoryPort,
    private readonly vault: SecretVaultPort,
    private readonly gatewayFactory: ProviderGatewayFactoryPort,
    private readonly clock: ClockPort,
    private readonly operations: ProviderTestOperations,
  ) {}

  public async execute(input: TestProviderConnectionInput): Promise<ProviderProfile> {
    const token = this.operations.start(input.operationId)
    try {
      const stored = await readProvider(this.repository, input.providerId)
      await persistTesting(this.repository, input.operationId, input.providerId, this.clock.now())
      const apiKey =
        stored.providerType === 'mock' ? undefined : await readApiKey(this.vault, stored)
      if (token.cancelled) {
        await persistTerminal(
          this.repository,
          input.operationId,
          input.providerId,
          'cancelled',
          this.clock.now(),
        )
        throw cancelledError(input.operationId)
      }
      const gateway = this.gatewayFactory.create(toProviderProfile(stored))
      try {
        await gateway.testConnection(
          apiKey === undefined
            ? { modelName: stored.modelName }
            : { modelName: stored.modelName, apiKey },
          token,
        )
      } catch (error) {
        const safeError = token.cancelled
          ? cancelledError(input.operationId)
          : safeGatewayError(error)
        await persistTerminal(
          this.repository,
          input.operationId,
          input.providerId,
          safeError.code === 'OPERATION_CANCELLED' ? 'cancelled' : 'error',
          this.clock.now(),
        )
        throw safeError
      }
      if (token.cancelled) {
        await persistTerminal(
          this.repository,
          input.operationId,
          input.providerId,
          'cancelled',
          this.clock.now(),
        )
        throw cancelledError(input.operationId)
      }
      return await persistTerminal(
        this.repository,
        input.operationId,
        input.providerId,
        'success',
        this.clock.now(),
      )
    } finally {
      this.operations.complete(input.operationId)
    }
  }
}

export class CancelProviderTest {
  public constructor(private readonly operations: ProviderTestOperations) {}

  public async execute(input: CancelProviderTestInput): Promise<CancelProviderTestResult> {
    return { cancelled: this.operations.cancel(input.operationId) }
  }
}
