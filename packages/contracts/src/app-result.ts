import { z } from 'zod'

export const appErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'INTERNAL_ERROR',
  'IPC_RESPONSE_INVALID',
  'DATABASE_UNAVAILABLE',
  'DATABASE_MIGRATION_FAILED',
  'PROVIDER_NOT_FOUND',
  'PROVIDER_VALIDATION_FAILED',
  'PROVIDER_AUTH_FAILED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_QUOTA_EXCEEDED',
  'PROVIDER_MODEL_NOT_FOUND',
  'PROVIDER_NETWORK_ERROR',
  'PROVIDER_TIMEOUT',
  'PROVIDER_RESPONSE_INVALID',
  'SECRET_VAULT_UNAVAILABLE',
  'SECRET_WRITE_FAILED',
  'SECRET_DELETE_FAILED',
  'OPERATION_CANCELLED',
  'LEARNING_SETTINGS_INVALID',
  'LEARNING_SETTINGS_NOT_FOUND',
  'SETTINGS_REVISION_CONFLICT',
  'LAST_TUTOR_REQUIRED',
  'AVATAR_IMPORT_FAILED',
  'AI_PROVIDER_REQUIRED',
  'LESSON_TUTOR_NOT_FOUND',
  'AI_GENERATION_FAILED',
])

export type AppErrorCode = z.infer<typeof appErrorCodeSchema>

export const appErrorDetailsSchema = z
  .object({
    issueCount: z.number().int().nonnegative().optional(),
    statusCode: z.number().int().min(100).max(599).optional(),
    fieldName: z.string().min(1).optional(),
    operationId: z.string().uuid().optional(),
  })
  .strict()

export type AppErrorDetails = z.infer<typeof appErrorDetailsSchema>

export const appErrorSchema = z
  .object({
    code: appErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    details: appErrorDetailsSchema.optional(),
  })
  .strict()

export type AppError = z.infer<typeof appErrorSchema>

export type AppResult<T> =
  { ok: true; data: T; requestId: string } | { ok: false; error: AppError; requestId: string }

export const createAppResultSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        data: dataSchema,
        requestId: z.string().min(1),
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        error: appErrorSchema,
        requestId: z.string().min(1),
      })
      .strict(),
  ])
