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
export const MASTERY_EVIDENCE_KINDS = ['teach_back', 'stuck_signal', 'self_report'] as const
export const MASTERY_JUDGEMENTS = ['insufficient', 'partial_understanding', 'needs_review'] as const
export const MISCONCEPTION_SEVERITIES = ['low', 'medium', 'high'] as const
export const REVIEW_ITEM_STATUSES = ['active', 'completed', 'suspended'] as const
export const REVIEW_RATINGS = ['remembered', 'forgot'] as const
export const LESSON_MODES = ['standard', 'paper'] as const
export const PAPER_READING_STAGES = [
  'orientation',
  'problem_framing',
  'method_intuition',
  'method_mechanics',
  'evidence_check',
  'critical_review',
  'transfer',
  'synthesis',
] as const
export const PAPER_READING_MAP_SLOT_KINDS = [
  'why',
  'what',
  'how',
  'evidence',
  'limits',
  'next',
] as const
export const PAPER_READING_MAP_SLOT_STATUSES = ['empty', 'seeded', 'updated'] as const
export const PAPER_INSIGHT_CARD_KINDS = [
  'section',
  'claim',
  'evidence',
  'limitation',
] as const
export const PAPER_INSIGHT_CARD_CONFIDENCE = ['fallback', 'model'] as const

export type LessonSessionStatus = (typeof LESSON_SESSION_STATUSES)[number]
export type LessonMessageRole = (typeof LESSON_MESSAGE_ROLES)[number]
export type LessonModelRunStatus = (typeof LESSON_MODEL_RUN_STATUSES)[number]
export type LessonState = (typeof LESSON_STATES)[number]
export type TutorActionType = (typeof TUTOR_ACTION_TYPES)[number]
export type LessonStepStatus = (typeof LESSON_STEP_STATUSES)[number]
export type MasteryEvidenceKind = (typeof MASTERY_EVIDENCE_KINDS)[number]
export type MasteryJudgement = (typeof MASTERY_JUDGEMENTS)[number]
export type MisconceptionSeverity = (typeof MISCONCEPTION_SEVERITIES)[number]
export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUSES)[number]
export type ReviewRating = (typeof REVIEW_RATINGS)[number]
export type LessonMode = (typeof LESSON_MODES)[number]
export type PaperReadingStage = (typeof PAPER_READING_STAGES)[number]
export type PaperReadingMapSlotKind = (typeof PAPER_READING_MAP_SLOT_KINDS)[number]
export type PaperReadingMapSlotStatus = (typeof PAPER_READING_MAP_SLOT_STATUSES)[number]
export type PaperInsightCardKind = (typeof PAPER_INSIGHT_CARD_KINDS)[number]
export type PaperInsightCardConfidence = (typeof PAPER_INSIGHT_CARD_CONFIDENCE)[number]

export type PaperReadingMapSlot = Readonly<{
  kind: PaperReadingMapSlotKind
  summary: string | null
  status: PaperReadingMapSlotStatus
  citedAnchorIds: readonly string[]
  updatedAt: string | null
}>

export type PaperReadingMap = Readonly<{
  slots: readonly PaperReadingMapSlot[]
}>

export type PaperInsightCard = Readonly<{
  id: string
  kind: PaperInsightCardKind
  title: string
  summary: string
  sourceAnchorIds: readonly string[]
  stage: PaperReadingStage
  confidence: PaperInsightCardConfidence
  updatedAt: string
}>

export type PaperLessonProfile = Readonly<{
  currentStage: PaperReadingStage
  stageSummary: string | null
  termsIntroduced: readonly string[]
  citedAnchorIds: readonly string[]
  readingMap: PaperReadingMap
  insightCards: readonly PaperInsightCard[]
}>

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
  currentState: LessonState
  steps: readonly LessonStep[]
  masteryEvidence: readonly MasteryEvidence[]
  misconceptionSignals: readonly MisconceptionSignal[]
  reviewItems: readonly ReviewItem[]
  reviewEvents: readonly ReviewEvent[]
  lessonMode: LessonMode
  paperProfile: PaperLessonProfile | null
  createdAt: string
  updatedAt: string
}>

export type MasteryEvidence = Readonly<{
  id: string
  lessonId: string
  stepId: string
  learnerMessageId: string
  tutorMessageId: string
  kind: MasteryEvidenceKind
  judgement: MasteryJudgement
  confidence: number
  rationale: string
  suggestedReview: boolean
  createdAt: string
}>

export type MisconceptionSignal = Readonly<{
  id: string
  evidenceId: string
  lessonId: string
  label: string
  severity: MisconceptionSeverity
  rationale: string
  createdAt: string
}>

