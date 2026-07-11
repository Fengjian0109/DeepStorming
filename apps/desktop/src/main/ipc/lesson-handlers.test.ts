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
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

const dependencies = () => ({
  listLessonSessions: { execute: vi.fn().mockResolvedValue([session]) },
  startLessonFromDocument: { execute: vi.fn().mockResolvedValue(session) },
  getLessonSession: { execute: vi.fn().mockResolvedValue(session) },
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

  it('starts a lesson from a document through one use case', async () => {
    const deps = dependencies()
    const result = await createLessonIpcHandlers(
      deps as unknown as LessonIpcDependencies,
    ).startFromDocument({
      requestId,
      lesson: {
        documentId,
        documentTitle: 'Paper Map',
        source: { startOffset: 4, endOffset: 12, snippet: 'Evidence' },
      },
    })

    expect(result).toEqual({ ok: true, data: session, requestId })
    expect(deps.startLessonFromDocument.execute).toHaveBeenCalledWith({
      documentId,
      documentTitle: 'Paper Map',
      source: { startOffset: 4, endOffset: 12, snippet: 'Evidence' },
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
