import { randomUUID } from 'node:crypto'
import type {
  CancelLessonRun,
  GetLessonSession,
  ListLessonSessions,
  RecordReviewEvent,
  RetryLessonRun,
  StartLessonFromDocument,
  SubmitLessonReply,
  EndLesson,
  ChoosePostLessonAction,
  CompleteLessonReview,
} from '@deepstorming/application'
import { LessonUseCaseError } from '@deepstorming/application'
import {
  cancelLessonRunRequestSchema,
  cancelLessonRunResultSchema,
  getLessonRequestSchema,
  lessonSessionResultSchema,
  lessonSessionsResultSchema,
  listLessonsRequestSchema,
  recordReviewRequestSchema,
  replyToLessonRequestSchema,
  retryLessonRunRequestSchema,
  startLessonFromDocumentRequestSchema,
  endLessonRequestSchema,
  choosePostLessonActionRequestSchema,
  completeLessonReviewRequestSchema,
  type LessonSessionResult,
  type LessonSessionsResult,
  type CancelLessonRunRequest,
  type CancelLessonRunResult,
  type RecordReviewRequest,
  type ReplyToLessonRequest,
  type RetryLessonRunRequest,
  type StartLessonFromDocumentRequest,
  type EndLessonRequest,
  type ChoosePostLessonActionRequest,
  type CompleteLessonReviewRequest,
} from '@deepstorming/contracts'

type Awaitable<T> = T | Promise<T>
type SafeParseResult<T> =
  | Readonly<{ success: true; data: T }>
  | Readonly<{ success: false; error: Readonly<{ issues: readonly unknown[] }> }>
type Schema<T> = Readonly<{ safeParse(input: unknown): SafeParseResult<T> }>
type ResultSchema<T> = Readonly<{
  safeParse(input: unknown): Readonly<{ success: true; data: T }> | Readonly<{ success: false }>
}>
type LessonIpcResult = LessonSessionsResult | LessonSessionResult | CancelLessonRunResult
type LessonIpcError = Extract<LessonIpcResult, { ok: false }>['error']

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{12}$/u

export type LessonIpcHandlers = Readonly<{
  list(input: unknown): Promise<LessonSessionsResult>
  startFromDocument(input: unknown): Promise<LessonSessionResult>
  get(input: unknown): Promise<LessonSessionResult>
  reply(input: unknown): Promise<LessonSessionResult>
  retryRun(input: unknown): Promise<LessonSessionResult>
  cancelRun(input: unknown): Promise<CancelLessonRunResult>
  recordReview(input: unknown): Promise<LessonSessionResult>
  end(input: unknown): Promise<LessonSessionResult>
  choosePostLessonAction(input: unknown): Promise<LessonSessionResult>
  completeReview(input: unknown): Promise<LessonSessionResult>
}>

export type LessonIpcDependencies = Readonly<{
  listLessonSessions: ListLessonSessions
  startLessonFromDocument: StartLessonFromDocument
  getLessonSession: GetLessonSession
  submitLessonReply: SubmitLessonReply
  retryLessonRun: RetryLessonRun
  cancelLessonRun: CancelLessonRun
  recordReviewEvent: RecordReviewEvent
  endLesson: EndLesson
  choosePostLessonAction: ChoosePostLessonAction
  completeLessonReview: CompleteLessonReview
}>

const requestIdFrom = (input: unknown): string => {
  if (
    input !== null &&
    typeof input === 'object' &&
    'requestId' in input &&
    typeof input.requestId === 'string' &&
    UUID.test(input.requestId)
  ) {
    return input.requestId
  }
  return randomUUID()
}

const invalidRequest = (requestId: string, issueCount: number): LessonIpcResult => ({
  ok: false,
  error: {
    code: 'INVALID_REQUEST',
    message: 'The lesson request is invalid.',
    retryable: false,
    details: { issueCount },
  },
  requestId,
})

const internalError = (requestId: string): LessonIpcResult => ({
  ok: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: 'The lesson request could not be completed.',
    retryable: true,
  },
  requestId,
})

const mapError = (error: unknown, requestId: string): LessonIpcResult => {
  if (error instanceof LessonUseCaseError) {
    const mapped: LessonIpcError = {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.details === undefined ? {} : { details: error.details }),
    }
    return { ok: false, error: mapped, requestId }
  }
  return internalError(requestId)
}

