import { z } from 'zod'

export const appErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'INTERNAL_ERROR',
  'IPC_RESPONSE_INVALID',
])

export type AppErrorCode = z.infer<typeof appErrorCodeSchema>

export const appErrorSchema = z.object({
  code: appErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
})

export type AppError = z.infer<typeof appErrorSchema>

export type AppResult<T> =
  { ok: true; data: T; requestId: string } | { ok: false; error: AppError; requestId: string }

export const createAppResultSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.discriminatedUnion('ok', [
    z.object({
      ok: z.literal(true),
      data: dataSchema,
      requestId: z.string().min(1),
    }),
    z.object({
      ok: z.literal(false),
      error: appErrorSchema,
      requestId: z.string().min(1),
    }),
  ])
