import { z } from 'zod'
import { appErrorCodeSchema, appErrorDetailsSchema } from './app-result'

export const LESSON_CHANNELS = {
  list: 'lessons:list',
  startFromDocument: 'lessons:start-from-document',
  get: 'lessons:get',
  reply: 'lessons:reply',
  retryRun: 'lessons:retry-run',
  cancelRun: 'lessons:cancel-run',
} as const

const requestIdSchema = z.string().uuid()
const lessonIdSchema = z.string().uuid()
const documentIdSchema = z.string().uuid()
const requiredTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: 'Required text must not be blank',
})
const timestampSchema = z.iso.datetime()

export const lessonSessionStatusSchema = z.enum(['active', 'archived'])
export const lessonMessageRoleSchema = z.enum(['system', 'tutor', 'learner'])
export const lessonModelRunStatusSchema = z.enum(['started', 'succeeded', 'failed', 'cancelled'])
export const lessonSourceTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text_range') }).strict(),
  z
    .object({
      kind: z.literal('pdf_block'),
      pageNumber: z.number().int().positive(),
      blockId: requiredTextSchema,
      blockIndex: z.number().int().nonnegative(),
    })
    .strict(),
])
export const lessonSourceAnchorSchema = z
  .object({
    id: z.string().uuid(),
    documentId: documentIdSchema,
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    snippet: requiredTextSchema.max(280),
    target: lessonSourceTargetSchema.optional(),
  })
  .refine((value) => value.endOffset > value.startOffset, {
    message: 'endOffset must be greater than startOffset',
  })

export const lessonMessageSchema = z
  .object({
    id: z.string().uuid(),
    lessonId: lessonIdSchema,
    modelRunId: z.string().uuid().nullable(),
    role: lessonMessageRoleSchema,
    content: requiredTextSchema.max(2_000),
    sourceAnchorIds: z.array(z.string().uuid()),
    promptVersion: requiredTextSchema.max(80),
    createdAt: timestampSchema,
  })
  .strict()

export const lessonPromptManifestSchema = z
  .object({
    key: requiredTextSchema.max(120),
    version: z.number().int().positive(),
    hash: z.string().regex(/^sha256:[\da-f]{64}$/u),
  })
  .strict()

export const lessonModelRunInputSummarySchema = z
  .object({
    documentId: documentIdSchema,
    documentTitle: requiredTextSchema,
    sourceAnchorIds: z.array(z.string().uuid()).min(1),
    sourceCharacterRange: z
      .object({
        startOffset: z.number().int().nonnegative(),
        endOffset: z.number().int().positive(),
      })
      .strict()
      .refine((value) => value.endOffset > value.startOffset, {
        message: 'endOffset must be greater than startOffset',
      }),
    snippetCharacterCount: z.number().int().nonnegative(),
    learnerReplyCharacterCount: z.number().int().nonnegative().optional(),
  })
  .strict()

export const lessonModelRunErrorSummarySchema = z
  .object({
    code: requiredTextSchema.max(80),
    message: requiredTextSchema.max(240),
    retryable: z.boolean(),
  })
  .strict()

export const lessonModelRunSchema = z
  .object({
    id: z.string().uuid(),
    lessonId: lessonIdSchema,
    providerId: z.string().uuid().nullable(),
    modelName: requiredTextSchema.max(120),
    operation: z.enum(['lesson_tutor_first_question', 'lesson_tutor_follow_up']),
    status: lessonModelRunStatusSchema,
    promptManifest: lessonPromptManifestSchema,
    inputSummary: lessonModelRunInputSummarySchema,
    sourceAnchorIds: z.array(z.string().uuid()).min(1),
    outputMessageId: z.string().uuid().nullable(),
    errorSummary: lessonModelRunErrorSummarySchema.nullable(),
    startedAt: timestampSchema,
    finishedAt: timestampSchema.nullable(),
  })
  .strict()

