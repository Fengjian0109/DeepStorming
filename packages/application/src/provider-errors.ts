export type ProviderUseCaseErrorCode =
  | 'INTERNAL_ERROR'
  | 'PROVIDER_NOT_FOUND'
  | 'PROVIDER_VALIDATION_FAILED'
  | 'DATABASE_UNAVAILABLE'
  | 'DATABASE_MIGRATION_FAILED'
  | 'SECRET_VAULT_UNAVAILABLE'
  | 'SECRET_WRITE_FAILED'
  | 'SECRET_DELETE_FAILED'

export type ProviderErrorDetails = Readonly<{
  issueCount?: number
  statusCode?: number
  fieldName?: string
  operationId?: string
}>

export class ProviderUseCaseError extends Error {
  public override readonly name = 'ProviderUseCaseError'

  public constructor(
    public readonly code: ProviderUseCaseErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly details?: ProviderErrorDetails,
  ) {
    super(message)
  }
}
