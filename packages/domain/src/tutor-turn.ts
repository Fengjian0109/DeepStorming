export type TutorCitation = Readonly<{
  chunkId: string
  quote: string
  rationale: string
}>

export type TutorFigureReference = Readonly<{
  figureId: string
  rationale: string
}>

export type TutorTurn = Readonly<{
  narration: string | null
  responseMarkdown: string
  citations: readonly TutorCitation[]
  figureReferences: readonly TutorFigureReference[]
}>

const required = (value: string, message: string, max: number): string => {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(message)
  if (normalized.length > max) throw new Error(message)
  return normalized
}

export const normalizeTutorTurn = (turn: TutorTurn): TutorTurn => {
  const narration = turn.narration?.trim() || null
  if (narration !== null && narration.length > 1_000) {
    throw new Error('Tutor narration is too long')
  }
  if (turn.citations.length > 8) throw new Error('Tutor citations are too many')
  if (turn.figureReferences.length > 4) throw new Error('Tutor figure references are too many')

  const citations = turn.citations.map((citation) => ({
    chunkId: required(citation.chunkId, 'Tutor citation chunk is invalid', 200),
    quote: required(citation.quote, 'Tutor citation quote is invalid', 1_000),
    rationale: required(citation.rationale, 'Tutor citation rationale is invalid', 500),
  }))
  if (new Set(citations.map((citation) => citation.chunkId)).size !== citations.length) {
    throw new Error('Tutor citations must be unique')
  }

  const figureReferences = turn.figureReferences.map((reference) => ({
    figureId: required(reference.figureId, 'Tutor figure reference is invalid', 200),
    rationale: required(reference.rationale, 'Tutor figure rationale is invalid', 500),
  }))
  if (
    new Set(figureReferences.map((reference) => reference.figureId)).size !==
    figureReferences.length
  ) {
    throw new Error('Tutor figure references must be unique')
  }

  return {
    narration,
    responseMarkdown: required(turn.responseMarkdown, 'Tutor response must not be blank', 8_000),
    citations,
    figureReferences,
  }
}
