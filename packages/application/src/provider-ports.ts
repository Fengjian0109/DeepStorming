import type { ProviderProfile, ProviderTestStatus } from '@deepstorming/domain'
export type { ClockPort, IdGeneratorPort } from './document-ports'

export type StoredProvider = Omit<ProviderProfile, 'hasApiKey'> & {
  readonly revision: number
  readonly secretRef?: string
}

export type ProviderWriteOperation = 'create' | 'update' | 'delete' | 'activate'

export type ProviderMutationResult =
  | Readonly<{ status: 'applied' | 'replayed'; provider: StoredProvider }>
  | Readonly<{ status: 'conflict'; existingOperation: ProviderWriteOperation }>

export type ProviderUpdateResult =
  ProviderMutationResult | Readonly<{ status: 'stale' }> | Readonly<{ status: 'not_found' }>

export type ProviderActivateResult =
  | ProviderMutationResult
  | Readonly<{ status: 'stale' }>
  | Readonly<{ status: 'not_found' }>
  | Readonly<{ status: 'credential_missing' }>

export type ProviderTestStatusTransitionResult =
  | Readonly<{ status: 'applied' | 'replayed'; provider: StoredProvider }>
  | Readonly<{ status: 'stale' }>
  | Readonly<{ status: 'not_found' }>

export type ProviderRemoveLogicalOutcome =
  | Readonly<{ status: 'removed'; provider: StoredProvider }>
  | Readonly<{ status: 'blocked'; providerId: string }>
  | Readonly<{ status: 'not_found'; providerId: string }>

export type ProviderRemoveResult =
  | Readonly<{
      status: 'removed'
      provider: StoredProvider
      mutation: 'applied' | 'replayed'
    }>
  | Readonly<{ status: 'blocked'; providerId: string }>
  | Readonly<{ status: 'not_found'; providerId: string }>
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
  update(
    requestId: string,
    expectedRevision: number,
    provider: StoredProvider,
  ): Promise<ProviderUpdateResult>
  removeIfUnreferenced(requestId: string, id: string): Promise<ProviderRemoveResult>
  activate(
    requestId: string,
    id: string,
    expectedRevision: number,
    updatedAt: string,
  ): Promise<ProviderActivateResult>
  transitionTestStatus(
    transition: Readonly<{
      operationId: string
      providerId: string
      expectedStatus?: ProviderTestStatus
      nextStatus: ProviderTestStatus
      testedAt: string
    }>,
  ): Promise<ProviderTestStatusTransitionResult>
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

export interface CancellationToken {
  readonly cancelled: boolean
  onCancel(listener: () => void): () => void
}

export interface ProviderGatewayPort {
  testConnection(
    input: Readonly<{ modelName: string; apiKey?: string }>,
    token: CancellationToken,
  ): Promise<void>
  generateLessonTutorFirstQuestion(
    input: Readonly<{
      modelName: string
      apiKey?: string
      documentTitle: string
      sourceSnippet: string
      contextChunks: readonly Readonly<{
        chunkId: string
        text: string
        pageNumberStart: number
        pageNumberEnd: number
        charCount: number
      }>[]
    }>,
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>>
  generateLessonTutorReply(
    input: Readonly<{
      modelName: string
      apiKey?: string
      documentTitle: string
      sourceSnippet: string
      contextChunks: readonly Readonly<{
        chunkId: string
        text: string
        pageNumberStart: number
        pageNumberEnd: number
        charCount: number
      }>[]
      learnerReply: string
    }>,
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>>
}

export interface ProviderGatewayFactoryPort {
  create(provider: ProviderProfile): ProviderGatewayPort
}
