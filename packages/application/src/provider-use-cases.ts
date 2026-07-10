import {
  assertProviderHasCredential,
  capabilitiesFor,
  normalizeProviderDraft,
  type ProviderDraft,
  type ProviderProfile,
} from '@deepstorming/domain'

import { ProviderUseCaseError } from './provider-errors'
import type {
  ClockPort,
  IdGeneratorPort,
  ProviderMutationResult,
  ProviderRemoveLogicalOutcome,
  ProviderRepositoryPort,
  ProviderWriteOutcome,
  SecretCleanupReporterPort,
  SecretVaultPort,
  StoredProvider,
} from './provider-ports'

export type CreateProviderInput = Readonly<{ requestId: string; provider: ProviderDraft }>
export type UpdateProviderInput = Readonly<{
  requestId: string
  id: string
  provider: ProviderDraft
}>
export type ProviderIdWriteInput = Readonly<{ requestId: string; id: string }>

const databaseError = (): ProviderUseCaseError =>
  new ProviderUseCaseError(
    'DATABASE_UNAVAILABLE',
    'Provider storage is temporarily unavailable.',
    true,
  )

const secretWriteError = (): ProviderUseCaseError =>
  new ProviderUseCaseError(
    'SECRET_WRITE_FAILED',
    'The provider credential could not be saved.',
    true,
  )

const secretDeleteError = (): ProviderUseCaseError =>
  new ProviderUseCaseError(
    'SECRET_DELETE_FAILED',
    'The provider credential could not be removed.',
    false,
  )

const validationError = (): ProviderUseCaseError =>
  new ProviderUseCaseError(
    'PROVIDER_VALIDATION_FAILED',
    'The provider configuration is invalid.',
    false,
  )

const notFoundError = (): ProviderUseCaseError =>
  new ProviderUseCaseError('PROVIDER_NOT_FOUND', 'The provider was not found.', false)

const internalError = (): ProviderUseCaseError =>
  new ProviderUseCaseError(
    'INTERNAL_ERROR',
    'The provider operation could not be completed.',
    false,
  )

const findProvider = async (
  repository: ProviderRepositoryPort,
  id: string,
): Promise<StoredProvider> => {
  let provider: StoredProvider | undefined
  try {
    provider = await repository.findById(id)
  } catch {
    throw databaseError()
  }
  if (provider === undefined) throw notFoundError()
  return provider
}

type ReplayFor<Operation extends ProviderWriteOutcome['operation']> = Operation extends 'delete'
  ? Extract<ProviderWriteOutcome, { operation: 'delete' }>
  : Readonly<{ operation: Operation; provider: StoredProvider }>

const findReplay = async <Operation extends ProviderWriteOutcome['operation']>(
  repository: ProviderRepositoryPort,
  requestId: string,
  operation: Operation,
): Promise<ReplayFor<Operation> | undefined> => {
  let outcome: ProviderWriteOutcome | undefined
  try {
    outcome = await repository.findWriteOutcome(requestId)
  } catch {
    throw databaseError()
  }
  if (outcome === undefined) return undefined
  if (outcome.operation !== operation) throw validationError()
  return outcome as ReplayFor<Operation>
}

const normalizeDraft = (draft: ProviderDraft): ProviderDraft => {
  try {
    return normalizeProviderDraft(draft)
  } catch {
    throw validationError()
  }
}

const writeSecret = async (vault: SecretVaultPort, secret: string): Promise<string> => {
  try {
    return await vault.put(secret)
  } catch {
    throw secretWriteError()
  }
}

const removeSecret = async (vault: SecretVaultPort, ref: string): Promise<void> => {
  try {
    await vault.remove(ref)
  } catch {
    throw secretDeleteError()
  }
}

const reportCleanupFailure = (reporter: SecretCleanupReporterPort, secretRef: string): void =>
  reporter.reportFailure({ secretRef, code: 'SECRET_DELETE_FAILED' })

const getTimestamp = (clock: ClockPort): string => {
  try {
    return clock.now()
  } catch {
    throw internalError()
  }
}