export const lessonSessionSchema = z
  .object({
    id: lessonIdSchema,
    title: requiredTextSchema,
    status: lessonSessionStatusSchema,
    documentId: documentIdSchema,
    documentTitle: requiredTextSchema,
    sourceAnchors: z.array(lessonSourceAnchorSchema).min(1),
    messages: z.array(lessonMessageSchema),
    modelRuns: z.array(lessonModelRunSchema),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()

export const lessonStartDraftSchema = z
  .object({
    documentId: documentIdSchema,
    documentTitle: requiredTextSchema,
    title: requiredTextSchema.optional(),
    source: z
      .object({
        startOffset: z.number().int().nonnegative(),
        endOffset: z.number().int().positive(),
        snippet: requiredTextSchema.max(280),
        target: lessonSourceTargetSchema.optional(),
      })
      .strict()
      .refine((value) => value.endOffset > value.startOffset, {
        message: 'endOffset must be greater than startOffset',
      }),
  })
  .strict()

export const lessonReplyDraftSchema = z
  .object({
    lessonId: lessonIdSchema,
    content: requiredTextSchema.max(1_000),
    operationId: z.string().uuid().optional(),
  })
  .strict()

export const lessonRunRetryDraftSchema = z
  .object({
    lessonId: lessonIdSchema,
    modelRunId: z.string().uuid(),
    operationId: z.string().uuid().optional(),
  })
  .strict()

export const lessonBusinessErrorCodeSchema = z.enum([
  'LESSON_VALIDATION_FAILED',
  'LESSON_DOCUMENT_NOT_FOUND',
  'LESSON_SOURCE_NOT_FOUND',
  'LESSON_NOT_FOUND',
])

const lessonSharedErrorCodeSchema = appErrorCodeSchema.extract([
  'INVALID_REQUEST',
  'INTERNAL_ERROR',
  'IPC_RESPONSE_INVALID',
  'DATABASE_UNAVAILABLE',
  'OPERATION_CANCELLED',
])

export const lessonErrorCodeSchema = z.union([
  lessonSharedErrorCodeSchema,
  lessonBusinessErrorCodeSchema,
])

export const listLessonsRequestSchema = z.object({ requestId: requestIdSchema }).strict()
export const startLessonFromDocumentRequestSchema = z
  .object({ requestId: requestIdSchema, lesson: lessonStartDraftSchema })
  .strict()
export const getLessonRequestSchema = z
  .object({ requestId: requestIdSchema, id: lessonIdSchema })
  .strict()
export const replyToLessonRequestSchema = z
  .object({
    requestId: requestIdSchema,
    lessonId: lessonIdSchema,
    content: requiredTextSchema.max(1_000),
    operationId: z.string().uuid(),
  })
  .strict()
export const retryLessonRunRequestSchema = z
  .object({
    requestId: requestIdSchema,
    lessonId: lessonIdSchema,
    modelRunId: z.string().uuid(),
    operationId: z.string().uuid(),
  })
  .strict()
export const cancelLessonRunRequestSchema = z
  .object({
    requestId: requestIdSchema,
    operationId: z.string().uuid(),
  })
  .strict()

const lessonErrorSchema = z
  .object({
    code: lessonErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    details: appErrorDetailsSchema.optional(),
  })
  .strict()

const createLessonResultSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: dataSchema, requestId: z.string().min(1) }).strict(),
    z
      .object({ ok: z.literal(false), error: lessonErrorSchema, requestId: z.string().min(1) })
      .strict(),
  ])

export const lessonSessionsResultSchema = createLessonResultSchema(z.array(lessonSessionSchema))
export const lessonSessionResultSchema = createLessonResultSchema(lessonSessionSchema)
export const cancelLessonRunResultSchema = createLessonResultSchema(
  z.object({ cancelled: z.boolean() }).strict(),
)

export type LessonSessionStatusDto = z.infer<typeof lessonSessionStatusSchema>
export type LessonSourceAnchorDto = z.infer<typeof lessonSourceAnchorSchema>
export type LessonMessageRoleDto = z.infer<typeof lessonMessageRoleSchema>
export type LessonMessageDto = z.infer<typeof lessonMessageSchema>
export type LessonModelRunStatusDto = z.infer<typeof lessonModelRunStatusSchema>
export type LessonPromptManifestDto = z.infer<typeof lessonPromptManifestSchema>
export type LessonModelRunInputSummaryDto = z.infer<typeof lessonModelRunInputSummarySchema>
export type LessonModelRunErrorSummaryDto = z.infer<typeof lessonModelRunErrorSummarySchema>
export type LessonModelRunDto = z.infer<typeof lessonModelRunSchema>
export type LessonSessionDto = z.infer<typeof lessonSessionSchema>
export type LessonStartDraftDto = z.infer<typeof lessonStartDraftSchema>
export type LessonReplyDraftDto = z.infer<typeof lessonReplyDraftSchema>
export type LessonRunRetryDraftDto = z.infer<typeof lessonRunRetryDraftSchema>
export type ListLessonsRequest = z.infer<typeof listLessonsRequestSchema>
export type StartLessonFromDocumentRequest = z.infer<typeof startLessonFromDocumentRequestSchema>
export type GetLessonRequest = z.infer<typeof getLessonRequestSchema>
export type ReplyToLessonRequest = z.infer<typeof replyToLessonRequestSchema>
export type RetryLessonRunRequest = z.infer<typeof retryLessonRunRequestSchema>
export type CancelLessonRunRequest = z.infer<typeof cancelLessonRunRequestSchema>
export type LessonSessionsResult = z.infer<typeof lessonSessionsResultSchema>
export type LessonSessionResult = z.infer<typeof lessonSessionResultSchema>
export type CancelLessonRunResult = z.infer<typeof cancelLessonRunResultSchema>
