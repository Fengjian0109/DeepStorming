import { describe, expect, it } from 'vitest'
import {
  LESSON_MESSAGE_ROLES,
  LESSON_MODEL_RUN_STATUSES,
  LESSON_SESSION_STATUSES,
  normalizeLessonStartDraft,
} from './lesson'

describe('lesson domain', () => {
  it('normalizes a lesson start draft with a source anchor', () => {
    expect(
      normalizeLessonStartDraft({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: '  Paper Map  ',
        source: {
          startOffset: 4,
          endOffset: 12,
          snippet: '  Evidence snippet  ',
        },
      }),
    ).toEqual({
      documentId: '00000000-0000-4000-8000-000000000001',
      title: 'Paper Map 课堂',
      documentTitle: 'Paper Map',
      source: {
        startOffset: 4,
        endOffset: 12,
        snippet: 'Evidence snippet',
        target: { kind: 'text_range' },
      },
    })
  })

  it('normalizes a pdf block target', () => {
    expect(
      normalizeLessonStartDraft({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: 'Paper',
        source: {
          startOffset: 0,
          endOffset: 8,
          snippet: 'Evidence',
          target: { kind: 'pdf_block', pageNumber: 2, blockId: 'p2-b1', blockIndex: 1 },
        },
      }),
    ).toMatchObject({
      source: {
        target: { kind: 'pdf_block', pageNumber: 2, blockId: 'p2-b1', blockIndex: 1 },
      },
    })
  })

  it('rejects invalid pdf block targets', () => {
    expect(() =>
      normalizeLessonStartDraft({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: 'Paper',
        source: {
          startOffset: 0,
          endOffset: 8,
          snippet: 'Evidence',
          target: { kind: 'pdf_block', pageNumber: 0, blockId: 'p0-b1', blockIndex: 0 },
        },
      }),
    ).toThrow('Lesson source PDF page number is invalid')
  })

  it('rejects invalid lesson anchors', () => {
    expect(() =>
      normalizeLessonStartDraft({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: 'Paper',
        source: { startOffset: 12, endOffset: 4, snippet: 'Evidence' },
      }),
    ).toThrow('Lesson source end offset must be greater than start offset')
    expect(() =>
      normalizeLessonStartDraft({
        documentId: '00000000-0000-4000-8000-000000000001',
        documentTitle: 'Paper',
        source: { startOffset: 0, endOffset: 4, snippet: '   ' },
      }),
    ).toThrow('Lesson source snippet must not be blank')
  })

  it('defines the accepted lesson session statuses', () => {
    expect(LESSON_SESSION_STATUSES).toEqual(['active', 'archived'])
  })

  it('defines the accepted lesson message roles', () => {
    expect(LESSON_MESSAGE_ROLES).toEqual(['system', 'tutor', 'learner'])
  })

  it('defines the accepted lesson model run statuses', () => {
    expect(LESSON_MODEL_RUN_STATUSES).toEqual(['started', 'succeeded', 'failed', 'cancelled'])
  })
})
