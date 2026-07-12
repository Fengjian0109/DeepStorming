import { describe, expect, it } from 'vitest'
import {
  LESSON_CHANNELS,
  getLessonRequestSchema,
  lessonModelRunInputSummarySchema,
  lessonModelRunSchema,
  lessonSessionResultSchema,
  lessonSessionSchema,
  lessonSessionsResultSchema,
  cancelLessonRunRequestSchema,
  cancelLessonRunResultSchema,
  replyToLessonRequestSchema,
  retryLessonRunRequestSchema,
  startLessonFromDocumentRequestSchema,
} from './lesson'

const requestId = '00000000-0000-4000-8000-000000000001'
const lessonId = '00000000-0000-4000-8000-000000000101'
const documentId = '00000000-0000-4000-8000-000000000201'
const anchorId = '00000000-0000-4000-8000-000000000301'
const messageId = '00000000-0000-4000-8000-000000000401'
const modelRunId = '00000000-0000-4000-8000-000000000501'

const session = {
  id: lessonId,
  title: 'Paper Map 课堂',
  status: 'active',
  documentId,
  documentTitle: 'Paper Map',
  sourceAnchors: [
    {
      id: anchorId,
      documentId,
      startOffset: 4,
      endOffset: 12,
      snippet: 'Evidence',
      target: { kind: 'text_range' },
    },
  ],
  messages: [
    {
      id: messageId,
      lessonId,
      modelRunId,
      role: 'tutor',
      content: '我们先从《Paper Map》的这段证据开始：Evidence\n\n你觉得它想解决的核心问题是什么？',
      sourceAnchorIds: [anchorId],
      promptVersion: 'mock-tutor-v1',
      createdAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  modelRuns: [
    {
      id: modelRunId,
      lessonId,
      providerId: null,
      modelName: 'mock-local',
      operation: 'lesson_tutor_first_question',
      status: 'succeeded',
      promptManifest: {
        key: 'lesson.mockTutor.firstQuestion',
        version: 1,
        hash: 'sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff',
      },
      inputSummary: {
        documentId,
        documentTitle: 'Paper Map',
        sourceAnchorIds: [anchorId],
        sourceCharacterRange: { startOffset: 4, endOffset: 12 },
        snippetCharacterCount: 8,
        contextCharacterCount: 144,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            pageNumberStart: 1,
            pageNumberEnd: 2,
            charCount: 144,
          },
        ],
      },
      sourceAnchorIds: [anchorId],
      outputMessageId: messageId,
      errorSummary: null,
      startedAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
} as const

describe('lesson contracts', () => {
  it('defines explicit lesson IPC channels', () => {
    expect(LESSON_CHANNELS).toEqual({
      list: 'lessons:list',
      startFromDocument: 'lessons:start-from-document',
      get: 'lessons:get',
      reply: 'lessons:reply',
      retryRun: 'lessons:retry-run',
      cancelRun: 'lessons:cancel-run',
    })
  })

  it('strictly validates start and get requests', () => {
    expect(
      startLessonFromDocumentRequestSchema.safeParse({
        requestId,
        lesson: {
          documentId,
          documentTitle: 'Paper Map',
          source: { startOffset: 4, endOffset: 12, snippet: 'Evidence' },
        },
      }).success,
    ).toBe(true)
    expect(
      startLessonFromDocumentRequestSchema.safeParse({
        requestId,
        lesson: {
          documentId,
          documentTitle: 'Paper Map',
          source: {
            startOffset: 4,
            endOffset: 12,
            snippet: 'Evidence',
            target: { kind: 'pdf_block', pageNumber: 2, blockId: 'p2-b1', blockIndex: 1 },
          },
        },
      }).success,
    ).toBe(true)
    expect(
      startLessonFromDocumentRequestSchema.safeParse({
        requestId,
        lesson: {
          documentId,
          documentTitle: 'Paper Map',
          source: { startOffset: 12, endOffset: 4, snippet: 'Evidence' },
        },
      }).success,
    ).toBe(false)
    expect(getLessonRequestSchema.safeParse({ requestId, id: lessonId }).success).toBe(true)
    expect(getLessonRequestSchema.safeParse({ requestId, id: 'not-a-uuid' }).success).toBe(false)
    expect(
      replyToLessonRequestSchema.safeParse({
        requestId,
        lessonId,
        content: '它在说明证据如何支撑判断。',
        operationId: modelRunId,
      }).success,
    ).toBe(true)
    expect(
      replyToLessonRequestSchema.safeParse({
        requestId,
        lessonId,
        content: '   ',
      }).success,
    ).toBe(false)
    expect(
      retryLessonRunRequestSchema.safeParse({
        requestId,
        lessonId,
        modelRunId,
        operationId: modelRunId,
      }).success,
    ).toBe(true)
    expect(
      cancelLessonRunRequestSchema.safeParse({
        requestId,
        operationId: modelRunId,
      }).success,
    ).toBe(true)
  })

  it('rejects full document text and SQLite internals on session DTOs', () => {
    expect(lessonSessionSchema.safeParse(session).success).toBe(true)
    expect(
      lessonSessionSchema.safeParse({
        ...session,
        modelRuns: [
          {
            ...session.modelRuns[0],
            status: 'failed',
            outputMessageId: null,
            errorSummary: {
              code: 'INTERNAL_ERROR',
              message: 'The lesson operation could not be completed.',
              retryable: true,
            },
          },
        ],
      }).success,
    ).toBe(true)
    expect(lessonSessionSchema.safeParse({ ...session, plainText: 'full text' }).success).toBe(
      false,
    )
    expect(lessonSessionSchema.safeParse({ ...session, contentHash: 'private' }).success).toBe(
      false,
    )
    expect(
      lessonSessionSchema.safeParse({
        ...session,
        messages: [{ ...session.messages[0], role: 'assistant' }],
      }).success,
    ).toBe(false)
    expect(
      lessonSessionSchema.safeParse({
        ...session,
        modelRuns: [{ ...session.modelRuns[0], inputSummary: { plainText: 'full text' } }],
      }).success,
    ).toBe(false)
  })

  it('accepts list and single session result envelopes', () => {
    expect(
      lessonSessionsResultSchema.safeParse({ ok: true, data: [session], requestId }).success,
    ).toBe(true)
    expect(
      lessonSessionResultSchema.safeParse({ ok: true, data: session, requestId }).success,
    ).toBe(true)
    expect(
      lessonSessionResultSchema.safeParse({
        ok: false,
        requestId,
        error: {
          code: 'OPERATION_CANCELLED',
          message: 'Cancelled',
          retryable: false,
        },
      }).success,
    ).toBe(true)
    expect(
      cancelLessonRunResultSchema.safeParse({
        ok: true,
        data: { cancelled: true },
        requestId,
      }).success,
    ).toBe(true)
  })

  it('requires the context chunk field but allows an empty summary list', () => {
    expect(
      lessonModelRunInputSummarySchema.safeParse({
        documentId,
        documentTitle: 'Paper Map',
        sourceAnchorIds: [anchorId],
        sourceCharacterRange: { startOffset: 4, endOffset: 12 },
        snippetCharacterCount: 8,
        contextCharacterCount: 144,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            pageNumberStart: 1,
            pageNumberEnd: 2,
            charCount: 144,
          },
        ],
      }).success,
    ).toBe(true)

    expect(
      lessonModelRunSchema.safeParse({
        ...session.modelRuns[0],
        inputSummary: {
          ...session.modelRuns[0].inputSummary,
          contextCharacterCount: 0,
          contextChunks: [],
        },
      }).success,
    ).toBe(true)

    expect(
      lessonModelRunInputSummarySchema.safeParse({
        documentId,
        documentTitle: 'Paper Map',
        sourceAnchorIds: [anchorId],
        sourceCharacterRange: { startOffset: 4, endOffset: 12 },
        snippetCharacterCount: 8,
        contextCharacterCount: 0,
      }).success,
    ).toBe(false)

    expect(
      lessonModelRunInputSummarySchema.safeParse({
        documentId,
        documentTitle: 'Paper Map',
        sourceAnchorIds: [anchorId],
        sourceCharacterRange: { startOffset: 4, endOffset: 12 },
        snippetCharacterCount: 8,
        contextCharacterCount: 145,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            pageNumberStart: 1,
            pageNumberEnd: 2,
            charCount: 144,
          },
        ],
      }).success,
    ).toBe(false)

    expect(
      lessonModelRunInputSummarySchema.safeParse({
        documentId,
        documentTitle: 'Paper Map',
        sourceAnchorIds: [anchorId],
        sourceCharacterRange: { startOffset: 4, endOffset: 12 },
        snippetCharacterCount: 8,
        contextCharacterCount: 1,
        contextChunks: [],
      }).success,
    ).toBe(false)
  })
})
