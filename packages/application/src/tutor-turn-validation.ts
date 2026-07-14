import { normalizeTutorTurn, type TutorTurn } from '@deepstorming/domain'

import type { LessonTutorContextChunk } from './lesson-ports'

export class TutorTurnValidationError extends Error {
  public override readonly name = 'TutorTurnValidationError'
}

const objectRecord = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TutorTurnValidationError('Tutor turn must be an object.')
  }
  return value as Record<string, unknown>
}

const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): void => {
  if (
    Object.keys(value).length !== keys.length ||
    !Object.keys(value).every((key) => keys.includes(key))
  ) {
    throw new TutorTurnValidationError('Tutor turn contains unknown or missing fields.')
  }
}

const stringField = (value: unknown, field: string): string => {
  if (typeof value !== 'string') throw new TutorTurnValidationError(`${field} must be text.`)
  return value
}

const normalizeComparable = (value: string): string => value.replace(/\s+/gu, ' ').trim()

export const parseTutorTurnCandidate = (
  candidate: string,
  ownership: Readonly<{
    contextChunks: readonly LessonTutorContextChunk[]
    allowedFigureIds: readonly string[]
  }>,
): TutorTurn => {
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    throw new TutorTurnValidationError('Tutor turn is not valid JSON.')
  }

  try {
    const record = objectRecord(parsed)
    exactKeys(record, ['narration', 'responseMarkdown', 'citations', 'figureReferences'])
    if (record['narration'] !== null && typeof record['narration'] !== 'string') {
      throw new TutorTurnValidationError('Tutor narration must be text or null.')
    }
    if (!Array.isArray(record['citations']) || !Array.isArray(record['figureReferences'])) {
      throw new TutorTurnValidationError('Tutor references must be arrays.')
    }
    const citations = record['citations'].map((value) => {
      const citation = objectRecord(value)
      exactKeys(citation, ['chunkId', 'quote', 'rationale'])
      return {
        chunkId: stringField(citation['chunkId'], 'Citation chunk id'),
        quote: stringField(citation['quote'], 'Citation quote'),
        rationale: stringField(citation['rationale'], 'Citation rationale'),
      }
    })
    const figureReferences = record['figureReferences'].map((value) => {
      const reference = objectRecord(value)
      exactKeys(reference, ['figureId', 'rationale'])
      return {
        figureId: stringField(reference['figureId'], 'Figure id'),
        rationale: stringField(reference['rationale'], 'Figure rationale'),
      }
    })
    const turn = normalizeTutorTurn({
      narration: record['narration'] as string | null,
      responseMarkdown: stringField(record['responseMarkdown'], 'Tutor response'),
      citations,
      figureReferences,
    })

    const chunks = new Map(ownership.contextChunks.map((chunk) => [chunk.chunkId, chunk]))
    const verifiedCitations = turn.citations.map((citation) => {
      const chunk = chunks.get(citation.chunkId)
      if (chunk === undefined) {
        throw new TutorTurnValidationError('Tutor citation does not belong to this request.')
      }
      if (!normalizeComparable(chunk.text).includes(normalizeComparable(citation.quote))) {
        throw new TutorTurnValidationError('Tutor citation quote cannot be verified.')
      }
      return {
        ...citation,
        pageNumberStart: chunk.pageNumberStart,
        pageNumberEnd: chunk.pageNumberEnd,
      }
    })
    const figures = new Set(ownership.allowedFigureIds)
    for (const reference of turn.figureReferences) {
      if (!figures.has(reference.figureId)) {
        throw new TutorTurnValidationError('Tutor figure does not belong to this request.')
      }
    }
    return { ...turn, citations: verifiedCitations }
  } catch (error) {
    if (error instanceof TutorTurnValidationError) throw error
    throw new TutorTurnValidationError('Tutor turn failed validation.')
  }
}
