import type { ProviderProfile, ProviderTestStatus } from '@deepstorming/domain'

export type StoredProvider = Omit<ProviderProfile, 'hasApiKey'> & { readonly secretRef?: string }

export type ProviderWriteOperation = 'create' | 'update' | 'delete' | 'activate' | 'test_connection'

export type ProviderMutationResult =
  | Readonly<{ status: 'applied' | 'replayed'; provider: StoredProvider }>
  | Readonly<{ status: 'conflict'; existingOperation: ProviderWriteOperation }>

export type ProviderRemoveLogicalOutcome =
  | Readonly<{ status: 'removed'; provider: StoredProvider }>
  | Readonly<{ status: 'blocked' }>
  | Readonly<{ status: 'not_found' }>

export type ProviderRemoveResult =
  | Readonly<{
      status: 'removed'
      provider: StoredProvider
      mutation: 'applied' | 'replayed'
    }>
  | Readonly<{ status: 'blocked' }>
  | Readonly<{ status: 'not_found' }>
  | Readonly<{ status: 'conflict'; existingOperation: ProviderWriteOperation }>

export type ProviderWriteOutcome =
  | Readonly<{
      operation: Exclude<ProviderWriteOperation, 'delete'>
      provider: StoredProvider
    }>
  | Readonly<{
      operation: 'delete'
      outcome: ProviderRemoveLogicalOutcome
    }>

export interface ProviderRepositoryPort {
  list(): Promise<readonly StoredProvider[]>
  findById(id: string): Promise<StoredProvider | undefined>
  findWriteOutcome(requestId: string): Promise<ProviderWriteOutcome | undefined>
  create(requestId: string, provider: StoredProvider): Promise<ProviderMutationResult>
  update(requestId: string, provider: StoredProvider): Promise<ProviderMutationResult>
  removeIfUnreferenced(requestId: string, id: string): Promise<ProviderRemoveResult>
  activate(requestId: string, id: string, updatedAt: string): Promise<ProviderMutationResult>
  updateTestStatus(
    requestId: string,
    id: string,
    status: ProviderTestStatus,
    testedAt: string,
  ): Promise<ProviderMutationResult>
  referencedSecretRefs(): Promise<ReadonlySet<string>>
}

export interface SecretVaultPort {
  put(secret: string): Promise<string>
  get(ref: string): Promise<string>
  remove(ref: string): Promise<void>
  reconcile(referencedRefs: ReadonlySet<string>): Promise<void>
}

export interface SecretCleanupReporterPort {
  /** Implementations must not throw and must never receive raw secrets or caught errors. */
  reportFailure(
    failure: Readonly<{
      secretRef: string
      code: 'SECRET_DELETE_FAILED'
    }>,
  ): void
}

export interface ClockPort {
  now(): string
}

export interface IdGeneratorPort {
  generate(): string
}
