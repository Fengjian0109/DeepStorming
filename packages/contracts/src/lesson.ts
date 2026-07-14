import { z } from 'zod'
import { appErrorCodeSchema, appErrorDetailsSchema } from './app-result'
import { lessonPaceSchema, lessonTutorSnapshotSchema } from './learning-settings'

export const LESSON_CHANNELS = {
  list: 'lessons:list',
  startFromDocument: 'lessons:start-from-document',
  get: 'lessons:get',
  reply: 'lessons:reply',
  retryRun: 'lessons:retry-run',
  cancelRun: 'lessons:cancel-run',
  recordReview: 'lessons:record-review',
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
export const lessonStateSchema = z.enum([
  'opening',
  'probing',
  'hinting',
  'explaining',
  'reflecting',
  'summarizing',
  'completed',
  'paused',
  'error',
])
export const tutorActionTypeSchema = z.enum(['ask', 'hint', 'explain', 'reflect', 'summarize'])
export const lessonStepStatusSchema = z.enum(['started', 'succeeded', 'failed', 'cancelled'])
export const masteryEvidenceKindSchema = z.enum(['teach_back', 'stuck_signal', 'self_report'])
export const masteryJudgementSchema = z.enum([
  'insufficient',
  'partial_understanding',
  'needs_review',
])
export const misconceptionSeveritySchema = z.enum(['low', 'medium', 'high'])
export const reviewItemStatusSchema = z.enum(['active', 'completed', 'suspended'])
export const reviewRatingSchema = z.enum(['remembered', 'forgot'])
export const lessonModeSchema = z.enum(['standard', 'paper'])
export const paperReadingStageSchema = z.enum([
  'orientation',
  'problem_framing',
  'method_intuition',
  'method_mechanics',
  'evidence_check',
  'critical_review',
  'transfer',
  'synthesis',
])
export const paperLessonProfileSchema = z
  .object({
    currentStage: paperReadingStageSchema,
    stageSummary: z.string().max(500).nullable(),
    termsIntroduced: z.array(z.string().trim().min(1).max(120)).max(24),
    citedAnchorIds: z.array(z.string().uuid()).max(24),
  })
  .strict()
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

export const lessonTutorCitationSchema = z
  .object({
    chunkId: requiredTextSchema.max(200),
    quote: requiredTextSchema.max(1_000),
    rationale: requiredTextSchema.max(500),
    pageNumberStart: z.number().int().positive().optional(),
    pageNumberEnd: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.pageNumberStart === undefined && value.pageNumberEnd === undefined) ||
      (value.pageNumberStart !== undefined &&
        value.pageNumberEnd !== undefined &&
        value.pageNumberEnd >= value.pageNumberStart),
    { message: 'Citation page range is invalid.' },
  )

export const lessonMessageSchema = z
  .object({
    id: z.string().uuid(),
    lessonId: lessonIdSchema,
    modelRunId: z.string().uuid().nullable(),
    role: lessonMessageRoleSchema,
    content: requiredTextSchema.max(8_000),
    sourceAnchorIds: z.array(z.string().uuid()),
    promptVersion: requiredTextSchema.max(80),
    createdAt: timestampSchema,
    tutorTurn: z
      .object({
        narration: z.string().trim().min(1).max(1_000).nullable(),
        responseMarkdown: requiredTextSchema.max(8_000),
        citations: z.array(lessonTutorCitationSchema).max(8),
        figureReferences: z
          .array(
            z
              .object({
                figureId: requiredTextSchema.max(200),
                rationale: requiredTextSchema.max(500),
              })
              .strict(),
          )
          .max(4),
      })
      .strict()
      .optional(),
  })
  .strict()

export const lessonPromptManifestSchema = z
  .object({
    key: requiredTextSchema.max(120),
    version: z.number().int().positive(),
    hash: z.string().regex(/^sha256:[\da-f]{64}$/u),
  })
  .strict()

export const lessonContextChunkSummarySchema = z
  .object({
    chunkId: z.string().uuid(),
    pageNumberStart: z.number().int().positive(),
    pageNumberEnd: z.number().int().positive(),
    charCount: z.number().int().nonnegative(),
  })
  .strict()
  .refine((value) => value.pageNumberEnd >= value.pageNumberStart, {
    message: 'pageNumberEnd must be greater than or equal to pageNumberStart',
  })

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
    contextCharacterCount: z.number().int().nonnegative(),
    contextChunks: z.array(lessonContextChunkSummarySchema),
    learnerReplyCharacterCount: z.number().int().nonnegative().optional(),
  })
  .refine(
    (value) =>
      value.contextCharacterCount ===
      value.contextChunks.reduce((total, chunk) => total + chunk.charCount, 0),
    {
      message: 'contextCharacterCount must match the sum of context chunk charCount values',
    },
  )
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

