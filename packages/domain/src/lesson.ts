export const LESSON_SESSION_STATUSES = ['active', 'archived'] as const
export const LESSON_MESSAGE_ROLES = ['system', 'tutor', 'learner'] as const
export const LESSON_MODEL_RUN_STATUSES = ['started', 'succeeded', 'failed', 'cancelled'] as const
export const LESSON_STATES = [
  'opening',
  'probing',
  'hinting',
  'explaining',
  'reflecting',
  'summarizing',
  'completed',
  'paused',
  'error',
] as const
export const TUTOR_ACTION_TYPES = ['ask', 'hint', 'explain', 'reflect', 'summarize'] as const
export const LESSON_STEP_STATUSES = ['started', 'succeeded', 'failed', 'cancelled'] as const

export type LessonSessionStatus = (typeof LESSON_SESSION_STATUSES)[number]
export type LessonMessageRole = (typeof LESSON_MESSAGE_ROLES)[number]
export type LessonModelRunStatus = (typeof LESSON_MODEL_RUN_STATUSES)[number]
export type LessonState = (typeof LESSON_STATES)[number]
export type TutorActionType = (typeof TUTOR_ACTION_TYPES)[number]
export type LessonStepStatus = (typeof LESSON_STEP_STATUSES)[number]

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

export type TutorAction = Readonly<{
  actionType: TutorActionType
  stateBefore: LessonState
  stateAfter: LessonState
  utterance: string
  citedChunkIds: readonly string[]
  rationale: string
}>

export type LessonStep = Readonly<{
  id: string
  lessonId: string
  sequenceNo: number
  stateBefore: LessonState
  stateAfter: LessonState
  actionType: TutorActionType
  status: LessonStepStatus
  modelRunId: string
  messageId: string | null
  rationale: string | null
  errorSummary: LessonModelRunErrorSummary | null
  createdAt: string
  finishedAt: string | null
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

const includes = <Value extends string>(values: readonly Value[], value: string): value is Value =>
  values.includes(value as Value)

const VALID_STATE_TRANSITIONS: ReadonlyMap<LessonState, readonly LessonState[]> = new Map([
  ['opening', ['probing', 'paused', 'error']],
  ['probing', ['probing', 'hinting', 'reflecting', 'summarizing', 'completed', 'paused', 'error']],
  ['hinting', ['probing', 'hinting', 'explaining', 'reflecting', 'summarizing', 'paused', 'error']],
  ['explaining', ['probing', 'reflecting', 'summarizing', 'paused', 'error']],
  ['reflecting', ['probing', 'summarizing', 'completed', 'paused', 'error']],
  ['summarizing', ['probing', 'completed', 'paused', 'error']],
  ['paused', ['opening', 'probing', 'hinting', 'explaining', 'reflecting', 'summarizing', 'error']],
  ['error', ['opening', 'probing', 'hinting', 'explaining', 'reflecting', 'summarizing']],
  ['completed', []],
])

const assertLessonState = (state: LessonState, message: string): void => {
  if (!includes(LESSON_STATES, state)) throw new Error(message)
}

const assertTutorActionType = (actionType: TutorActionType): void => {
  if (!includes(TUTOR_ACTION_TYPES, actionType)) throw new Error('Tutor action type is invalid')
}

const assertLessonStepStatus = (status: LessonStepStatus): void => {
  if (!includes(LESSON_STEP_STATUSES, status)) throw new Error('Lesson step status is invalid')
}

export const validateLessonStateTransition = (
  stateBefore: LessonState,
  stateAfter: LessonState,
): void => {
  assertLessonState(stateBefore, 'Lesson state is invalid')
  assertLessonState(stateAfter, 'Lesson state is invalid')
  if (!(VALID_STATE_TRANSITIONS.get(stateBefore) ?? []).includes(stateAfter)) {
    throw new Error('Lesson state transition is invalid')
  }
}

export const normalizeTutorAction = (action: TutorAction): TutorAction => {
  assertTutorActionType(action.actionType)
  validateLessonStateTransition(action.stateBefore, action.stateAfter)
  const utterance = normalizeNonBlank(action.utterance, 'Tutor action utterance must not be blank')
  const rationale = normalizeNonBlank(action.rationale, 'Tutor action rationale must not be blank')
  if (action.citedChunkIds.some((id) => !UUID.test(id))) {
    throw new Error('Tutor action cited chunk id is invalid')
  }

  return { ...action, utterance, rationale }
}

export const normalizeLessonStep = (step: LessonStep): LessonStep => {
  if (!UUID.test(step.id)) throw new Error('Lesson step id is invalid')
  if (!UUID.test(step.lessonId)) throw new Error('Lesson step lesson id is invalid')
  if (!UUID.test(step.modelRunId)) throw new Error('Lesson step model run id is invalid')
  if (!Number.isInteger(step.sequenceNo) || step.sequenceNo < 0) {
    throw new Error('Lesson step sequence number is invalid')
  }
  assertTutorActionType(step.actionType)
  assertLessonStepStatus(step.status)
  validateLessonStateTransition(step.stateBefore, step.stateAfter)

  if (step.status === 'started') {
    if (
      step.messageId !== null ||
      step.rationale !== null ||
      step.errorSummary !== null ||
      step.finishedAt !== null
    ) {
      throw new Error('Started lesson step fields are invalid')
    }
    return step
  }

  if (step.finishedAt === null) throw new Error('Finished lesson step timestamp is invalid')

  if (step.status === 'succeeded') {
    if (step.messageId === null || !UUID.test(step.messageId)) {
      throw new Error('Succeeded lesson step message id is invalid')
    }
    if (step.rationale === null) throw new Error('Succeeded lesson step rationale is invalid')
    const rationale = normalizeNonBlank(
      step.rationale,
      'Succeeded lesson step rationale is invalid',
    )
    if (step.errorSummary !== null) throw new Error('Succeeded lesson step fields are invalid')
    return { ...step, rationale }
  }

  if (step.messageId !== null && !UUID.test(step.messageId)) {
    throw new Error('Lesson step message id is invalid')
  }
  if (step.rationale !== null) {
    normalizeNonBlank(step.rationale, 'Lesson step rationale is invalid')
  }
  if (step.errorSummary !== null) {
    normalizeNonBlank(step.errorSummary.code, 'Lesson step error code is invalid')
    normalizeNonBlank(step.errorSummary.message, 'Lesson step error message is invalid')
  }
  return step
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
