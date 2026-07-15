import { describe, expect, it } from 'vitest'

import {
  assertLessonLifecycleTransition,
  normalizeDocumentLearningMemory,
  normalizeLessonMemory,
} from './lesson'

const lessonId = '00000000-0000-4000-8000-000000000101'
const documentId = '00000000-0000-4000-8000-000000000201'

describe('lesson lifecycle', () => {
  it.each([
    ['preparing', 'active'],
    ['active', 'summarizing'],
    ['summarizing', 'pending_review'],
    ['pending_review', 'reviewing'],
    ['reviewing', 'completed'],
    ['active', 'paused'],
    ['paused', 'active'],
    ['active', 'error'],
    ['error', 'active'],
  ] as const)('allows %s → %s', (from, to) => {
    expect(() => assertLessonLifecycleTransition(from, to)).not.toThrow()
  })

  it.each([
    ['active', 'completed'],
    ['summarizing', 'completed'],
    ['pending_review', 'completed'],
    ['completed', 'active'],
  ] as const)('rejects %s → %s so review cannot be bypassed', (from, to) => {
    expect(() => assertLessonLifecycleTransition(from, to)).toThrow('transition')
  })

  it('normalizes structured lesson memory and deduplicates durable facts', () => {
    expect(
      normalizeLessonMemory({
        lessonId,
        documentId,
        topic: ' Attention ',
        coverage: ' pages 1–4 ',
        summaryMarkdown: ' **Summary** ',
        mastered: ['query-key mapping', 'query-key mapping'],
        unstable: ['multi-head dimensions'],
        misconceptions: ['attention is only weighting'],
        sourceAnchorIds: ['anchor-1', 'anchor-1'],
        figureIds: ['figure-1'],
        unresolvedQuestions: ['why scale by sqrt(d)?'],
        reviewPrompts: ['请解释缩放点积注意力。'],
        nextLessonStart: 'derive scaled dot-product attention',
        createdAt: '2026-07-15T00:00:00.000Z',
      }),
    ).toMatchObject({
      topic: 'Attention',
      coverage: 'pages 1–4',
      summaryMarkdown: '**Summary**',
      mastered: ['query-key mapping'],
      sourceAnchorIds: ['anchor-1'],
      reviewPrompts: ['请解释缩放点积注意力。'],
    })
  })

  it('requires cumulative document memory to advance revisions and preserve lesson lineage', () => {
    expect(
      normalizeDocumentLearningMemory({
        documentId,
        revision: 2,
        summaryMarkdown: ' Cumulative memory ',
        mastered: ['attention basics'],
        unstable: [],
        misconceptions: [],
        unresolvedQuestions: ['scaling'],
        nextLessonStart: 'scaling',
        sourceLessonIds: [lessonId, lessonId],
        updatedAt: '2026-07-15T00:01:00.000Z',
      }),
    ).toMatchObject({
      revision: 2,
      summaryMarkdown: 'Cumulative memory',
      sourceLessonIds: [lessonId],
    })
    expect(() =>
      normalizeDocumentLearningMemory({
        documentId,
        revision: 0,
        summaryMarkdown: 'memory',
        mastered: [],
        unstable: [],
        misconceptions: [],
        unresolvedQuestions: [],
        nextLessonStart: 'next',
        sourceLessonIds: [lessonId],
        updatedAt: '2026-07-15T00:01:00.000Z',
      }),
    ).toThrow('revision')
  })
})
