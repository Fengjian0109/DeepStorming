import { describe, expect, it } from 'vitest'
import {
  LESSON_CHANNELS,
  getLessonRequestSchema,
  lessonModelRunInputSummarySchema,
  lessonRecordReviewDraftSchema,
  lessonModelRunSchema,
  lessonReviewEventSchema,
  lessonReviewItemSchema,
  lessonStepSchema,
  lessonSessionResultSchema,
  lessonSessionSchema,
  lessonSessionStatusSchema,
  lessonMemorySchema,
  lessonEndJobSchema,
  endLessonRequestSchema,
  choosePostLessonActionRequestSchema,
  completeLessonReviewRequestSchema,
  lessonErrorCodeSchema,
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
const learnerMessageId = '00000000-0000-4000-8000-000000000402'
const tutorMessageId = '00000000-0000-4000-8000-000000000403'
const modelRunId = '00000000-0000-4000-8000-000000000501'
const stepId = '00000000-0000-4000-8000-000000000701'
const evidenceId = '00000000-0000-4000-8000-000000000801'
const misconceptionSignalId = '00000000-0000-4000-8000-000000000901'
const reviewItemId = '00000000-0000-4000-8000-000000000951'
const reviewEventId = '00000000-0000-4000-8000-000000000961'

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
      tutorTurn: {
        narration: '导师圈出了证据片段。',
        responseMarkdown: '我们先从 **Evidence** 开始：$x^2$ 表示什么？',
        citations: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            quote: 'Evidence',
            rationale: '这是当前问题所依据的原文。',
            pageNumberStart: 1,
            pageNumberEnd: 2,
          },
        ],
        figureReferences: [],
      },
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
  currentState: 'probing',
  steps: [
    {
      id: stepId,
      lessonId,
      sequenceNo: 0,
      stateBefore: 'opening',
      stateAfter: 'probing',
      actionType: 'ask',
      status: 'succeeded',
      modelRunId,
      messageId,
      rationale: 'Started with a source-grounded question.',
      errorSummary: null,
      createdAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  masteryEvidence: [
    {
      id: evidenceId,
      lessonId,
      stepId,
      learnerMessageId,
      tutorMessageId,
      kind: 'teach_back',
      judgement: 'partial_understanding',
      confidence: 0.55,
      rationale: 'Learner connected the answer to the cited evidence.',
      suggestedReview: false,
      createdAt: '2026-07-11T00:01:00.000Z',
    },
  ],
  misconceptionSignals: [
    {
      id: misconceptionSignalId,
      evidenceId,
      lessonId,
      label: '学习者表达卡住',
      severity: 'medium',
      rationale: 'Learner explicitly said they were stuck.',
      createdAt: '2026-07-11T00:01:00.000Z',
    },
  ],
  reviewItems: [
    {
      id: reviewItemId,
      lessonId,
      masteryEvidenceId: evidenceId,
      misconceptionSignalId,
      prompt: '复习：学习者表达卡住。请重新解释这段证据想说明什么。',
      answerOutline: [
        'Learner connected the answer to the cited evidence.',
        'Learner explicitly said they were stuck.',
      ],
      status: 'active',
      dueAt: '2026-07-14T00:00:00.000Z',
      createdAt: '2026-07-11T00:01:00.000Z',
      updatedAt: '2026-07-11T00:01:00.000Z',
    },
  ],
  reviewEvents: [
    {
      id: reviewEventId,
      reviewItemId,
      lessonId,
      rating: 'forgot',
      response: 'I still mix up the rationale.',
      previousDueAt: '2026-07-14T00:00:00.000Z',
      nextDueAt: '2026-07-15T09:00:00.000Z',
      reviewedAt: '2026-07-14T09:00:00.000Z',
      createdAt: '2026-07-14T09:00:00.000Z',
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
      recordReview: 'lessons:record-review',
      end: 'lessons:end',
      choosePostLessonAction: 'lessons:choose-post-lesson-action',
      completeReview: 'lessons:complete-review',
      exportTranscript: 'lessons:export-transcript',
      cancelExport: 'lessons:cancel-export',
    })
  })

  it('strictly validates lifecycle statuses, memory, jobs, and transition requests', () => {
    expect(lessonSessionStatusSchema.options).toEqual([
      'preparing',
      'active',
      'summarizing',
      'pending_review',
      'reviewing',
      'completed',
      'paused',
      'error',
      'archived',
    ])
    const memory = {
      lessonId,
      documentId,
      topic: 'Attention',
      coverage: 'Pages 1–4',
      summaryMarkdown: '**Summary**',
      mastered: ['mapping'],
      unstable: ['scaling'],
      misconceptions: [],
      sourceAnchorIds: [anchorId],
      figureIds: [],
      unresolvedQuestions: ['why scale?'],
      reviewPrompts: ['请解释缩放。'],
      nextLessonStart: 'derive scaling',
      createdAt: '2026-07-15T00:00:00.000Z',
    }
    expect(lessonMemorySchema.safeParse(memory).success).toBe(true)
    expect(
      lessonEndJobSchema.safeParse({
        operationId: modelRunId,
        status: 'succeeded',
        errorSummary: null,
        startedAt: '2026-07-15T00:00:00.000Z',
        finishedAt: '2026-07-15T00:01:00.000Z',
      }).success,
    ).toBe(true)
    expect(
      lessonSessionSchema.safeParse({
        ...session,
        status: 'pending_review',
        memory,
        endJob: {
          operationId: modelRunId,
          status: 'succeeded',
          errorSummary: null,
          startedAt: '2026-07-15T00:00:00.000Z',
          finishedAt: '2026-07-15T00:01:00.000Z',
        },
        postLessonAction: 'rest',
      }).success,
    ).toBe(true)

    expect(
      endLessonRequestSchema.safeParse({ requestId, lessonId, operationId: modelRunId }).success,
    ).toBe(true)
    expect(
      choosePostLessonActionRequestSchema.safeParse({
        requestId,
        lessonId,
        action: 'immediate_review',
      }).success,
    ).toBe(true)
    expect(
      completeLessonReviewRequestSchema.safeParse({
        requestId,
        lessonId,
        response: '缩放避免点积过大。',
      }).success,
    ).toBe(true)
    expect(
      completeLessonReviewRequestSchema.safeParse({
        requestId,
        lessonId,
        response: ' ',
      }).success,
    ).toBe(false)
    expect(lessonErrorCodeSchema.safeParse('LESSON_INVALID_TRANSITION').success).toBe(true)
    expect(lessonErrorCodeSchema.safeParse('LESSON_END_IN_PROGRESS').success).toBe(true)
    expect(lessonErrorCodeSchema.safeParse('LESSON_MEMORY_CONFLICT').success).toBe(true)
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
    expect(lessonSessionSchema.parse(session).currentState).toBe('probing')
    expect(lessonSessionSchema.parse(session).masteryEvidence).toHaveLength(1)
    expect(
      lessonSessionSchema.safeParse({
        ...session,
        masteryEvidence: [{ ...session.masteryEvidence[0], confidence: 2 }],
      }).success,
    ).toBe(false)
    expect(
      lessonSessionSchema.safeParse({
        ...session,
        messages: [
          {
            ...session.messages[0],
            tutorTurn: {
              ...session.messages[0].tutorTurn,
              citations: [
                {
                  ...session.messages[0].tutorTurn.citations[0],
                  pageNumberStart: 3,
                  pageNumberEnd: 2,
                },
              ],
            },
          },
        ],
      }).success,
    ).toBe(false)
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
        messages: [
          {
            ...session.messages[0],
            tutorTurn: { ...session.messages[0].tutorTurn, debugReasoning: 'private' },
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      lessonSessionSchema.safeParse({
        ...session,
        messages: [
          {
            ...session.messages[0],
            tutorTurn: { ...session.messages[0].tutorTurn, narration: '   ' },
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      lessonSessionSchema.safeParse({
        ...session,
        modelRuns: [{ ...session.modelRuns[0], inputSummary: { plainText: 'full text' } }],
      }).success,
    ).toBe(false)
  })

  it('validates paper lesson dto payloads', () => {
    expect(
      lessonSessionSchema.parse({
        id: '00000000-0000-4000-8000-000000000101',
        title: 'Paper Map 课堂',
        status: 'active',
        documentId: '00000000-0000-4000-8000-000000000201',
        documentTitle: 'Paper Map',
        sourceAnchors: [
          {
            id: '00000000-0000-4000-8000-000000000301',
            documentId: '00000000-0000-4000-8000-000000000201',
            startOffset: 4,
            endOffset: 12,
            snippet: 'Evidence',
            target: { kind: 'text_range' },
          },
        ],
        messages: [],
        modelRuns: [],
        currentState: 'opening',
        steps: [],
        masteryEvidence: [],
        misconceptionSignals: [],
        reviewItems: [],
        reviewEvents: [],
        lessonMode: 'paper',
        paperProfile: {
          currentStage: 'orientation',
          stageSummary: 'The learner has only a rough intuition so far.',
          termsIntroduced: ['Transformer'],
          citedAnchorIds: ['00000000-0000-4000-8000-000000000301'],
        },
        createdAt: '2026-07-13T00:00:00.000Z',
        updatedAt: '2026-07-13T00:00:00.000Z',
      }).lessonMode,
    ).toBe('paper')
  })

  it('validates review item and review event dto payloads', () => {
    expect(
      lessonReviewItemSchema.parse({
        id: reviewItemId,
        lessonId,
        masteryEvidenceId: evidenceId,
        misconceptionSignalId: null,
        prompt: '复习：请重新解释这段课堂证据，并说明你的判断依据。',
        answerOutline: ['先说明证据', '再说明判断依据'],
        status: 'active',
        dueAt: '2026-07-14T00:00:00.000Z',
        createdAt: '2026-07-13T00:00:00.000Z',
        updatedAt: '2026-07-13T00:00:00.000Z',
      }).status,
    ).toBe('active')

    expect(
      lessonReviewEventSchema.parse({
        id: reviewEventId,
        reviewItemId,
        lessonId,
        rating: 'forgot',
        response: 'I still mix up the rationale.',
        previousDueAt: '2026-07-14T00:00:00.000Z',
        nextDueAt: '2026-07-15T09:00:00.000Z',
        reviewedAt: '2026-07-14T09:00:00.000Z',
        createdAt: '2026-07-14T09:00:00.000Z',
      }).rating,
    ).toBe('forgot')

    expect(() =>
      lessonRecordReviewDraftSchema.parse({
        lessonId,
        reviewItemId,
        rating: 'remembered',
        response: '   ',
      }),
    ).toThrow()
  })

  it('validates lesson step DTO status fields', () => {
    expect(lessonStepSchema.safeParse(session.steps[0]).success).toBe(true)
    expect(
      lessonStepSchema.safeParse({
        ...session.steps[0],
        status: 'succeeded',
        errorSummary: {
          code: 'INTERNAL_ERROR',
          message: 'The lesson operation could not be completed.',
          retryable: true,
        },
      }).success,
    ).toBe(false)
    expect(
      lessonStepSchema.safeParse({
        ...session.steps[0],
        status: 'started',
        messageId: null,
        rationale: null,
        finishedAt: null,
      }).success,
    ).toBe(true)
    expect(
      lessonStepSchema.safeParse({
        ...session.steps[0],
        actionType: 'dance',
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