const generateId = (ids: IdGeneratorPort): string => {
  try {
    return ids.generate()
  } catch {
    throw internalError()
  }
}

export const toProviderProfile = (provider: StoredProvider): ProviderProfile => ({
  id: provider.id,
  providerType: provider.providerType,
  displayName: provider.displayName,
  ...(provider.baseUrl === undefined ? {} : { baseUrl: provider.baseUrl }),
  modelName: provider.modelName,
  hasApiKey: provider.secretRef !== undefined,
  capabilities: provider.capabilities,
  isActive: provider.isActive,
  ...(provider.lastTestStatus === undefined ? {} : { lastTestStatus: provider.lastTestStatus }),
  ...(provider.lastTestedAt === undefined ? {} : { lastTestedAt: provider.lastTestedAt }),
  createdAt: provider.createdAt,
  updatedAt: provider.updatedAt,
})

export class ListProviders {
  public constructor(private readonly repository: ProviderRepositoryPort) {}

  public async execute(): Promise<readonly ProviderProfile[]> {
    try {
      return (await this.repository.list()).map(toProviderProfile)
    } catch {
      throw databaseError()
    }
  }
}

export class CreateProvider {
  public constructor(
    private readonly repository: ProviderRepositoryPort,
    private readonly vault: SecretVaultPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  public async execute(input: CreateProviderInput): Promise<ProviderProfile> {
    const replay = await findReplay(this.repository, input.requestId, 'create')
    if (replay !== undefined) return toProviderProfile(replay.provider)

    const normalized = normalizeDraft(input.provider)
    const id = generateId(this.ids)
    const now = getTimestamp(this.clock)
    const secretRef =
      normalized.apiKey === undefined ? undefined : await writeSecret(this.vault, normalized.apiKey)
    const provider: StoredProvider = {
      id,
      providerType: normalized.providerType,
      displayName: normalized.displayName,
      ...(normalized.baseUrl === undefined ? {} : { baseUrl: normalized.baseUrl }),
      modelName: normalized.modelName,
      capabilities: capabilitiesFor(normalized.providerType),
      isActive: false,
      createdAt: now,
      updatedAt: now,
      ...(secretRef === undefined ? {} : { secretRef }),
    }

    let result
    try {
      result = await this.repository.create(input.requestId, provider)
    } catch {
      if (secretRef !== undefined) await removeSecret(this.vault, secretRef)
      throw databaseError()
    }
    if (result.status === 'conflict') {
      if (secretRef !== undefined) await removeSecret(this.vault, secretRef)
      throw validationError()
    }
    if (result.status === 'replayed' && secretRef !== undefined) {
      await removeSecret(this.vault, secretRef)
    }
    return toProviderProfile(result.provider)
  }
}

export class UpdateProvider {
  public constructor(
    private readonly repository: ProviderRepositoryPort,
    private readonly vault: SecretVaultPort,
    private readonly cleanupReporter: SecretCleanupReporterPort,
    private readonly clock: ClockPort,
  ) {}

