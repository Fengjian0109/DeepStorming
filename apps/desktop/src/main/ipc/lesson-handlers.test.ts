import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LessonUseCaseError } from '@deepstorming/application'
import { createLessonIpcHandlers, type LessonIpcDependencies } from './lesson-handlers'

const requestId = '00000000-0000-4000-8000-000000000001'
const lessonId = '00000000-0000-4000-8000-000000000101'
const documentId = '00000000-0000-4000-8000-000000000201'

const session = {
  id: lessonId,
  title: 'Paper Map 课堂',
  status: 'active' as const,
  documentId,
  documentTitle: 'Paper Map',
  sourceAnchors: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      documentId,
      startOffset: 4,
      endOffset: 12,
      snippet: 'Evidence',
    },
  ],
  messages: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      lessonId,
      modelRunId: '00000000-0000-4000-8000-000000000501',
      role: 'tutor' as const,
      content: '我们先从《Paper Map》的这段证据开始：Evidence\n\n你觉得它想解决的核心问题是什么？',
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      promptVersion: 'mock-tutor-v1',
      createdAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  modelRuns: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      lessonId,
      providerId: null,
      modelName: 'mock-local',
      operation: 'lesson_tutor_first_question' as const,
      status: 'succeeded' as const,
      promptManifest: {
        key: 'lesson.mockTutor.firstQuestion',
        version: 1,
        hash: 'sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff',
      },
      inputSummary: {
        documentId,
        documentTitle: 'Paper Map',
        sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
        sourceCharacterRange: { startOffset: 4, endOffset: 12 },
        snippetCharacterCount: 8,
        contextCharacterCount: 144,
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000601',
            pageNumberStart: 1,
            pageNumberEnd: 1,
            charCount: 144,
          },
        ],
      },
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      outputMessageId: '00000000-0000-4000-8000-000000000401',
      errorSummary: null,
      startedAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  currentState: 'probing' as const,
  steps: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      lessonId,
      sequenceNo: 0,
      stateBefore: 'opening' as const,
      stateAfter: 'probing' as const,
      actionType: 'ask' as const,
      status: 'succeeded' as const,
      modelRunId: '00000000-0000-4000-8000-000000000501',
      messageId: '00000000-0000-4000-8000-000000000401',
      rationale: 'Started with a source-grounded opening question.',
      errorSummary: null,
      createdAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  masteryEvidence: [],
  misconceptionSignals: [],
  reviewItems: [],
  reviewEvents: [],
  lessonMode: 'standard' as const,
  paperProfile: null,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

const dependencies = () => ({
  listLessonSessions: { execute: vi.fn().mockResolvedValue([session]) },
  startLessonFromDocument: { execute: vi.fn().mockResolvedValue(session) },
  getLessonSession: { execute: vi.fn().mockResolvedValue(session) },
  submitLessonReply: { execute: vi.fn().mockResolvedValue(session) },
  retryLessonRun: { execute: vi.fn().mockResolvedValue(session) },
  cancelLessonRun: { execute: vi.fn().mockReturnValue({ cancelled: true }) },
  recordReviewEvent: { execute: vi.fn().mockResolvedValue(session) },
  endLesson: { execute: vi.fn().mockResolvedValue(session) },
  choosePostLessonAction: { execute: vi.fn().mockResolvedValue(session) },
  completeLessonReview: { execute: vi.fn().mockResolvedValue(session) },
  exportLessonTranscript: {
    execute: vi.fn().mockResolvedValue({
      outcome: 'exported',
      format: 'markdown',
      targetPath: '/tmp/lesson.md',
      replayed: false,
    }),
  },
  cancelLessonExport: { execute: vi.fn().mockReturnValue({ cancelled: true }) },
})