const validated = <Result extends LessonIpcResult>(
  result: Result,
  schema: ResultSchema<Result>,
): Result => {
  const parsed = schema.safeParse(result)
  if (!parsed.success) throw new Error('IPC result failed validation')
  return parsed.data
}

const handle = async <Request extends { requestId: string }, Data, Result extends LessonIpcResult>(
  input: unknown,
  requestSchema: Schema<Request>,
  resultSchema: ResultSchema<Result>,
  execute: (request: Request) => Awaitable<Data>,
): Promise<Result> => {
  const requestId = requestIdFrom(input)
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) {
    return validated(invalidRequest(requestId, parsed.error.issues.length) as Result, resultSchema)
  }

  try {
    const data = await execute(parsed.data)
    return validated(
      { ok: true, data, requestId: parsed.data.requestId } as unknown as Result,
      resultSchema,
    )
  } catch (error) {
    return validated(mapError(error, parsed.data.requestId) as Result, resultSchema)
  }
}

export const createLessonIpcHandlers = (
  dependencies: LessonIpcDependencies,
): LessonIpcHandlers => ({
  list: (input) =>
    handle(input, listLessonsRequestSchema, lessonSessionsResultSchema, () =>
      dependencies.listLessonSessions.execute(),
    ),
  startFromDocument: (input) =>
    handle(
      input,
      startLessonFromDocumentRequestSchema,
      lessonSessionResultSchema,
      (request: StartLessonFromDocumentRequest) =>
        dependencies.startLessonFromDocument.execute({
          documentId: request.lesson.documentId,
          documentTitle: request.lesson.documentTitle,
          ...(request.lesson.title === undefined ? {} : { title: request.lesson.title }),
          ...(request.lesson.lessonMode === undefined
            ? {}
            : { lessonMode: request.lesson.lessonMode }),
          source: request.lesson.source,
        }),
    ),
  get: (input) =>
    handle(input, getLessonRequestSchema, lessonSessionResultSchema, (request) =>
      dependencies.getLessonSession.execute(request.id),
    ),
  reply: (input) =>
    handle(
      input,
      replyToLessonRequestSchema,
      lessonSessionResultSchema,
      (request: ReplyToLessonRequest) =>
        dependencies.submitLessonReply.execute({
          lessonId: request.lessonId,
          content: request.content,
          operationId: request.operationId,
        }),
    ),
  retryRun: (input) =>
    handle(
      input,
      retryLessonRunRequestSchema,
      lessonSessionResultSchema,
      (request: RetryLessonRunRequest) =>
        dependencies.retryLessonRun.execute({
          lessonId: request.lessonId,
          modelRunId: request.modelRunId,
          operationId: request.operationId,
        }),
    ),
  cancelRun: (input) =>
    handle(
      input,
      cancelLessonRunRequestSchema,
      cancelLessonRunResultSchema,
      (request: CancelLessonRunRequest) =>
        dependencies.cancelLessonRun.execute({ operationId: request.operationId }),
    ),
  recordReview: (input) =>
    handle(
      input,
      recordReviewRequestSchema,
      lessonSessionResultSchema,
      (request: RecordReviewRequest) =>
        dependencies.recordReviewEvent.execute({
          lessonId: request.lessonId,
          reviewItemId: request.reviewItemId,
          rating: request.rating,
          response: request.response,
        }),
    ),
  end: (input) =>
    handle(input, endLessonRequestSchema, lessonSessionResultSchema, (request: EndLessonRequest) =>
      dependencies.endLesson.execute({
        lessonId: request.lessonId,
        operationId: request.operationId,
      }),
    ),
  choosePostLessonAction: (input) =>
    handle(
      input,
      choosePostLessonActionRequestSchema,
      lessonSessionResultSchema,
      (request: ChoosePostLessonActionRequest) =>
        dependencies.choosePostLessonAction.execute({
          lessonId: request.lessonId,
          action: request.action,
        }),
    ),
  completeReview: (input) =>
    handle(
      input,
      completeLessonReviewRequestSchema,
      lessonSessionResultSchema,
      (request: CompleteLessonReviewRequest) =>
        dependencies.completeLessonReview.execute({
          lessonId: request.lessonId,
          response: request.response,
        }),
    ),
})
