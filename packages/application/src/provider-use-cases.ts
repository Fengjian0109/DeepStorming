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
  ProviderRepositoryPort,
  SecretVaultPort,
  StoredProvider,
} from './provider-ports'

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

const secretVaultError = (): ProviderUseCaseError =>
  new ProviderUseCaseError(
    'SECRET_VAULT_UNAVAILABLE',
    'The credential vault is temporarily unavailable.',
    true,
  )

const internalError = (): ProviderUseCaseError =>
  new ProviderUseCaseError(
    'INTERNAL_ERROR',
    'The provider operation could not be completed.',
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

const preserveStableOrMap = (
  error: unknown,
  fallback: () => ProviderUseCaseError,
): ProviderUseCaseError => {
  if (!(error instanceof ProviderUseCaseError)) return fallback()

  switch (error.code) {
    case 'INTERNAL_ERROR':
      return internalError()
    case 'PROVIDER_NOT_FOUND':
      return notFoundError()
    case 'PROVIDER_VALIDATION_FAILED':
      return validationError()
    case 'DATABASE_UNAVAILABLE':
      return databaseError()
    case 'SECRET_VAULT_UNAVAILABLE':
      return secretVaultError()
    case 'SECRET_WRITE_FAILED':
      return secretWriteError()
    case 'SECRET_DELETE_FAILED':
      return secretDeleteError()
  }
}

const getTimestamp = (clock: ClockPort): string => {
  try {
    return clock.now()
  } catch (error) {
    throw preserveStableOrMap(error, internalError)
  }
}

const generateId = (ids: IdGeneratorPort): string => {
  try {
    return ids.generate()
  } catch (error) {
    throw preserveStableOrMap(error, internalError)
  }
}

const findProvider = async (
  repository: ProviderRepositoryPort,
  id: string,
): Promise<StoredProvider> => {
  let provider: StoredProvider | undefined
  try {
    provider = await repository.findById(id)
  } catch (error) {
    throw preserveStableOrMap(error, databaseError)
  }

  if (provider === undefined) throw notFoundError()
  return provider
}

const normalizeDraft = (draft: ProviderDraft): ProviderDraft => {
  try {
    return normalizeProviderDraft(draft)
  } catch (error) {
    throw preserveStableOrMap(error, validationError)
  }
}

const writeSecret = async (vault: SecretVaultPort, secret: string): Promise<string> => {
  try {
    return await vault.put(secret)
  } catch (error) {
    throw preserveStableOrMap(error, secretWriteError)
  }
}

const removeSecret = async (vault: SecretVaultPort, ref: string): Promise<void> => {
  try {
    await vault.remove(ref)
  } catch (error) {
    throw preserveStableOrMap(error, secretDeleteError)
  }
}

export const toProviderProfile = ({ secretRef, ...provider }: StoredProvider): ProviderProfile => ({
  ...provider,
  hasApiKey: secretRef !== undefined,
})

export class ListProviders {
  public constructor(private readonly repository: ProviderRepositoryPort) {}

  public async execute(): Promise<readonly ProviderProfile[]> {
    try {
      return (await this.repository.list()).map(toProviderProfile)
    } catch (error) {
      throw preserveStableOrMap(error, databaseError)
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

  public async execute(draft: ProviderDraft): Promise<ProviderProfile> {
    const normalized = normalizeDraft(draft)
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

    try {
      await this.repository.create(provider)
    } catch (error) {
      const repositoryError = preserveStableOrMap(error, databaseError)
      if (secretRef !== undefined) await removeSecret(this.vault, secretRef)
      throw repositoryError
    }

    return toProviderProfile(provider)
  }
}

export class UpdateProvider {
  public constructor(
    private readonly repository: ProviderRepositoryPort,
    private readonly vault: SecretVaultPort,
    private readonly clock: ClockPort,
  ) {}

  public async execute(id: string, draft: ProviderDraft): Promise<ProviderProfile> {
    const existing = await findProvider(this.repository, id)
    const normalized = normalizeDraft(draft)
    if (existing.isActive) {
      try {
        assertProviderHasCredential({
          providerType: normalized.providerType,
          hasExistingKey: existing.secretRef !== undefined,
          ...(normalized.apiKey === undefined ? {} : { apiKey: normalized.apiKey }),
        })
      } catch (error) {
        throw preserveStableOrMap(error, validationError)
      }
    }
    const updatedAt = getTimestamp(this.clock)
    const newSecretRef =
      normalized.apiKey === undefined ? undefined : await writeSecret(this.vault, normalized.apiKey)
    const secretRef = newSecretRef ?? existing.secretRef
    const updated: StoredProvider = {
      id: existing.id,
      providerType: normalized.providerType,
      displayName: normalized.displayName,
      ...(normalized.baseUrl === undefined ? {} : { baseUrl: normalized.baseUrl }),
      modelName: normalized.modelName,
      capabilities: capabilitiesFor(normalized.providerType),
      isActive: existing.isActive,
      ...(existing.lastTestStatus === undefined ? {} : { lastTestStatus: existing.lastTestStatus }),
      ...(existing.lastTestedAt === undefined ? {} : { lastTestedAt: existing.lastTestedAt }),
      createdAt: existing.createdAt,
      updatedAt,
      ...(secretRef === undefined ? {} : { secretRef }),
    }

    try {
      await this.repository.update(updated)
    } catch (error) {
      const repositoryError = preserveStableOrMap(error, databaseError)
      if (newSecretRef !== undefined) await removeSecret(this.vault, newSecretRef)
      throw repositoryError
    }

    if (
      newSecretRef !== undefined &&
      existing.secretRef !== undefined &&
      existing.secretRef !== newSecretRef
    ) {
      await removeSecret(this.vault, existing.secretRef)
    }

    return toProviderProfile(updated)
  }
}

export class DeleteProvider {
  public constructor(
    private readonly repository: ProviderRepositoryPort,
    private readonly vault: SecretVaultPort,
  ) {}

  public async execute(id: string): Promise<void> {
    await findProvider(this.repository, id)

    let blocking: boolean
    try {
      blocking = await this.repository.hasBlockingReferences(id)
    } catch (error) {
      throw preserveStableOrMap(error, databaseError)
    }
    if (blocking) throw validationError()

    let removed: StoredProvider | undefined
    try {
      removed = await this.repository.remove(id)
    } catch (error) {
      throw preserveStableOrMap(error, databaseError)
    }
    if (removed === undefined) throw notFoundError()
    if (removed.secretRef !== undefined) await removeSecret(this.vault, removed.secretRef)
  }
}

export class ActivateProvider {
  public constructor(
    private readonly repository: ProviderRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  public async execute(id: string): Promise<ProviderProfile> {
    const existing = await findProvider(this.repository, id)
    try {
      assertProviderHasCredential({
        providerType: existing.providerType,
        hasExistingKey: existing.secretRef !== undefined,
      })
    } catch (error) {
      throw preserveStableOrMap(error, validationError)
    }

    try {
      return toProviderProfile(await this.repository.activate(id, getTimestamp(this.clock)))
    } catch (error) {
      throw preserveStableOrMap(error, databaseError)
    }
  }
}