describe('lesson IPC handlers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists lesson sessions through one use case', async () => {
    const deps = dependencies()
    const result = await createLessonIpcHandlers(deps as unknown as LessonIpcDependencies).list({
      requestId,
    })

    expect(result).toEqual({ ok: true, data: [session], requestId })
    expect(deps.listLessonSessions.execute).toHaveBeenCalledTimes(1)
  })

  it('validates and exports a transcript through one use case', async () => {
    const deps = dependencies()
    const operationId = '00000000-0000-4000-8000-000000000701'
    const result = await createLessonIpcHandlers(
      deps as unknown as LessonIpcDependencies,
    ).exportTranscript({
      requestId,
      lessonId,
      operationId,
      format: 'markdown',
    })
    expect(result).toEqual({
      ok: true,
      data: {
        outcome: 'exported',
        format: 'markdown',
        targetPath: '/tmp/lesson.md',
        replayed: false,
      },
      requestId,
    })
    expect(deps.exportLessonTranscript.execute).toHaveBeenCalledWith({
      lessonId,
      operationId,
      format: 'markdown',
    })
  })

  it('starts a lesson from a document through one use case', async () => {
    const deps = dependencies()
    const result = await createLessonIpcHandlers(
      deps as unknown as LessonIpcDependencies,
    ).startFromDocument({
      requestId,
      lesson: {
        documentId,
        documentTitle: 'Paper Map',
        lessonMode: 'paper',
        source: { startOffset: 4, endOffset: 12, snippet: 'Evidence' },
      },
    })

    expect(result).toEqual({ ok: true, data: session, requestId })
    expect(deps.startLessonFromDocument.execute).toHaveBeenCalledWith({
      documentId,
      documentTitle: 'Paper Map',
      lessonMode: 'paper',
      source: { startOffset: 4, endOffset: 12, snippet: 'Evidence' },
    })
  })

  it('submits a learner reply through one use case', async () => {
    const deps = dependencies()
    const result = await createLessonIpcHandlers(deps as unknown as LessonIpcDependencies).reply({
      requestId,
      lessonId,
      content: '它在说明证据如何支撑判断。',
      operationId: '00000000-0000-4000-8000-000000000501',
    })

    expect(result).toEqual({ ok: true, data: session, requestId })
    expect(deps.submitLessonReply.execute).toHaveBeenCalledWith({
      lessonId,
      content: '它在说明证据如何支撑判断。',
      operationId: '00000000-0000-4000-8000-000000000501',
    })
  })

  it('strictly rejects blank learner replies without calling use cases', async () => {
    const deps = dependencies()
    const result = await createLessonIpcHandlers(deps as unknown as LessonIpcDependencies).reply({
      requestId,
      lessonId,
      content: '   ',
    })

    expect(result.ok).toBe(false)
    expect(deps.submitLessonReply.execute).not.toHaveBeenCalled()
  })

  it('retries a failed lesson run through one use case', async () => {
    const deps = dependencies()
    const result = await createLessonIpcHandlers(deps as unknown as LessonIpcDependencies).retryRun(
      {
        requestId,
        lessonId,
        modelRunId: '00000000-0000-4000-8000-000000000501',
        operationId: '00000000-0000-4000-8000-000000000502',
      },
    )

    expect(result).toEqual({ ok: true, data: session, requestId })
    expect(deps.retryLessonRun.execute).toHaveBeenCalledWith({
      lessonId,
      modelRunId: '00000000-0000-4000-8000-000000000501',
      operationId: '00000000-0000-4000-8000-000000000502',
    })
  })

  it('cancels a lesson run through one use case', async () => {
    const deps = dependencies()
    const result = await createLessonIpcHandlers(
      deps as unknown as LessonIpcDependencies,
    ).cancelRun({
      requestId,
      operationId: '00000000-0000-4000-8000-000000000501',
    })

    expect(result).toEqual({ ok: true, data: { cancelled: true }, requestId })
    expect(deps.cancelLessonRun.execute).toHaveBeenCalledWith({
      operationId: '00000000-0000-4000-8000-000000000501',
    })
  })

  it('records a lesson review event through one use case', async () => {
    const deps = dependencies()
    const result = await createLessonIpcHandlers(
      deps as unknown as LessonIpcDependencies,
    ).recordReview({
      requestId,
      lessonId,
      reviewItemId: '00000000-0000-4000-8000-000000000951',
      rating: 'forgot',
      response: 'I still need one more pass.',
    })

    expect(result).toEqual({ ok: true, data: session, requestId })
    expect(deps.recordReviewEvent.execute).toHaveBeenCalledWith({
      lessonId,
      reviewItemId: '00000000-0000-4000-8000-000000000951',
      rating: 'forgot',
      response: 'I still need one more pass.',
    })
  })

  it('ends a lesson and drives the explicit review gate through one use case per request', async () => {
    const deps = dependencies()
    const handlers = createLessonIpcHandlers(deps as unknown as LessonIpcDependencies)
    const operationId = '00000000-0000-4000-8000-000000000777'

    await expect(handlers.end({ requestId, lessonId, operationId })).resolves.toEqual({
      ok: true,
      data: session,
      requestId,
    })
    await expect(
      handlers.choosePostLessonAction({ requestId, lessonId, action: 'immediate_review' }),
    ).resolves.toEqual({ ok: true, data: session, requestId })
    await expect(
      handlers.completeReview({ requestId, lessonId, response: '缩放避免点积过大。' }),
    ).resolves.toEqual({ ok: true, data: session, requestId })

    expect(deps.endLesson.execute).toHaveBeenCalledWith({ lessonId, operationId })
    expect(deps.choosePostLessonAction.execute).toHaveBeenCalledWith({
      lessonId,
      action: 'immediate_review',
    })
    expect(deps.completeLessonReview.execute).toHaveBeenCalledWith({
      lessonId,
      response: '缩放避免点积过大。',
    })
  })

  it('strictly rejects malformed requests without calling use cases', async () => {
    const deps = dependencies()
    const result = await createLessonIpcHandlers(
      deps as unknown as LessonIpcDependencies,
    ).startFromDocument({
      requestId,
      lesson: {
        documentId,
        documentTitle: 'Paper Map',
        source: { startOffset: 12, endOffset: 4, snippet: 'Evidence' },
      },
    })

    expect(result.ok).toBe(false)
    expect(deps.startLessonFromDocument.execute).not.toHaveBeenCalled()
  })

  it('maps LessonUseCaseError safely', async () => {
    const deps = dependencies()
    deps.getLessonSession.execute.mockRejectedValueOnce(
      new LessonUseCaseError('LESSON_NOT_FOUND', 'The lesson was not found.', false),
    )

    const result = await createLessonIpcHandlers(deps as unknown as LessonIpcDependencies).get({
      requestId,
      id: lessonId,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'LESSON_NOT_FOUND',
        message: 'The lesson was not found.',
        retryable: false,
      },
      requestId,
    })
  })
})
