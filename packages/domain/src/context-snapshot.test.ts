import { describe, expect, it } from 'vitest'
import { normalizeContextSnapshot } from './context-snapshot'

const draft = {
  id: '00000000-0000-4000-8000-000000000101',
  lessonId: '00000000-0000-4000-8000-000000000201',
  version: 1,
  modelName: 'deepseek-chat',
  contextWindowTokens: 65_536,
  estimatedInputTokens: 44_000,
  reservedOutputTokens: 2_000,
  remainingTokens: 19_536,
  remainingPercent: 29.81,
  thresholdPercent: 30,
  coveredMessageIds: ['m1', 'm2', 'm3'],
  preservedRecentMessageIds: ['m2', 'm3'],
  summaryMarkdown: '已压缩的课堂上下文。',
  facts: ['Attention maps queries to values.'],
  mastery: ['query-key matching'],
  misconceptions: [],
  unresolvedQuestions: ['why scaling?'],
  sourceAnchorIds: ['anchor-1'],
  figureIds: ['figure-1'],
  createdAt: '2026-07-15T02:00:00.000Z',
}

describe('normalizeContextSnapshot', () => {
  it('normalizes an immutable auditable snapshot', () => {
    expect(normalizeContextSnapshot(draft)).toEqual(draft)
  })

  it('rejects recent messages outside the covered range and invalid thresholds', () => {
    expect(() =>
      normalizeContextSnapshot({ ...draft, preservedRecentMessageIds: ['foreign'] }),
    ).toThrow('preserved')
    expect(() => normalizeContextSnapshot({ ...draft, thresholdPercent: 51 })).toThrow('threshold')
  })
})
