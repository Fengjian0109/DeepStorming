import { describe, expect, it } from 'vitest'
import { calculateContextBudget, selectRecentMessageIds } from './context-budget'

describe('context budget', () => {
  it('uses model-aware windows and triggers at the default remaining 30 percent threshold', () => {
    const result = calculateContextBudget({
      modelName: 'mock-4k',
      estimatedInputTokens: 2_700,
      reservedOutputTokens: 200,
    })
    expect(result.contextWindowTokens).toBe(4_096)
    expect(result.thresholdPercent).toBe(30)
    expect(result.remainingTokens).toBe(1_196)
    expect(result.shouldCompress).toBe(true)
    expect(result.hardLimitReached).toBe(false)
  })

  it.each([10, 30, 50])('supports the configured %i percent threshold', (thresholdPercent) => {
    expect(
      calculateContextBudget({
        modelName: 'deepseek-chat',
        estimatedInputTokens: 1_000,
        reservedOutputTokens: 1_000,
        thresholdPercent,
      }).thresholdPercent,
    ).toBe(thresholdPercent)
  })

  it('rejects thresholds outside 10 to 50 percent and detects the hard limit', () => {
    expect(() =>
      calculateContextBudget({
        modelName: 'deepseek-chat',
        estimatedInputTokens: 1,
        reservedOutputTokens: 1,
        thresholdPercent: 9,
      }),
    ).toThrow('threshold')
    expect(
      calculateContextBudget({
        modelName: 'mock-4k',
        estimatedInputTokens: 4_000,
        reservedOutputTokens: 200,
      }).hardLimitReached,
    ).toBe(true)
  })

  it('preserves the configured recent raw messages without changing full history', () => {
    const messages = [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }, { id: 'm4' }]
    const original = messages.map((message) => ({ ...message }))
    expect(selectRecentMessageIds(messages, 2)).toEqual(['m3', 'm4'])
    expect(messages).toEqual(original)
  })
})