export type ReviewItem = Readonly<{
  id: string
  lessonId: string
  masteryEvidenceId: string
  misconceptionSignalId: string | null
  prompt: string
  answerOutline: readonly string[]
  status: ReviewItemStatus
  dueAt: string
  createdAt: string
  updatedAt: string
}>

export type ReviewEvent = Readonly<{
  id: string
  reviewItemId: string
  lessonId: string
  rating: ReviewRating
  response: string
  previousDueAt: string
  nextDueAt: string | null
  reviewedAt: string
  createdAt: string
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
  lessonMode?: LessonMode
  source: Readonly<{
    startOffset: number
    endOffset: number
    snippet: string
    target?: LessonSourceTarget | undefined
  }>
}>

type LegacyPaperLessonProfile = Omit<PaperLessonProfile, 'readingMap' | 'insightCards'> &
  Partial<Pick<PaperLessonProfile, 'readingMap' | 'insightCards'>>

export type LegacyLessonSession = Omit<LessonSession, 'lessonMode' | 'paperProfile'> &
  Partial<Pick<LessonSession, 'lessonMode'>> & {
    paperProfile?: LegacyPaperLessonProfile | null
  }

export type NormalizedLessonStartDraft = Readonly<{
  documentId: string
  documentTitle: string
  title: string
  lessonMode: LessonMode
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

const assertMasteryEvidenceKind = (kind: MasteryEvidenceKind): void => {
  if (!includes(MASTERY_EVIDENCE_KINDS, kind)) throw new Error('Mastery evidence kind is invalid')
}

const assertMasteryJudgement = (judgement: MasteryJudgement): void => {
  if (!includes(MASTERY_JUDGEMENTS, judgement)) throw new Error('Mastery judgement is invalid')
}

const assertMisconceptionSeverity = (severity: MisconceptionSeverity): void => {
  if (!includes(MISCONCEPTION_SEVERITIES, severity)) {
    throw new Error('Misconception severity is invalid')
  }
}

const assertReviewItemStatus = (status: ReviewItemStatus): void => {
  if (!includes(REVIEW_ITEM_STATUSES, status)) throw new Error('Review item status is invalid')
}

const assertReviewRating = (rating: ReviewRating): void => {
  if (!includes(REVIEW_RATINGS, rating)) throw new Error('Review rating is invalid')
}

const assertLessonMode = (lessonMode: LessonMode): void => {
  if (!includes(LESSON_MODES, lessonMode)) throw new Error('Lesson mode is invalid')
}

const assertIsoTimestamp = (value: string, message: string): string => {
  if (Number.isNaN(Date.parse(value))) throw new Error(message)
  return value
}

const assertUuid = (value: string, message: string): string => {
  if (!UUID.test(value)) throw new Error(message)
  return value
}

export const createDefaultPaperReadingMap = (): PaperReadingMap => ({
  slots: PAPER_READING_MAP_SLOT_KINDS.map((kind) => ({
    kind,
    summary: null,
    status: 'empty',
    citedAnchorIds: [],
    updatedAt: null,
  })),
})

const normalizePaperReadingMap = (map: PaperReadingMap | undefined): PaperReadingMap => {
  if (map === undefined) return createDefaultPaperReadingMap()
  if (map.slots.length !== PAPER_READING_MAP_SLOT_KINDS.length) {
    throw new Error('Paper reading map is invalid')
  }

  const slotsByKind = new Map(map.slots.map((slot) => [slot.kind, slot]))
  if (slotsByKind.size !== PAPER_READING_MAP_SLOT_KINDS.length) {
    throw new Error('Paper reading map is invalid')
  }

  return {
    slots: PAPER_READING_MAP_SLOT_KINDS.map((kind) => {
      const slot = slotsByKind.get(kind)
      if (slot === undefined) {
        throw new Error('Paper reading map is invalid')
      }
      if (!includes(PAPER_READING_MAP_SLOT_STATUSES, slot.status)) {
        throw new Error('Paper reading map slot is invalid')
      }

      const summary =
        slot.summary === null
          ? null
          : normalizeNonBlank(slot.summary, 'Paper reading map summary is invalid').slice(0, 500)

      if (summary === null && (slot.status !== 'empty' || slot.updatedAt !== null)) {
        throw new Error('Paper reading map slot is invalid')
      }
      if (summary !== null && slot.updatedAt === null) {
        throw new Error('Paper reading map slot is invalid')
      }

      return {
        kind,
        summary,
        status: slot.status,
        citedAnchorIds: slot.citedAnchorIds.map((id) =>
          assertUuid(id, 'Paper reading map cited anchor id is invalid'),
        ),
        updatedAt:
          slot.updatedAt === null
            ? null
            : assertIsoTimestamp(slot.updatedAt, 'Paper reading map updatedAt is invalid'),
      }
    }),
  }
}

export const normalizePaperInsightCards = (
  cards: readonly PaperInsightCard[] | undefined,
): readonly PaperInsightCard[] => {
  const normalized = (cards ?? []).map((card) => {
    if (!includes(PAPER_INSIGHT_CARD_KINDS, card.kind)) {
      throw new Error('Paper insight card kind is invalid')
    }
    if (!includes(PAPER_INSIGHT_CARD_CONFIDENCE, card.confidence)) {
      throw new Error('Paper insight card confidence is invalid')
    }

    return {
      id: assertUuid(card.id, 'Paper insight card id is invalid'),
      kind: card.kind,
      title: normalizeNonBlank(card.title, 'Paper insight card title is invalid').slice(0, 120),
      summary: normalizeNonBlank(card.summary, 'Paper insight card summary is invalid').slice(
        0,
        500,
      ),
      sourceAnchorIds: [...new Set(card.sourceAnchorIds)].map((id) =>
        assertUuid(id, 'Paper insight card source anchor id is invalid'),
      ),
      stage: includes(PAPER_READING_STAGES, card.stage)
        ? card.stage
        : (() => {
            throw new Error('Paper insight card stage is invalid')
          })(),
      confidence: card.confidence,
      updatedAt: assertIsoTimestamp(card.updatedAt, 'Paper insight card updatedAt is invalid'),
    }
  })

  return PAPER_INSIGHT_CARD_KINDS.flatMap((kind) =>
    normalized.filter((card) => card.kind === kind).slice(-3),
  )
}

const normalizePaperLessonProfile = (
  profile: LegacyPaperLessonProfile | null,
  lessonMode: LessonMode,
): PaperLessonProfile | null => {
  if (lessonMode === 'standard') {
    if (profile !== null) throw new Error('Standard lessons must not include paper profile data')
    return null
  }
  if (profile === null) throw new Error('Paper lesson profile is invalid')
  if (!includes(PAPER_READING_STAGES, profile.currentStage)) {
    throw new Error('Paper reading stage is invalid')
  }
  return {
    currentStage: profile.currentStage,
    stageSummary:
      profile.stageSummary === null
        ? null
        : normalizeNonBlank(profile.stageSummary, 'Paper stage summary is invalid').slice(0, 500),
    termsIntroduced: profile.termsIntroduced.map((term) =>
      normalizeNonBlank(term, 'Paper term is invalid').slice(0, 120),
    ),
    citedAnchorIds: profile.citedAnchorIds.map((id) =>
      assertUuid(id, 'Paper cited anchor id is invalid'),
    ),
    readingMap: normalizePaperReadingMap(profile.readingMap),
    insightCards: normalizePaperInsightCards(profile.insightCards),
  }
}

const normalizeReviewAnswerOutline = (answerOutline: readonly string[]): readonly string[] => {
  if (answerOutline.length === 0) throw new Error('Review answer outline is required')
  if (answerOutline.length > 5) throw new Error('Review answer outline is too long')
  return answerOutline.map((item) => {
    const normalized = normalizeNonBlank(item, 'Review answer outline item is required')
    if (normalized.length > 280) throw new Error('Review answer outline item is too long')
    return normalized
  })
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

export const normalizeMasteryEvidence = (evidence: MasteryEvidence): MasteryEvidence => {
  if (!UUID.test(evidence.id)) throw new Error('Mastery evidence id is invalid')
  if (!UUID.test(evidence.lessonId)) throw new Error('Mastery lesson id is invalid')
  if (!UUID.test(evidence.stepId)) throw new Error('Mastery step id is invalid')
  if (!UUID.test(evidence.learnerMessageId)) {
    throw new Error('Mastery learner message id is invalid')
  }
  if (!UUID.test(evidence.tutorMessageId)) throw new Error('Mastery tutor message id is invalid')
  assertMasteryEvidenceKind(evidence.kind)
  assertMasteryJudgement(evidence.judgement)
  if (
    typeof evidence.confidence !== 'number' ||
    !Number.isFinite(evidence.confidence) ||
    evidence.confidence < 0 ||
    evidence.confidence > 1
  ) {
    throw new Error('Mastery confidence is invalid')
  }
  const rationale = normalizeNonBlank(evidence.rationale, 'Mastery rationale is required')
  if (rationale.length > 280) throw new Error('Mastery rationale is too long')

  return { ...evidence, rationale }
}

export const normalizeMisconceptionSignal = (signal: MisconceptionSignal): MisconceptionSignal => {
  if (!UUID.test(signal.id)) throw new Error('Misconception signal id is invalid')
  if (!UUID.test(signal.evidenceId)) throw new Error('Misconception evidence id is invalid')
  if (!UUID.test(signal.lessonId)) throw new Error('Misconception lesson id is invalid')
  assertMisconceptionSeverity(signal.severity)
  const label = normalizeNonBlank(signal.label, 'Misconception label is required')
  if (label.length > 80) throw new Error('Misconception label is too long')
  const rationale = normalizeNonBlank(signal.rationale, 'Misconception rationale is required')
  if (rationale.length > 280) throw new Error('Misconception rationale is too long')

  return { ...signal, label, rationale }
}

export const normalizeReviewItem = (item: ReviewItem): ReviewItem => {
  if (!UUID.test(item.id)) throw new Error('Review item id is invalid')
  if (!UUID.test(item.lessonId)) throw new Error('Review lesson id is invalid')
  if (!UUID.test(item.masteryEvidenceId)) throw new Error('Review mastery evidence id is invalid')
  if (item.misconceptionSignalId !== null && !UUID.test(item.misconceptionSignalId)) {
    throw new Error('Review misconception signal id is invalid')
  }
  assertReviewItemStatus(item.status)
  const prompt = normalizeNonBlank(item.prompt, 'Review prompt is required')
  if (prompt.length > 280) throw new Error('Review prompt is too long')

  return {
    ...item,
    prompt,
    answerOutline: normalizeReviewAnswerOutline(item.answerOutline),
    dueAt: assertIsoTimestamp(item.dueAt, 'Review due timestamp is invalid'),
    createdAt: assertIsoTimestamp(item.createdAt, 'Review created timestamp is invalid'),
    updatedAt: assertIsoTimestamp(item.updatedAt, 'Review updated timestamp is invalid'),
  }
}

export const normalizeReviewEvent = (event: ReviewEvent): ReviewEvent => {
  if (!UUID.test(event.id)) throw new Error('Review event id is invalid')
  if (!UUID.test(event.reviewItemId)) throw new Error('Review item id is invalid')
  if (!UUID.test(event.lessonId)) throw new Error('Review lesson id is invalid')
  assertReviewRating(event.rating)
  const response = normalizeNonBlank(event.response, 'Review response is required')
  if (response.length > 1_000) throw new Error('Review response is too long')

  return {
    ...event,
    response,
    previousDueAt: assertIsoTimestamp(
      event.previousDueAt,
      'Previous review due timestamp is invalid',
    ),
    nextDueAt:
      event.nextDueAt === null
        ? null
        : assertIsoTimestamp(event.nextDueAt, 'Next review due timestamp is invalid'),
    reviewedAt: assertIsoTimestamp(event.reviewedAt, 'Review timestamp is invalid'),
    createdAt: assertIsoTimestamp(event.createdAt, 'Review event created timestamp is invalid'),
  }
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

export const normalizeLessonSession = (session: LegacyLessonSession): LessonSession => {
  const lessonMode = session.lessonMode ?? 'standard'
  assertUuid(session.id, 'Lesson session id is invalid')
  assertLessonMode(lessonMode)
  if (!includes(LESSON_SESSION_STATUSES, session.status)) {
    throw new Error('Lesson session status is invalid')
  }
  assertUuid(session.documentId, 'Lesson session document id is invalid')
  assertLessonState(session.currentState, 'Lesson state is invalid')

  return {
    ...session,
    title: normalizeNonBlank(session.title, 'Lesson session title must not be blank'),
    documentTitle: normalizeNonBlank(
      session.documentTitle,
      'Lesson session document title must not be blank',
    ),
    lessonMode,
    paperProfile: normalizePaperLessonProfile(session.paperProfile ?? null, lessonMode),
    createdAt: assertIsoTimestamp(session.createdAt, 'Lesson session created timestamp is invalid'),
    updatedAt: assertIsoTimestamp(session.updatedAt, 'Lesson session updated timestamp is invalid'),
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
  const lessonMode = draft.lessonMode ?? 'standard'
  assertLessonMode(lessonMode)

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
    lessonMode,
    source: {
      startOffset: draft.source.startOffset,
      endOffset: draft.source.endOffset,
      snippet: normalizeNonBlank(draft.source.snippet, 'Lesson source snippet must not be blank'),
      target,
    },
  }
}
