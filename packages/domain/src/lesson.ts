export const LESSON_SESSION_STATUSES = ['active', 'archived'] as const
export const LESSON_MESSAGE_ROLES = ['system', 'tutor', 'learner'] as const
export const LESSON_MODEL_RUN_STATUSES = ['started', 'succeeded', 'failed', 'cancelled'] as const

export type LessonSessionStatus = (typeof LESSON_SESSION_STATUSES)[number]
export type LessonMessageRole = (typeof LESSON_MESSAGE_ROLES)[number]
export type LessonModelRunStatus = (typeof LESSON_MODEL_RUN_STATUSES)[number]

export type LessonSourceTarget =
  | Readonly<{ kind: 'text_range' }>
  | Readonly<{
      kind: 'pdf_block'
      pageNumber: number
      blockId: string
      blockIndex: number
    }>

export type LessonSourceAnchor = Readonly<{
  id: string
  documentId: string
  startOffset: number
  endOffset: number
  snippet: string
  target?: LessonSourceTarget | undefined
}>

export type LessonSession = Readonly<{
  id: string
  title: string
  status: LessonSessionStatus
  documentId: string
  documentTitle: string
  sourceAnchors: readonly LessonSourceAnchor[]
  messages: readonly LessonMessage[]
  modelRuns: readonly LessonModelRun[]
  createdAt: string
  updatedAt: string
}>

export type LessonMessage = Readonly<{
  id: string
  lessonId: string
  modelRunId: string | null
  role: LessonMessageRole
  content: string
  sourceAnchorIds: readonly string[]
  promptVersion: string
  createdAt: string
}>

export type LessonPromptManifest = Readonly<{
  key: string
  version: number
  hash: string
}>

export type LessonModelRunInputSummary = Readonly<{
  documentId: string
  documentTitle: string
  sourceAnchorIds: readonly string[]
  sourceCharacterRange: Readonly<{
    startOffset: number
    endOffset: number
  }>
  snippetCharacterCount: number
  contextCharacterCount: number
  contextChunks: readonly LessonContextChunkSummary[]
  learnerReplyCharacterCount?: number
}>

export type LessonContextChunkSummary = Readonly<{
  chunkId: string
  pageNumberStart: number
  pageNumberEnd: number
  charCount: number
}>

export type LessonModelRunErrorSummary = Readonly<{
  code: string
  message: string
  retryable: boolean
}>

export type LessonModelRun = Readonly<{
  id: string
  lessonId: string
  providerId: string | null
  modelName: string
  operation: 'lesson_tutor_first_question' | 'lesson_tutor_follow_up'
  status: LessonModelRunStatus
  promptManifest: LessonPromptManifest
  inputSummary: LessonModelRunInputSummary
  sourceAnchorIds: readonly string[]
  outputMessageId: string | null
  errorSummary: LessonModelRunErrorSummary | null
  startedAt: string
  finishedAt: string | null
}>

export type LessonReplyDraft = Readonly<{
  lessonId: string
  content: string
  operationId?: string
}>

export type LessonRunRetryDraft = Readonly<{
  lessonId: string
  modelRunId: string
  operationId?: string
}>

export type LessonStartDraft = Readonly<{
  documentId: string
  documentTitle: string
  title?: string
  source: Readonly<{
    startOffset: number
    endOffset: number
    snippet: string
    target?: LessonSourceTarget | undefined
  }>
}>

export type NormalizedLessonStartDraft = Readonly<{
  documentId: string
  documentTitle: string
  title: string
  source: Readonly<{
    startOffset: number
    endOffset: number
    snippet: string
    target: LessonSourceTarget
  }>
}>

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu

const normalizeNonBlank = (value: string, message: string): string => {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(message)
  return normalized
}

export const normalizeLessonContextChunkSummary = (
  summary: LessonContextChunkSummary,
): LessonContextChunkSummary => {
  if (!UUID.test(summary.chunkId)) throw new Error('Lesson context chunk id is invalid')
  if (!Number.isInteger(summary.pageNumberStart) || summary.pageNumberStart < 1) {
    throw new Error('Lesson context chunk page range is invalid')
  }
  if (!Number.isInteger(summary.pageNumberEnd) || summary.pageNumberEnd < summary.pageNumberStart) {
    throw new Error('Lesson context chunk page range is invalid')
  }
  if (!Number.isInteger(summary.charCount) || summary.charCount < 0) {
    throw new Error('Lesson context chunk character count is invalid')
  }

  return summary
}

