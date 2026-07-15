export type ContextBudget = Readonly<{
  modelName: string
  contextWindowTokens: number
  estimatedInputTokens: number
  reservedOutputTokens: number
  remainingTokens: number
  remainingPercent: number
  thresholdPercent: number
  shouldCompress: boolean
  hardLimitReached: boolean
}>

export const contextWindowForModel = (modelName: string): number => {
  const normalized = modelName.trim().toLowerCase()
  if (normalized.includes('mock-4k')) return 4_096
  if (normalized.includes('deepseek')) return 65_536
  if (normalized.includes('claude')) return 200_000
  if (normalized.includes('gpt-4.1')) return 1_047_576
  return 128_000
}

export const estimateTextTokens = (text: string): number => {
  let cjk = 0
  let other = 0
  for (const character of text) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character))
      cjk += 1
    else other += 1
  }
  return Math.max(1, cjk + Math.ceil(other / 4))
}

export const calculateContextBudget = (
  input: Readonly<{
    modelName: string
    estimatedInputTokens: number
    reservedOutputTokens: number
    thresholdPercent?: number
  }>,
): ContextBudget => {
  const thresholdPercent = input.thresholdPercent ?? 30
  if (!Number.isInteger(thresholdPercent) || thresholdPercent < 10 || thresholdPercent > 50)
    throw new Error('Context compression threshold must be between 10 and 50 percent')
  if (
    !Number.isInteger(input.estimatedInputTokens) ||
    input.estimatedInputTokens < 0 ||
    !Number.isInteger(input.reservedOutputTokens) ||
    input.reservedOutputTokens < 1
  )
    throw new Error('Context token estimate is invalid')
  const contextWindowTokens = contextWindowForModel(input.modelName)
  const remainingTokens =
    contextWindowTokens - input.estimatedInputTokens - input.reservedOutputTokens
  const remainingPercent = Math.max(
    0,
    Math.round((remainingTokens / contextWindowTokens) * 10_000) / 100,
  )
  return {
    modelName: input.modelName,
    contextWindowTokens,
    estimatedInputTokens: input.estimatedInputTokens,
    reservedOutputTokens: input.reservedOutputTokens,
    remainingTokens,
    remainingPercent,
    thresholdPercent,
    shouldCompress: remainingPercent <= thresholdPercent,
    hardLimitReached: remainingTokens <= 0,
  }
}

export const selectRecentMessageIds = <Message extends Readonly<{ id: string }>>(
  messages: readonly Message[],
  recentTurnCount: number,
): readonly string[] => {
  if (!Number.isInteger(recentTurnCount) || recentTurnCount < 1 || recentTurnCount > 50)
    throw new Error('Recent turn count is invalid')
  return messages.slice(-recentTurnCount).map((message) => message.id)
}
