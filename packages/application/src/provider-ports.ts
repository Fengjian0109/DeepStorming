import type { ProviderProfile, ProviderTestStatus } from '@deepstorming/domain'

export type StoredProvider = Omit<ProviderProfile, 'hasApiKey'> & { readonly secretRef?: string }

export interface ProviderRepositoryPort {
  list(): Promise<readonly StoredProvider[]>
  findById(id: string): Promise<StoredProvider | undefined>
  create(provider: StoredProvider): Promise<void>
  update(provider: StoredProvider): Promise<void>
  remove(id: string): Promise<StoredProvider | undefined>
  activate(id: string, updatedAt: string): Promise<StoredProvider>
  updateTestStatus(
    id: string,
    status: ProviderTestStatus,
    testedAt: string,
  ): Promise<StoredProvider>
  referencedSecretRefs(): Promise<ReadonlySet<string>>
  hasBlockingReferences(id: string): Promise<boolean>
}

export interface SecretVaultPort {
  put(secret: string): Promise<string>
  get(ref: string): Promise<string>
  remove(ref: string): Promise<void>
  reconcile(referencedRefs: ReadonlySet<string>): Promise<void>
}

export interface ClockPort {
  now(): string
}

export interface IdGeneratorPort {
  generate(): string
}