export const normalizeLessonModelRunInputSummary = (
  summary: LessonModelRunInputSummary,
): LessonModelRunInputSummary => {
  if (!UUID.test(summary.documentId)) throw new Error('Lesson model run document id is invalid')
  if (
    summary.sourceAnchorIds.length === 0 ||
    summary.sourceAnchorIds.some((id) => !UUID.test(id))
  ) {
    throw new Error('Lesson model run source anchors are invalid')
  }
  if (
    !Number.isInteger(summary.sourceCharacterRange.startOffset) ||
    summary.sourceCharacterRange.startOffset < 0
  ) {
    throw new Error('Lesson model run source character range is invalid')
  }
  if (
    !Number.isInteger(summary.sourceCharacterRange.endOffset) ||
    summary.sourceCharacterRange.endOffset <= summary.sourceCharacterRange.startOffset
  ) {
    throw new Error('Lesson model run source character range is invalid')
  }
  if (!Number.isInteger(summary.snippetCharacterCount) || summary.snippetCharacterCount < 0) {
    throw new Error('Lesson snippet character count is invalid')
  }
  if (!Number.isInteger(summary.contextCharacterCount) || summary.contextCharacterCount < 0) {
    throw new Error('Lesson context character count is invalid')
  }
  if (
    summary.learnerReplyCharacterCount !== undefined &&
    (!Number.isInteger(summary.learnerReplyCharacterCount) ||
      summary.learnerReplyCharacterCount < 0)
  ) {
    throw new Error('Lesson learner reply character count is invalid')
  }

  const normalizedContextChunks = summary.contextChunks.map(normalizeLessonContextChunkSummary)
  const contextCharacterCount = normalizedContextChunks.reduce(
    (total, chunk) => total + chunk.charCount,
    0,
  )
  if (summary.contextCharacterCount !== contextCharacterCount) {
    throw new Error('Lesson context character count is invalid')
  }

  return {
    ...summary,
    documentTitle: normalizeNonBlank(
      summary.documentTitle,
      'Lesson model run document title must not be blank',
    ),
    contextChunks: normalizedContextChunks,
  }
}

export const normalizeLessonStartDraft = (draft: LessonStartDraft): NormalizedLessonStartDraft => {
  if (!UUID.test(draft.documentId)) throw new Error('Lesson document id is invalid')
  if (!Number.isInteger(draft.source.startOffset) || draft.source.startOffset < 0) {
    throw new Error('Lesson source start offset is invalid')
  }
  if (
    !Number.isInteger(draft.source.endOffset) ||
    draft.source.endOffset <= draft.source.startOffset
  ) {
    throw new Error('Lesson source end offset must be greater than start offset')
  }

  const documentTitle = normalizeNonBlank(
    draft.documentTitle,
    'Lesson document title must not be blank',
  )
  const title =
    draft.title === undefined
      ? `${documentTitle} 课堂`
      : normalizeNonBlank(draft.title, 'Lesson title must not be blank')

  const target = draft.source.target ?? { kind: 'text_range' as const }
  if (target.kind === 'pdf_block') {
    if (!Number.isInteger(target.pageNumber) || target.pageNumber < 1) {
      throw new Error('Lesson source PDF page number is invalid')
    }
    if (!Number.isInteger(target.blockIndex) || target.blockIndex < 0) {
      throw new Error('Lesson source PDF block index is invalid')
    }
    if (target.blockId.trim().length === 0) {
      throw new Error('Lesson source PDF block id must not be blank')
    }
  }

  return {
    documentId: draft.documentId,
    documentTitle,
    title,
    source: {
      startOffset: draft.source.startOffset,
      endOffset: draft.source.endOffset,
      snippet: normalizeNonBlank(draft.source.snippet, 'Lesson source snippet must not be blank'),
      target,
    },
  }
}
