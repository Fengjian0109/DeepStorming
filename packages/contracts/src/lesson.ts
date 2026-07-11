import { z } from 'zod'
import { appErrorCodeSchema, appErrorDetailsSchema } from './app-result'

export const LESSON_CHANNELS = {
  list: 'lessons:list',
  startFromDocument: 'lessons:start-from-document',
  get: 'lessons:get',
} as const

const requestIdSchema = z.string().uuid()
const lessonIdSchema = z.string().uuid()
const documentIdSchema = z.string().uuid()
const requiredTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: 'Required text must not be blank',
})
const timestampSchema = z.iso.datetime()

export const lessonSessionStatusSchema = z.enum(['active', 'archived'])
export const lessonSourceAnchorSchema = z
  .object({
    id: z.string().uuid(),
    documentId: documentIdSchema,
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
    snippet: requiredTextSchema.max(280),
  })
  .refine((value) => value.endOffset > value.startOffset, {
    message: 'endOffset must be greater than startOffset',
  })

export const lessonSessionSchema = z
  .object({
    id: lessonIdSchema,
    title: requiredTextSchema,
    status: lessonSessionStatusSchema,
    documentId: documentIdSchema,
    documentTitle: requiredTextSchema,
    sourceAnchors: z.array(lessonSourceAnchorSchema).min(1),
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
      })
      .strict()
      .refine((value) => value.endOffset > value.startOffset, {
        message: 'endOffset must be greater than startOffset',
      }),
  })
  .strict()

export const lessonBusinessErrorCodeSchema = z.enum([
  'LESSON_VALIDATION_FAILED',
  'LESSON_DOCUMENT_NOT_FOUND',
  'LESSON_NOT_FOUND',
])

const lessonSharedErrorCodeSchema = appErrorCodeSchema.extract([
  'INVALID_REQUEST',
  'INTERNAL_ERROR',
  'IPC_RESPONSE_INVALID',
  'DATABASE_UNAVAILABLE',
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

export type LessonSessionStatusDto = z.infer<typeof lessonSessionStatusSchema>
export type LessonSourceAnchorDto = z.infer<typeof lessonSourceAnchorSchema>
export type LessonSessionDto = z.infer<typeof lessonSessionSchema>
export type LessonStartDraftDto = z.infer<typeof lessonStartDraftSchema>
export type ListLessonsRequest = z.infer<typeof listLessonsRequestSchema>
export type StartLessonFromDocumentRequest = z.infer<typeof startLessonFromDocumentRequestSchema>
export type GetLessonRequest = z.infer<typeof getLessonRequestSchema>
export type LessonSessionsResult = z.infer<typeof lessonSessionsResultSchema>
export type LessonSessionResult = z.infer<typeof lessonSessionResultSchema>
