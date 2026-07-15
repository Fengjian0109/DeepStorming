import { describe, expect, it } from 'vitest'
import { LessonMemoryValidationError, parseLessonMemoryCandidate } from './lesson-memory-validation'

const candidate = {
  lessonMemory: {
    topic: 'Attention',
    coverage: 'Pages 1–4',
    summaryMarkdown: 'Summary',
    mastered: ['mapping'],
    unstable: ['scaling'],
    misconceptions: [],
    sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
    figureIds: ['figure-1'],
    unresolvedQuestions: ['why scale?'],
    reviewPrompts: ['请解释缩放。'],
    nextLessonStart: 'derive scaling',
  },
  documentMemory: {
    summaryMarkdown: 'Cumulative summary',
    mastered: ['mapping'],
    unstable: ['scaling'],
    misconceptions: [],
    unresolvedQuestions: ['why scale?'],
    nextLessonStart: 'derive scaling',
  },
}

describe('parseLessonMemoryCandidate', () => {
  it('accepts the exact structured memory result', () => {
    expect(parseLessonMemoryCandidate(JSON.stringify(candidate))).toEqual(candidate)
  })

  it.each([
    '{}',
    JSON.stringify({ ...candidate, extra: true }),
    JSON.stringify({ ...candidate, lessonMemory: { ...candidate.lessonMemory, topic: ' ' } }),
    JSON.stringify({
      ...candidate,
      lessonMemory: { ...candidate.lessonMemory, reviewPrompts: Array(9).fill('review') },
    }),
  ])('rejects malformed or non-exact output', (value) => {
    expect(() => parseLessonMemoryCandidate(value)).toThrow(LessonMemoryValidationError)
  })
})
