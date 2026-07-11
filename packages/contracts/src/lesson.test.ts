import { describe, expect, it } from 'vitest'
import {
  LESSON_CHANNELS,
  getLessonRequestSchema,
  lessonSessionResultSchema,
  lessonSessionSchema,
  lessonSessionsResultSchema,
  startLessonFromDocumentRequestSchema,
} from './lesson'

const requestId = '00000000-0000-4000-8000-000000000001'
const lessonId = '00000000-0000-4000-8000-000000000101'
const documentId = '00000000-0000-4000-8000-000000000201'
const anchorId = '00000000-0000-4000-8000-000000000301'

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
          source: { startOffset: 12, endOffset: 4, snippet: 'Evidence' },
        },
      }).success,
    ).toBe(false)
    expect(getLessonRequestSchema.safeParse({ requestId, id: lessonId }).success).toBe(true)
    expect(getLessonRequestSchema.safeParse({ requestId, id: 'not-a-uuid' }).success).toBe(false)
  })

  it('rejects full document text and SQLite internals on session DTOs', () => {
    expect(lessonSessionSchema.safeParse(session).success).toBe(true)
    expect(lessonSessionSchema.safeParse({ ...session, plainText: 'full text' }).success).toBe(
      false,
    )
    expect(lessonSessionSchema.safeParse({ ...session, contentHash: 'private' }).success).toBe(
      false,
    )
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
          code: 'LESSON_DOCUMENT_NOT_FOUND',
          message: 'Missing',
          retryable: false,
        },
      }).success,
    ).toBe(true)
  })
})