  public async execute(input: UpdateProviderInput): Promise<ProviderProfile> {
    const replay = await findReplay(this.repository, input.requestId, 'update')
    if (replay !== undefined) return toProviderProfile(replay.provider)

    const existing = await findProvider(this.repository, input.id)
    const normalized = normalizeDraft(input.provider)
    const changesIdentity = existing.providerType !== normalized.providerType
    const changesCloudIdentity =
      changesIdentity && existing.providerType !== 'mock' && normalized.providerType !== 'mock'
    if (changesCloudIdentity && normalized.apiKey === undefined) throw validationError()

    const retainedSecretRef =
      normalized.providerType === 'mock' || changesCloudIdentity ? undefined : existing.secretRef
    if (existing.isActive) {
      try {
        assertProviderHasCredential({
          providerType: normalized.providerType,
          hasExistingKey: retainedSecretRef !== undefined,
          ...(normalized.apiKey === undefined ? {} : { apiKey: normalized.apiKey }),
        })
      } catch {
        throw validationError()
      }
    }

    const updatedAt = getTimestamp(this.clock)
    const newSecretRef =
      normalized.apiKey === undefined ? undefined : await writeSecret(this.vault, normalized.apiKey)
    const secretRef = newSecretRef ?? retainedSecretRef
    const invalidatesTest =
      existing.providerType !== normalized.providerType ||
      existing.baseUrl !== normalized.baseUrl ||
      existing.modelName !== normalized.modelName ||
      existing.secretRef !== secretRef
    const updated: StoredProvider = {
      id: existing.id,
      providerType: normalized.providerType,
      displayName: normalized.displayName,
      ...(normalized.baseUrl === undefined ? {} : { baseUrl: normalized.baseUrl }),
      modelName: normalized.modelName,
      capabilities: capabilitiesFor(normalized.providerType),
      isActive: existing.isActive,
      ...(!invalidatesTest && existing.lastTestStatus !== undefined
        ? { lastTestStatus: existing.lastTestStatus }
        : {}),
      ...(!invalidatesTest && existing.lastTestedAt !== undefined
        ? { lastTestedAt: existing.lastTestedAt }
        : {}),
      createdAt: existing.createdAt,
      updatedAt,
      ...(secretRef === undefined ? {} : { secretRef }),
    }

    let result
    try {
      result = await this.repository.update(input.requestId, updated)
    } catch {
      if (newSecretRef !== undefined) await removeSecret(this.vault, newSecretRef)
      throw databaseError()
    }

    if (result.status === 'conflict') {
      if (newSecretRef !== undefined) await removeSecret(this.vault, newSecretRef)
      throw validationError()
    }
    if (result.status === 'replayed') {
      if (newSecretRef !== undefined) await removeSecret(this.vault, newSecretRef)
      return toProviderProfile(result.provider)
    }
    if (existing.secretRef !== undefined && existing.secretRef !== result.provider.secretRef) {
      try {
        await this.vault.remove(existing.secretRef)
      } catch {
        reportCleanupFailure(this.cleanupReporter, existing.secretRef)
      }
    }
    return toProviderProfile(result.provider)
  }
}

const mapRemoveOutcome = (outcome: ProviderRemoveLogicalOutcome): void => {
  if (outcome.status === 'blocked') throw validationError()
  if (outcome.status === 'not_found') throw notFoundError()
}

export class DeleteProvider {
  public constructor(
    private readonly repository: ProviderRepositoryPort,
    private readonly vault: SecretVaultPort,
    private readonly cleanupReporter: SecretCleanupReporterPort,
  ) {}

  public async execute(input: ProviderIdWriteInput): Promise<void> {
    const replay = await findReplay(this.repository, input.requestId, 'delete')
    if (replay !== undefined) {
      mapRemoveOutcome(replay.outcome)
      return
    }

    let result
    try {
      result = await this.repository.removeIfUnreferenced(input.requestId, input.id)
    } catch {
      throw databaseError()
    }
    if (result.status === 'conflict') throw validationError()
    mapRemoveOutcome(result)
    if (
      result.status !== 'removed' ||
      result.mutation === 'replayed' ||
      result.provider.secretRef === undefined
    ) {
      return
    }
    try {
      await this.vault.remove(result.provider.secretRef)
    } catch {
      reportCleanupFailure(this.cleanupReporter, result.provider.secretRef)
    }
  }
}

export class ActivateProvider {
  public constructor(
    private readonly repository: ProviderRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  public async execute(input: ProviderIdWriteInput): Promise<ProviderProfile> {
    const replay = await findReplay(this.repository, input.requestId, 'activate')
    if (replay !== undefined) return toProviderProfile(replay.provider)

    const existing = await findProvider(this.repository, input.id)
    try {
      assertProviderHasCredential({
        providerType: existing.providerType,
        hasExistingKey: existing.secretRef !== undefined,
      })
    } catch {
      throw validationError()
    }

    const updatedAt = getTimestamp(this.clock)
    let result: ProviderMutationResult
    try {
      result = await this.repository.activate(input.requestId, input.id, updatedAt)
    } catch {
      throw databaseError()
    }
    if (result.status === 'conflict') throw validationError()
    return toProviderProfile(result.provider)
  }
}
