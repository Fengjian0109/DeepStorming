import type { LessonMemoryGenerationResult } from './lesson-ports'

export class LessonMemoryValidationError extends Error {}

type RecordValue = Record<string, unknown>

const objectWithKeys = (value: unknown, keys: readonly string[]): RecordValue => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LessonMemoryValidationError('Expected an object.')
  }
  const record = value as RecordValue
  if (
    Object.keys(record).length !== keys.length ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(record, key))
  ) {
    throw new LessonMemoryValidationError('Object fields are invalid.')
  }
  return record
}

const text = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new LessonMemoryValidationError('Text field is invalid.')
  }
  return value.trim()
}

const textList = (value: unknown, maxItems = 24, maxText = 500): readonly string[] => {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new LessonMemoryValidationError('List field is invalid.')
  }
  return value.map((item) => text(item, maxText))
}

const LESSON_KEYS = [
  'topic',
  'coverage',
  'summaryMarkdown',
  'mastered',
  'unstable',
  'misconceptions',
  'sourceAnchorIds',
  'figureIds',
  'unresolvedQuestions',
  'reviewPrompts',
  'nextLessonStart',
] as const

const DOCUMENT_KEYS = [
  'summaryMarkdown',
  'mastered',
  'unstable',
  'misconceptions',
  'unresolvedQuestions',
  'nextLessonStart',
] as const

export const parseLessonMemoryCandidate = (content: string): LessonMemoryGenerationResult => {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new LessonMemoryValidationError('Memory output is not JSON.')
  }
  const root = objectWithKeys(parsed, ['lessonMemory', 'documentMemory'])
  const lesson = objectWithKeys(root['lessonMemory'], LESSON_KEYS)
  const document = objectWithKeys(root['documentMemory'], DOCUMENT_KEYS)
  return {
    lessonMemory: {
      topic: text(lesson['topic'], 240),
      coverage: text(lesson['coverage'], 500),
      summaryMarkdown: text(lesson['summaryMarkdown'], 8_000),
      mastered: textList(lesson['mastered']),
      unstable: textList(lesson['unstable']),
      misconceptions: textList(lesson['misconceptions']),
      sourceAnchorIds: textList(lesson['sourceAnchorIds'], 24, 200),
      figureIds: textList(lesson['figureIds'], 24, 200),
      unresolvedQuestions: textList(lesson['unresolvedQuestions']),
      reviewPrompts: textList(lesson['reviewPrompts'], 8),
      nextLessonStart: text(lesson['nextLessonStart'], 1_000),
    },
    documentMemory: {
      summaryMarkdown: text(document['summaryMarkdown'], 8_000),
      mastered: textList(document['mastered']),
      unstable: textList(document['unstable']),
      misconceptions: textList(document['misconceptions']),
      unresolvedQuestions: textList(document['unresolvedQuestions']),
      nextLessonStart: text(document['nextLessonStart'], 1_000),
    },
  }
}