export const lessonStepSchema = z
  .object({
    id: z.string().uuid(),
    lessonId: lessonIdSchema,
    sequenceNo: z.number().int().nonnegative(),
    stateBefore: lessonStateSchema,
    stateAfter: lessonStateSchema,
    actionType: tutorActionTypeSchema,
    status: lessonStepStatusSchema,
    modelRunId: z.string().uuid(),
    messageId: z.string().uuid().nullable(),
    rationale: requiredTextSchema.max(240).nullable(),
    errorSummary: lessonModelRunErrorSummarySchema.nullable(),
    createdAt: timestampSchema,
    finishedAt: timestampSchema.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.status !== 'started' ||
      (value.messageId === null &&
        value.rationale === null &&
        value.errorSummary === null &&
        value.finishedAt === null),
    { message: 'started step must not have completion fields' },
  )
  .refine(
    (value) =>
      value.status !== 'succeeded' ||
      (value.messageId !== null &&
        value.rationale !== null &&
        value.errorSummary === null &&
        value.finishedAt !== null),
    { message: 'succeeded step must have success fields only' },
  )
  .refine((value) => value.status === 'started' || value.finishedAt !== null, {
    message: 'finished step must have finishedAt',
  })

export const lessonMasteryEvidenceSchema = z
  .object({
    id: z.string().uuid(),
    lessonId: lessonIdSchema,
    stepId: z.string().uuid(),
    learnerMessageId: z.string().uuid(),
    tutorMessageId: z.string().uuid(),
    kind: masteryEvidenceKindSchema,
    judgement: masteryJudgementSchema,
    confidence: z.number().min(0).max(1),
    rationale: requiredTextSchema.max(280),
    suggestedReview: z.boolean(),
    createdAt: timestampSchema,
  })
  .strict()

export const lessonMisconceptionSignalSchema = z
  .object({
    id: z.string().uuid(),
    evidenceId: z.string().uuid(),
    lessonId: lessonIdSchema,
    label: requiredTextSchema.max(80),
    severity: misconceptionSeveritySchema,
    rationale: requiredTextSchema.max(280),
    createdAt: timestampSchema,
  })
  .strict()

export const lessonReviewItemSchema = z
  .object({
    id: z.string().uuid(),
    lessonId: lessonIdSchema,
    masteryEvidenceId: z.string().uuid(),
    misconceptionSignalId: z.string().uuid().nullable(),
    prompt: requiredTextSchema.max(280),
    answerOutline: z.array(requiredTextSchema.max(280)).min(1).max(5),
    status: reviewItemStatusSchema,
    dueAt: timestampSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()

export const lessonReviewEventSchema = z
  .object({
    id: z.string().uuid(),
    reviewItemId: z.string().uuid(),
    lessonId: lessonIdSchema,
    rating: reviewRatingSchema,
    response: requiredTextSchema.max(1_000),
    previousDueAt: timestampSchema,
    nextDueAt: timestampSchema.nullable(),
    reviewedAt: timestampSchema,
    createdAt: timestampSchema,
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
    currentState: lessonStateSchema,
    steps: z.array(lessonStepSchema),
    masteryEvidence: z.array(lessonMasteryEvidenceSchema),
    misconceptionSignals: z.array(lessonMisconceptionSignalSchema),
    reviewItems: z.array(lessonReviewItemSchema),
    reviewEvents: z.array(lessonReviewEventSchema),
    lessonMode: lessonModeSchema.default('standard'),
    paperProfile: paperLessonProfileSchema.nullable().default(null),
    tutorSnapshot: lessonTutorSnapshotSchema.optional(),
    pace: lessonPaceSchema.optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()

export const lessonStartDraftSchema = z
  .object({
    documentId: documentIdSchema,
    documentTitle: requiredTextSchema,
    title: requiredTextSchema.optional(),
    lessonMode: lessonModeSchema.optional(),
    tutorProfileId: z.string().uuid().optional(),
    pace: lessonPaceSchema.optional(),
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

export const lessonRecordReviewDraftSchema = z
  .object({
    lessonId: lessonIdSchema,
    reviewItemId: z.string().uuid(),
    rating: reviewRatingSchema,
    response: requiredTextSchema.max(1_000),
  })
  .strict()

export const lessonBusinessErrorCodeSchema = z.enum([
  'LESSON_VALIDATION_FAILED',
  'LESSON_DOCUMENT_NOT_FOUND',
  'LESSON_SOURCE_NOT_FOUND',
  'LESSON_NOT_FOUND',
  'LESSON_TUTOR_NOT_FOUND',
])

const lessonSharedErrorCodeSchema = appErrorCodeSchema.extract([
  'INVALID_REQUEST',
  'INTERNAL_ERROR',
  'IPC_RESPONSE_INVALID',
  'DATABASE_UNAVAILABLE',
  'OPERATION_CANCELLED',
  'AI_PROVIDER_REQUIRED',
  'AI_GENERATION_FAILED',
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
export const recordReviewRequestSchema = z
  .object({
    requestId: requestIdSchema,
    lessonId: lessonIdSchema,
    reviewItemId: z.string().uuid(),
    rating: reviewRatingSchema,
    response: requiredTextSchema.max(1_000),
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
export type LessonTutorCitationDto = z.infer<typeof lessonTutorCitationSchema>
export type LessonModelRunStatusDto = z.infer<typeof lessonModelRunStatusSchema>
export type LessonStateDto = z.infer<typeof lessonStateSchema>
export type TutorActionTypeDto = z.infer<typeof tutorActionTypeSchema>
export type LessonStepStatusDto = z.infer<typeof lessonStepStatusSchema>
export type LessonPromptManifestDto = z.infer<typeof lessonPromptManifestSchema>
export type LessonContextChunkSummaryDto = z.infer<typeof lessonContextChunkSummarySchema>
export type LessonModelRunInputSummaryDto = z.infer<typeof lessonModelRunInputSummarySchema>
export type LessonModelRunErrorSummaryDto = z.infer<typeof lessonModelRunErrorSummarySchema>
export type LessonModelRunDto = z.infer<typeof lessonModelRunSchema>
export type LessonStepDto = z.infer<typeof lessonStepSchema>
export type LessonMasteryEvidenceDto = z.infer<typeof lessonMasteryEvidenceSchema>
export type LessonMisconceptionSignalDto = z.infer<typeof lessonMisconceptionSignalSchema>
export type LessonReviewItemDto = z.infer<typeof lessonReviewItemSchema>
export type LessonReviewEventDto = z.infer<typeof lessonReviewEventSchema>
export type LessonSessionDto = z.infer<typeof lessonSessionSchema>
export type LessonStartDraftDto = z.infer<typeof lessonStartDraftSchema>
export type LessonReplyDraftDto = z.infer<typeof lessonReplyDraftSchema>
export type LessonRunRetryDraftDto = z.infer<typeof lessonRunRetryDraftSchema>
export type LessonRecordReviewDraftDto = z.infer<typeof lessonRecordReviewDraftSchema>
export type ListLessonsRequest = z.infer<typeof listLessonsRequestSchema>
export type StartLessonFromDocumentRequest = z.infer<typeof startLessonFromDocumentRequestSchema>
export type GetLessonRequest = z.infer<typeof getLessonRequestSchema>
export type ReplyToLessonRequest = z.infer<typeof replyToLessonRequestSchema>
export type RetryLessonRunRequest = z.infer<typeof retryLessonRunRequestSchema>
export type CancelLessonRunRequest = z.infer<typeof cancelLessonRunRequestSchema>
export type RecordReviewRequest = z.infer<typeof recordReviewRequestSchema>
export type LessonSessionsResult = z.infer<typeof lessonSessionsResultSchema>
export type LessonSessionResult = z.infer<typeof lessonSessionResultSchema>
export type CancelLessonRunResult = z.infer<typeof cancelLessonRunResultSchema>
