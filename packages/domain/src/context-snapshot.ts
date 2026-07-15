export type ContextSnapshot = Readonly<{
  id: string
  lessonId: string
  version: number
  modelName: string
  contextWindowTokens: number
  estimatedInputTokens: number
  reservedOutputTokens: number
  remainingTokens: number
  remainingPercent: number
  thresholdPercent: number
  coveredMessageIds: readonly string[]
  preservedRecentMessageIds: readonly string[]
  summaryMarkdown: string
  facts: readonly string[]
  mastery: readonly string[]
  misconceptions: readonly string[]
  unresolvedQuestions: readonly string[]
  sourceAnchorIds: readonly string[]
  figureIds: readonly string[]
  createdAt: string
}>

const required = (value: string, label: string, max = 8_000): string => {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > max)
    throw new Error(`Context snapshot ${label} is invalid`)
  return normalized
}

const strings = (values: readonly string[], label: string, limit: number): readonly string[] => {
  if (values.length > limit) throw new Error(`Context snapshot ${label} is invalid`)
  const normalized = values.map((value) => required(value, label, 1_000))
  if (new Set(normalized).size !== normalized.length)
    throw new Error(`Context snapshot ${label} must be unique`)
  return normalized
}

export const normalizeContextSnapshot = (snapshot: ContextSnapshot): ContextSnapshot => {
  if (!Number.isInteger(snapshot.version) || snapshot.version < 1)
    throw new Error('Context snapshot version is invalid')
  for (const [label, value] of [
    ['context window', snapshot.contextWindowTokens],
    ['estimated input', snapshot.estimatedInputTokens],
    ['reserved output', snapshot.reservedOutputTokens],
  ] as const) {
    if (!Number.isInteger(value) || value < 0)
      throw new Error(`Context snapshot ${label} is invalid`)
  }
  if (!Number.isInteger(snapshot.remainingTokens))
    throw new Error('Context snapshot remaining tokens are invalid')
  if (
    !Number.isFinite(snapshot.remainingPercent) ||
    snapshot.remainingPercent < 0 ||
    snapshot.remainingPercent > 100
  )
    throw new Error('Context snapshot remaining percent is invalid')
  if (
    !Number.isInteger(snapshot.thresholdPercent) ||
    snapshot.thresholdPercent < 10 ||
    snapshot.thresholdPercent > 50
  )
    throw new Error('Context snapshot threshold is invalid')
  const coveredMessageIds = strings(snapshot.coveredMessageIds, 'covered messages', 10_000)
  const preservedRecentMessageIds = strings(
    snapshot.preservedRecentMessageIds,
    'preserved recent messages',
    100,
  )
  const covered = new Set(coveredMessageIds)
  if (preservedRecentMessageIds.some((id) => !covered.has(id)))
    throw new Error('Context snapshot preserved messages must be covered')
  return {
    ...snapshot,
    id: required(snapshot.id, 'id', 100),
    lessonId: required(snapshot.lessonId, 'lesson id', 100),
    modelName: required(snapshot.modelName, 'model name', 200),
    coveredMessageIds,
    preservedRecentMessageIds,
    summaryMarkdown: required(snapshot.summaryMarkdown, 'summary'),
    facts: strings(snapshot.facts, 'facts', 100),
    mastery: strings(snapshot.mastery, 'mastery', 100),
    misconceptions: strings(snapshot.misconceptions, 'misconceptions', 100),
    unresolvedQuestions: strings(snapshot.unresolvedQuestions, 'unresolved questions', 100),
    sourceAnchorIds: strings(snapshot.sourceAnchorIds, 'source anchors', 200),
    figureIds: strings(snapshot.figureIds, 'figures', 100),
    createdAt: required(snapshot.createdAt, 'created at', 100),
  }
}
