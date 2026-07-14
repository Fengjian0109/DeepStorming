import {
  createDefaultPaperReadingMap,
  normalizePaperInsightCards,
  normalizeMasteryEvidence,
  normalizeMisconceptionSignal,
  normalizeReviewEvent,
  normalizeReviewItem,
  normalizeLessonStep,
  normalizeLessonStartDraft,
  normalizeTutorAction,
  type LessonPromptManifest,
  type LessonContextChunkSummary,
  type LessonReplyDraft,
  type DocumentType,
  type LessonMode,
  type PaperReadingMap,
  type PaperInsightCard,
  type PaperInsightCardConfidence,
  type PaperInsightCardKind,
  type PaperReadingMapSlotKind,
  type LessonRunRetryDraft,
  type LessonModelRun,
  type LessonModelRunErrorSummary,
  type PaperReadingStage,
  type ReviewRating,
  type LessonState,
  type LessonSession,
  type LessonStartDraft,
  type TutorActionType,
} from '@deepstorming/domain'
import type { ClockPort, DocumentRepositoryPort, IdGeneratorPort } from './document-ports'
import { DocumentUseCaseError, type AssembleLessonContext } from './document-use-cases'
import type {
  LessonRepositoryPort,
  LessonSessionView,
  LessonTutorFirstQuestionRequest,
  LessonTutorReplyRequest,
  LessonTutorReplyGeneratorPort,
  LessonTutorReplyResult,
  StoredMasteryEvidence,
  StoredMisconceptionSignal,
  StoredReviewItem,
  StoredLessonSession,
  DocumentSourceLocatorPort,
} from './lesson-ports'
import type {
  CancellationToken,
  ProviderGatewayFactoryPort,
  ProviderRepositoryPort,
  SecretVaultPort,
  StructuredPaperInsights,
} from './provider-ports'
import { toProviderProfile } from './provider-use-cases'

export type LessonUseCaseErrorCode =
  | 'LESSON_VALIDATION_FAILED'
  | 'LESSON_DOCUMENT_NOT_FOUND'
  | 'LESSON_SOURCE_NOT_FOUND'
  | 'LESSON_NOT_FOUND'
  | 'OPERATION_CANCELLED'
  | 'DATABASE_UNAVAILABLE'
  | 'INTERNAL_ERROR'

export class LessonUseCaseError extends Error {
  public constructor(
    public readonly code: LessonUseCaseErrorCode,
    message: string,
    public readonly retryable: boolean,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

const toView = (session: StoredLessonSession): LessonSession => ({
  id: session.id,
  title: session.title,
  status: session.status,
  documentId: session.documentId,
  documentTitle: session.documentTitle,
  sourceAnchors: session.sourceAnchors,
  messages: session.messages,
  modelRuns: session.modelRuns,
  currentState: session.currentState,
  steps: session.steps,
  masteryEvidence: session.masteryEvidence,
  misconceptionSignals: session.misconceptionSignals,
  reviewItems: session.reviewItems,
  reviewEvents: session.reviewEvents,
  lessonMode: session.lessonMode,
  paperProfile: session.paperProfile,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
})

const MOCK_TUTOR_PROMPT_TEMPLATE =
  '我们先从《{{documentTitle}}》的这段证据开始：{{snippet}}\n\n你觉得它想解决的核心问题是什么？'
const MOCK_TUTOR_PROMPT_MANIFEST: LessonPromptManifest = {
  key: 'lesson.mockTutor.firstQuestion',
  version: 1,
  hash: 'sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff',
}
const MOCK_TUTOR_PROMPT_VERSION = 'mock-tutor-v1'
const MOCK_TUTOR_FOLLOW_UP_PROMPT_TEMPLATE =
  '你刚才提到：“{{learnerReply}}”。我们把它和证据“{{snippet}}”连起来，参考这些上下文：“{{context}}”。下一步你会如何验证这个判断？'
const MOCK_TUTOR_FOLLOW_UP_PROMPT_MANIFEST: LessonPromptManifest = {
  key: 'lesson.mockTutor.followUp',
  version: 2,
  hash: 'sha256:ad9d6476b98dc6a93a16144bb3ba2a79f7be4e9741176c1e564e0b02ab49265b',
}
const MOCK_TUTOR_FOLLOW_UP_PROMPT_VERSION = 'mock-tutor-follow-up-v2'
const PAPER_FIRST_QUESTION_PROMPT_VERSION = 1
const PAPER_FOLLOW_UP_PROMPT_VERSION = 1
const PAPER_TUTOR_PROMPT_TEMPLATE =
  '我们先进入论文阅读模式，聚焦《{{documentTitle}}》里的这段证据：{{snippet}}\n\n先用它判断一下，这篇论文最想解决的研究问题是什么？'
const PAPER_TUTOR_PROMPT_MANIFEST: LessonPromptManifest = {
  key: 'lesson.paper.first_question',
  version: PAPER_FIRST_QUESTION_PROMPT_VERSION,
  hash: 'sha256:65259330d65215fd85dc5f48ab8a9abf413ec4d8bd72d2f6f8d4cb3dfdb4baa5',
}
const PAPER_TUTOR_PROMPT_VERSION = 'paper-tutor-v1'
const PAPER_TUTOR_FOLLOW_UP_PROMPT_TEMPLATE =
  '你刚才的判断是：“{{learnerReply}}”。结合证据“{{snippet}}”和这些上下文：“{{context}}”，请再往前走一步：你会怎样概括论文的问题定义、关键假设或方法线索？'
const PAPER_TUTOR_FOLLOW_UP_PROMPT_MANIFEST: LessonPromptManifest = {
  key: 'lesson.paper.follow_up',
  version: PAPER_FOLLOW_UP_PROMPT_VERSION,
  hash: 'sha256:fc4c47be4bf0a49d8d211855a145cfe41ef1771ca7b02cc64f8048bcaa55c4ec',
}
const PAPER_TUTOR_FOLLOW_UP_PROMPT_VERSION = 'paper-tutor-follow-up-v1'
const LEARNER_INPUT_PROMPT_VERSION = 'learner-input-v1'

const inferLessonMode = (documentType: DocumentType, requested?: LessonMode): LessonMode => {
  const inferred = documentType === 'paper' ? 'paper' : 'standard'
  if (requested === undefined) return inferred
  if (requested === 'paper' && documentType !== 'paper') {
    throw new Error('Paper lesson mode requires a paper document')
  }
  return requested
}

const PAPER_STAGE_ORDER: readonly PaperReadingStage[] = [
  'orientation',
  'problem_framing',
  'method_intuition',
  'method_mechanics',
  'evidence_check',
  'critical_review',
  'transfer',
  'synthesis',
]

const paperStageLabel = (stage: PaperReadingStage): string => {
  switch (stage) {
    case 'orientation':
      return '整体定位'
    case 'problem_framing':
      return '问题定位'
    case 'method_intuition':
      return '方法直觉'
    case 'method_mechanics':
      return '方法细节'
    case 'evidence_check':
      return '证据核验'
    case 'critical_review':
      return '批判审视'
    case 'transfer':
      return '迁移延伸'
    case 'synthesis':
      return '复盘整合'
  }
}

const stageIndex = (stage: PaperReadingStage): number => PAPER_STAGE_ORDER.indexOf(stage)

const clampPaperStageProgression = (
  currentStage: PaperReadingStage,
  candidateStage: PaperReadingStage,
): PaperReadingStage => {
  const current = stageIndex(currentStage)
  const candidate = stageIndex(candidateStage)
  if (candidate <= current) return currentStage
  if (candidate - current > 1) return currentStage
  return candidateStage
}

const detectRuleBasedPaperStage = (
  reply: string,
  readingMap: PaperReadingMap,
  insightCards: readonly PaperInsightCard[],
): Readonly<{
  strength: 'strong' | 'weak' | 'none'
  stage: PaperReadingStage | null
  rationale: string | null
}> => {
  const normalized = reply.toLowerCase()

  if (/experiment|benchmark|ablation|指标|实验|对比|消融/iu.test(normalized)) {
    return {
      strength: 'strong',
      stage: 'evidence_check',
      rationale: '当前回答开始讨论实验结果与证据。',
    }
  }
  if (
    /because|intuition|why it works|inductive bias|直觉|为什么有效|关键想法|核心思路/iu.test(
      normalized,
    )
  ) {
    return {
      strength: 'strong',
      stage: 'method_intuition',
      rationale: '当前回答开始解释方法为何有效。',
    }
  }
  if (
    /module|architecture|formula|loss|objective|training|训练|结构|公式|流程|模块/iu.test(
      normalized,
    )
  ) {
    return {
      strength: 'strong',
      stage: 'method_mechanics',
      rationale: '当前回答开始讨论方法细节与实现机制。',
    }
  }
  if (
    /limitation|assumption|failure|counterexample|局限|假设|不足|反例|漏洞|质疑/iu.test(normalized)
  ) {
    return {
      strength: 'strong',
      stage: 'critical_review',
      rationale: '当前回答开始讨论局限、假设或潜在问题。',
    }
  }
  if (
    /future|transfer|adapt|application|nearby settings|启发|迁移|应用|改进|未来/iu.test(normalized)
  ) {
    return {
      strength: 'strong',
      stage: 'transfer',
      rationale: '当前回答开始讨论迁移、应用或改进方向。',
    }
  }
  if (/summary|takeaway|overall|总结|主线|整体看|最终理解/.test(normalized)) {
    return {
      strength: 'strong',
      stage: 'synthesis',
      rationale: '当前回答开始整体总结论文主线。',
    }
  }
  if (readingMap.slots.some((slot) => slot.kind === 'evidence' && slot.status === 'updated')) {
    return {
      strength: 'weak',
      stage: 'evidence_check',
      rationale: '阅读地图已积累实验相关线索。',
    }
  }
  if (insightCards.some((card) => card.kind === 'limitation')) {
    return {
      strength: 'weak',
      stage: 'critical_review',
      rationale: '当前洞察卡片已经出现局限线索。',
    }
  }
  return { strength: 'none', stage: null, rationale: null }
}

const updateReadingMapSlot = (
  map: PaperReadingMap,
  kind: PaperReadingMapSlotKind,
  summary: string,
  citedAnchorIds: readonly string[],
  updatedAt: string,
): PaperReadingMap => ({
  slots: map.slots.map((slot) =>
    slot.kind === kind
      ? {
          kind,
          summary: summary.trim().slice(0, 500),
          status: slot.status === 'empty' ? 'seeded' : 'updated',
          citedAnchorIds,
          updatedAt,
        }
      : slot,
  ),
})

const hashInsightSeed = (seed: string): string => {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const deterministicPaperInsightCardId = (
  kind: PaperInsightCardKind,
  title: string,
  stage: PaperReadingStage,
  updatedAt: string,
): string => {
  const seed = `${kind}|${title}|${stage}|${updatedAt}`
  const a = hashInsightSeed(`a|${seed}`)
  const b = hashInsightSeed(`b|${seed}`)
  const c = hashInsightSeed(`c|${seed}`)
  const d = hashInsightSeed(`d|${seed}`)
  const e = hashInsightSeed(`e|${seed}`)
  const f = hashInsightSeed(`f|${seed}`)
  return `${a}-${b.slice(0, 4)}-4${c.slice(0, 3)}-8${d.slice(0, 3)}-${(e + f).slice(0, 12)}`
}

const createPaperInsightCard = (input: {
  kind: PaperInsightCardKind
  title: string
  summary: string
  sourceAnchorIds: readonly string[]
  stage: PaperReadingStage
  confidence: PaperInsightCardConfidence
  updatedAt: string
}): PaperInsightCard => ({
  id: deterministicPaperInsightCardId(input.kind, input.title, input.stage, input.updatedAt),
  kind: input.kind,
  title: input.title.trim(),
  summary: input.summary.trim(),
  sourceAnchorIds: [...new Set(input.sourceAnchorIds)],
  stage: input.stage,
  confidence: input.confidence,
  updatedAt: input.updatedAt,
})

const normalizeInsightTitleKey = (value: string): string =>
  value.trim().toLowerCase().replaceAll(/\s+/g, ' ')

const mergePaperInsightCard = (
  cards: readonly PaperInsightCard[],
  candidate: PaperInsightCard,
): readonly PaperInsightCard[] => {
  const candidateSummaryKey = normalizeInsightTitleKey(candidate.summary).slice(0, 24)
  const index = cards.findIndex((card) => {
    if (card.kind !== candidate.kind) return false
    return (
      normalizeInsightTitleKey(card.title) === normalizeInsightTitleKey(candidate.title) ||
      normalizeInsightTitleKey(card.summary).includes(candidateSummaryKey)
    )
  })

  if (index === -1) return normalizePaperInsightCards([...cards, candidate])

  const existing = cards[index]!
  const next = [...cards]
  next[index] = {
    ...existing,
    ...candidate,
    id: existing.id,
    confidence:
      existing.confidence === 'model' || candidate.confidence === 'model' ? 'model' : 'fallback',
  }
  return normalizePaperInsightCards(next)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const normalizeStructuredPaperInsights = (
  value: StructuredPaperInsights | undefined,
): StructuredPaperInsights | undefined => {
  if (value === undefined || !isRecord(value)) return undefined

  const cardsValue = value['cards']
  if (!Array.isArray(cardsValue)) return undefined

  const cards: StructuredPaperInsights['cards'][number][] = []
  for (const card of cardsValue) {
    if (!isRecord(card)) return undefined
    const kind = card['kind']
    const title = card['title']
    const summary = card['summary']
    const sourceAnchorIds = card['sourceAnchorIds']
    const stage = card['stage']
    const confidence = card['confidence']
    if (
      (kind !== 'section' && kind !== 'claim' && kind !== 'evidence' && kind !== 'limitation') ||
      typeof title !== 'string' ||
      title.trim().length === 0 ||
      typeof summary !== 'string' ||
      summary.trim().length === 0 ||
      !Array.isArray(sourceAnchorIds) ||
      !sourceAnchorIds.every((id) => typeof id === 'string') ||
      (stage !== 'orientation' &&
        stage !== 'problem_framing' &&
        stage !== 'method_intuition' &&
        stage !== 'method_mechanics' &&
        stage !== 'evidence_check' &&
        stage !== 'critical_review' &&
        stage !== 'transfer' &&
        stage !== 'synthesis') ||
      (confidence !== 'fallback' && confidence !== 'model')
    ) {
      return undefined
    }

    cards.push({
      kind,
      title: title.trim(),
      summary: summary.trim(),
      sourceAnchorIds: sourceAnchorIds.map((id) => id.trim()).filter((id) => id.length > 0),
      stage,
      confidence,
    })
  }

  const updatesValue = value['readingMapUpdates']
  const suggestedStageValue = value['suggestedStage']
  const suggestedStageRationaleValue = value['suggestedStageRationale']
  const readingMapUpdates: Partial<Record<PaperReadingMapSlotKind, string>> = {}
  if (isRecord(updatesValue)) {
    for (const [kind, summary] of Object.entries(updatesValue)) {
      if (
        ['why', 'what', 'how', 'evidence', 'limits', 'next'].includes(kind) &&
        typeof summary === 'string' &&
        summary.trim().length > 0
      ) {
        readingMapUpdates[kind as PaperReadingMapSlotKind] = summary.trim()
      }
    }
  }

  const suggestedStage =
    suggestedStageValue === 'orientation' ||
    suggestedStageValue === 'problem_framing' ||
    suggestedStageValue === 'method_intuition' ||
    suggestedStageValue === 'method_mechanics' ||
    suggestedStageValue === 'evidence_check' ||
    suggestedStageValue === 'critical_review' ||
    suggestedStageValue === 'transfer' ||
    suggestedStageValue === 'synthesis'
      ? suggestedStageValue
      : undefined

  const suggestedStageRationale =
    typeof suggestedStageRationaleValue === 'string' &&
    suggestedStageRationaleValue.trim().length > 0
      ? suggestedStageRationaleValue.trim()
      : undefined

  return {
    cards,
    ...(Object.keys(readingMapUpdates).length === 0 ? {} : { readingMapUpdates }),
    ...(suggestedStage === undefined ? {} : { suggestedStage }),
    ...(suggestedStageRationale === undefined ? {} : { suggestedStageRationale }),
  }
}

const createInitialPaperReadingMap = (
  documentTitle: string,
  sourceSnippet: string,
  anchorId: string,
  createdAt: string,
): PaperReadingMap => {
  const withWhy = updateReadingMapSlot(
    createDefaultPaperReadingMap(),
    'why',
    `《${documentTitle}》先从这段证据切入，帮助澄清论文试图解决的核心问题。`,
    [anchorId],
    createdAt,
  )
  return updateReadingMapSlot(
    withWhy,
    'evidence',
    `当前入口证据是：${sourceSnippet.trim().slice(0, 120)}`,
    [anchorId],
    createdAt,
  )
}

const updatePaperReadingMapAfterReply = (
  map: PaperReadingMap,
  reply: string,
  citedAnchorIds: readonly string[],
  updatedAt: string,
): PaperReadingMap => {
  const normalized = reply.trim()
  const lower = normalized.toLowerCase()
  let next = updateReadingMapSlot(
    map,
    'what',
    `学习者当前理解：${normalized.slice(0, 180)}`,
    citedAnchorIds,
    updatedAt,
  )

  if (/method|algorithm|model|mechanism|方法|算法|模型|机制/iu.test(lower)) {
    next = updateReadingMapSlot(
      next,
      'how',
      `方法线索：${normalized.slice(0, 180)}`,
      citedAnchorIds,
      updatedAt,
    )
  }
  if (/evidence|experiment|result|figure|supports|实验|结果|图表|支撑/iu.test(lower)) {
    next = updateReadingMapSlot(
      next,
      'evidence',
      `证据线索：${normalized.slice(0, 180)}`,
      citedAnchorIds,
      updatedAt,
    )
  }
  if (/limit|limitation|assumption|counterexample|局限|假设|反例|不能|失败/iu.test(lower)) {
    next = updateReadingMapSlot(
      next,
      'limits',
      `局限线索：${normalized.slice(0, 180)}`,
      citedAnchorIds,
      updatedAt,
    )
  }
  if (/future|next|transfer|application|improve|未来|启发|迁移|应用|改进/iu.test(lower)) {
    next = updateReadingMapSlot(
      next,
      'next',
      `延展线索：${normalized.slice(0, 180)}`,
      citedAnchorIds,
      updatedAt,
    )
  }

  return next
}

const extractFallbackPaperInsights = (
  stage: PaperReadingStage,
  reply: string,
  citedAnchorIds: readonly string[],
): StructuredPaperInsights => {
  const normalized = reply.trim()
  const readingMapUpdates: Partial<Record<PaperReadingMapSlotKind, string>> = {
    what: `学习者当前理解：${normalized.slice(0, 180)}`,
  }
  const cards: Array<{
    kind: PaperInsightCardKind
    title: string
    summary: string
    sourceAnchorIds: readonly string[]
    stage: PaperReadingStage
    confidence: PaperInsightCardConfidence
  }> = []

  if (stage === 'orientation' || stage === 'problem_framing') {
    cards.push({
      kind: 'claim',
      title: 'Current problem framing',
      summary: normalized.slice(0, 240),
      sourceAnchorIds: citedAnchorIds,
      stage,
      confidence: 'fallback',
    })
  }
  if (/method|algorithm|model|mechanism|方法|算法|模型|机制/iu.test(normalized)) {
    readingMapUpdates.how = `方法线索：${normalized.slice(0, 180)}`
    cards.push({
      kind: 'section',
      title: 'Method clues',
      summary: normalized.slice(0, 240),
      sourceAnchorIds: citedAnchorIds,
      stage,
      confidence: 'fallback',
    })
  }
  if (/evidence|experiment|result|figure|supports|实验|结果|图表|支撑/iu.test(normalized)) {
    readingMapUpdates.evidence = `证据线索：${normalized.slice(0, 180)}`
    cards.push({
      kind: 'evidence',
      title: 'Evidence thread',
      summary: normalized.slice(0, 240),
      sourceAnchorIds: citedAnchorIds,
      stage,
      confidence: 'fallback',
    })
  }
  if (
    /limit|limitation|assumption|counterexample|局限|假设|反例|不能|失败|不足/iu.test(normalized)
  ) {
    readingMapUpdates.limits = `局限线索：${normalized.slice(0, 180)}`
    cards.push({
      kind: 'limitation',
      title: 'Limitation noted',
      summary: normalized.slice(0, 240),
      sourceAnchorIds: citedAnchorIds,
      stage,
      confidence: 'fallback',
    })
  }
  if (/future|next|transfer|application|improve|未来|启发|迁移|应用|改进/iu.test(normalized)) {
    readingMapUpdates.next = `延展线索：${normalized.slice(0, 180)}`
  }

  return { readingMapUpdates, cards }
}

const createMockTutorFirstQuestion = (documentTitle: string, snippet: string): string =>
  MOCK_TUTOR_PROMPT_TEMPLATE.replace('{{documentTitle}}', documentTitle).replace(
    '{{snippet}}',
    snippet,
  )

const createPaperTutorFirstQuestion = (documentTitle: string, snippet: string): string =>
  PAPER_TUTOR_PROMPT_TEMPLATE.replace('{{documentTitle}}', documentTitle).replace(
    '{{snippet}}',
    snippet,
  )

const createMockTutorFollowUp = (
  learnerReply: string,
  snippet: string,
  contextChunks: LessonTutorReplyRequest['contextChunks'],
): string =>
  MOCK_TUTOR_FOLLOW_UP_PROMPT_TEMPLATE.replace('{{learnerReply}}', learnerReply)
    .replace('{{snippet}}', snippet)
    .replace(
      '{{context}}',
      contextChunks.length === 0
        ? '无额外上下文'
        : contextChunks.map((chunk) => chunk.text).join('；'),
    )

const createPaperTutorFollowUp = (
  learnerReply: string,
  snippet: string,
  contextChunks: LessonTutorReplyRequest['contextChunks'],
): string =>
  PAPER_TUTOR_FOLLOW_UP_PROMPT_TEMPLATE.replace('{{learnerReply}}', learnerReply)
    .replace('{{snippet}}', snippet)
    .replace(
      '{{context}}',
      contextChunks.length === 0
        ? '无额外上下文'
        : contextChunks.map((chunk) => chunk.text).join('；'),
    )

const localTutorReply = (
  input: LessonTutorReplyRequest,
  lessonMode: LessonMode,
): LessonTutorReplyResult => ({
  content:
    lessonMode === 'paper'
      ? createPaperTutorFollowUp(input.learnerReply, input.sourceSnippet, input.contextChunks)
      : createMockTutorFollowUp(input.learnerReply, input.sourceSnippet, input.contextChunks),
  providerId: null,
  modelName: 'mock-local',
})

const localTutorFirstQuestion = (
  input: LessonTutorFirstQuestionRequest,
  lessonMode: LessonMode,
): LessonTutorReplyResult => ({
  content:
    lessonMode === 'paper'
      ? createPaperTutorFirstQuestion(input.documentTitle, input.sourceSnippet)
      : createMockTutorFirstQuestion(input.documentTitle, input.sourceSnippet),
  providerId: null,
  modelName: 'mock-local',
})

const liveToken = (): CancellationToken => ({
  cancelled: false,
  onCancel: () => () => undefined,
})

class CancellationSource implements CancellationToken {
  private isCancelled = false
  private readonly listeners = new Set<() => void>()

  public get cancelled(): boolean {
    return this.isCancelled
  }

  public onCancel(listener: () => void): () => void {
    if (this.isCancelled) {
      listener()
      return () => undefined
    }
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  public cancel(): void {
    if (this.isCancelled) return
    this.isCancelled = true
    for (const listener of [...this.listeners]) listener()
  }
}

export class LessonRunOperations {
  private readonly operations = new Map<string, CancellationSource>()

  public start(operationId: string): CancellationToken {
    if (this.operations.has(operationId)) {
      throw new LessonUseCaseError(
        'LESSON_VALIDATION_FAILED',
        'A lesson generation with this operation ID is already running.',
        false,
        { operationId },
      )
    }
    const source = new CancellationSource()
    this.operations.set(operationId, source)
    return source
  }

  public cancel(operationId: string): boolean {
    const source = this.operations.get(operationId)
    if (source === undefined) return false
    source.cancel()
    return true
  }

  public complete(operationId: string): void {
    this.operations.delete(operationId)
  }
}

export type CancelLessonRunInput = Readonly<{ operationId: string }>
export type CancelLessonRunResult = Readonly<{ cancelled: boolean }>

export class CancelLessonRun {
  public constructor(private readonly operations: LessonRunOperations) {}

  public execute(input: CancelLessonRunInput): CancelLessonRunResult {
    if (!UUID.test(input.operationId)) {
      throw new LessonUseCaseError(
        'LESSON_VALIDATION_FAILED',
        'Lesson operation id is invalid.',
        false,
      )
    }
    return { cancelled: this.operations.cancel(input.operationId) }
  }
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu

const normalizeLessonReplyDraft = (draft: LessonReplyDraft): LessonReplyDraft => {
  if (!UUID.test(draft.lessonId)) throw new Error('Lesson id is invalid')
  if (draft.operationId !== undefined && !UUID.test(draft.operationId)) {
    throw new Error('Lesson operation id is invalid')
  }
  const content = draft.content.trim()
  if (content.length === 0) throw new Error('Lesson reply must not be blank')
  if (content.length > 1_000) throw new Error('Lesson reply is too long')
  return {
    lessonId: draft.lessonId,
    content,
    ...(draft.operationId === undefined ? {} : { operationId: draft.operationId }),
  }
}

const normalizeLessonRunRetryDraft = (draft: LessonRunRetryDraft): LessonRunRetryDraft => {
  if (!UUID.test(draft.lessonId)) throw new Error('Lesson id is invalid')
  if (!UUID.test(draft.modelRunId)) throw new Error('Lesson model run id is invalid')
  if (draft.operationId !== undefined && !UUID.test(draft.operationId)) {
    throw new Error('Lesson operation id is invalid')
  }
  return draft
}

const validationError = (error: unknown): LessonUseCaseError =>
  new LessonUseCaseError(
    'LESSON_VALIDATION_FAILED',
    error instanceof Error ? error.message : 'The lesson input is invalid.',
    false,
  )

const databaseError = (): LessonUseCaseError =>
  new LessonUseCaseError('DATABASE_UNAVAILABLE', 'Lesson storage is temporarily unavailable.', true)

const internalError = (): LessonUseCaseError =>
  new LessonUseCaseError('INTERNAL_ERROR', 'The lesson operation could not be completed.', true)

const cancelledError = (operationId?: string): LessonUseCaseError =>
  new LessonUseCaseError(
    'OPERATION_CANCELLED',
    'The lesson generation was cancelled.',
    false,
    operationId === undefined ? undefined : { operationId },
  )

const isLessonError = (error: unknown): error is LessonUseCaseError =>
  error instanceof LessonUseCaseError

const asDatabaseError = (error: unknown): LessonUseCaseError => {
  if (isLessonError(error)) return error
  return databaseError()
}

const asInternalError = (error: unknown): LessonUseCaseError => {
  if (isLessonError(error)) return error
  return internalError()
}

const asLessonContextError = (error: unknown): LessonUseCaseError => {
  if (isLessonError(error)) return error
  if (error instanceof DocumentUseCaseError) {
    switch (error.code) {
      case 'DOCUMENT_NOT_FOUND':
        return new LessonUseCaseError(
          'LESSON_DOCUMENT_NOT_FOUND',
          'The source document was not found.',
          false,
        )
      case 'DATABASE_UNAVAILABLE':
        return databaseError()
      case 'DOCUMENT_VALIDATION_FAILED':
        return validationError(error)
      default:
        return internalError()
    }
  }
  return internalError()
}

const generateTutorReply = async (
  generator: LessonTutorReplyGeneratorPort | undefined,
  input: LessonTutorReplyRequest,
  lessonMode: LessonMode,
  token: CancellationToken,
): Promise<LessonTutorReplyResult> => {
  if (token.cancelled) throw cancelledError()
  if (generator === undefined) return localTutorReply(input, lessonMode)
  try {
    return await generator.generateFollowUp(input, token)
  } catch (error) {
    throw asInternalError(error)
  }
}

const generateFirstTutorQuestion = async (
  generator: LessonTutorReplyGeneratorPort | undefined,
  input: LessonTutorFirstQuestionRequest,
  lessonMode: LessonMode,
  token: CancellationToken,
): Promise<LessonTutorReplyResult> => {
  if (token.cancelled) throw cancelledError()
  if (generator === undefined) return localTutorFirstQuestion(input, lessonMode)
  try {
    return await generator.generateFirstQuestion(input, token)
  } catch (error) {
    throw asInternalError(error)
  }
}

const saveLesson = async (
  lessons: LessonRepositoryPort,
  session: StoredLessonSession,
): Promise<StoredLessonSession> => {
  try {
    return await lessons.save(session)
  } catch (error) {
    throw asDatabaseError(error)
  }
}

const toContextChunkSummary = (chunk: {
  id: string
  pageNumberStart: number
  pageNumberEnd: number
  charCount: number
}): LessonContextChunkSummary => ({
  chunkId: chunk.id,
  pageNumberStart: chunk.pageNumberStart,
  pageNumberEnd: chunk.pageNumberEnd,
  charCount: chunk.charCount,
})

const toTutorContextChunk = (chunk: {
  id: string
  text: string
  pageNumberStart: number
  pageNumberEnd: number
  charCount: number
}) => ({
  chunkId: chunk.id,
  text: chunk.text,
  pageNumberStart: chunk.pageNumberStart,
  pageNumberEnd: chunk.pageNumberEnd,
  charCount: chunk.charCount,
})

const latestTutorQuestionForReply = (session: StoredLessonSession): string => {
  const latestTutorMessage = [...session.messages]
    .reverse()
    .find((message) => message.role === 'tutor')
  if (latestTutorMessage === undefined) throw internalError()
  return latestTutorMessage.content
}

const tutorQuestionForLearnerMessage = (
  session: StoredLessonSession,
  learnerMessageId: string,
): string => {
  const learnerIndex = session.messages.findIndex((message) => message.id === learnerMessageId)
  if (learnerIndex < 0) throw internalError()
  for (let index = learnerIndex - 1; index >= 0; index -= 1) {
    const candidate = session.messages[index]
    if (candidate?.role === 'tutor') return candidate.content
  }
  throw internalError()
}

const assembleLessonContextSummary = async (
  assembler: Pick<AssembleLessonContext, 'execute'>,
  input: Readonly<{
    documentId: string
    query: string
    fallbackSnippet: string
  }>,
): Promise<
  Readonly<{
    contextChunks: readonly LessonContextChunkSummary[]
    contextCharacterCount: number
    tutorContextChunks: readonly ReturnType<typeof toTutorContextChunk>[]
  }>
> => {
  try {
    const context = await assembler.execute(input)
    const contextChunks = context.chunks.map(toContextChunkSummary)
    return {
      contextChunks,
      contextCharacterCount: contextChunks.reduce((total, chunk) => total + chunk.charCount, 0),
      tutorContextChunks: context.chunks.map(toTutorContextChunk),
    }
  } catch (error) {
    throw asLessonContextError(error)
  }
}

const followUpModelRun = (
  input: Readonly<{
    id: string
    lessonId: string
    lessonMode: LessonMode
    documentId: string
    documentTitle: string
    anchor: StoredLessonSession['sourceAnchors'][number]
    learnerReply: string
    contextChunks: readonly LessonContextChunkSummary[]
    contextCharacterCount: number
    startedAt: string
  }>,
): LessonModelRun => ({
  id: input.id,
  lessonId: input.lessonId,
  providerId: null,
  modelName: 'mock-local',
  operation: 'lesson_tutor_follow_up',
  status: 'started',
  promptManifest:
    input.lessonMode === 'paper'
      ? PAPER_TUTOR_FOLLOW_UP_PROMPT_MANIFEST
      : MOCK_TUTOR_FOLLOW_UP_PROMPT_MANIFEST,
  inputSummary: {
    documentId: input.documentId,
    documentTitle: input.documentTitle,
    sourceAnchorIds: [input.anchor.id],
    sourceCharacterRange: {
      startOffset: input.anchor.startOffset,
      endOffset: input.anchor.endOffset,
    },
    snippetCharacterCount: input.anchor.snippet.length,
    contextCharacterCount: input.contextCharacterCount,
    contextChunks: input.contextChunks,
    learnerReplyCharacterCount: input.learnerReply.length,
  },
  sourceAnchorIds: [input.anchor.id],
  outputMessageId: null,
  errorSummary: null,
  startedAt: input.startedAt,
  finishedAt: null,
})

const finishModelRun = (
  modelRun: LessonModelRun,
  tutorReply: LessonTutorReplyResult,
  outputMessageId: string,
  finishedAt: string,
): LessonModelRun => ({
  ...modelRun,
  providerId: tutorReply.providerId,
  modelName: tutorReply.modelName,
  status: 'succeeded',
  outputMessageId,
  errorSummary: null,
  finishedAt,
})

const errorSummaryFrom = (error: LessonUseCaseError): LessonModelRunErrorSummary => ({
  code: error.code,
  message: error.message,
  retryable: error.retryable,
})

const failModelRun = (
  modelRun: LessonModelRun,
  error: LessonUseCaseError,
  finishedAt: string,
): LessonModelRun => ({
  ...modelRun,
  status: error.code === 'OPERATION_CANCELLED' ? 'cancelled' : 'failed',
  outputMessageId: null,
  errorSummary: errorSummaryFrom(error),
  finishedAt,
})

const nextStepSequence = (session: StoredLessonSession): number => session.steps.length

const STUCK_REPLY_PATTERN = /不会|不懂|卡住|不知道|help|stuck|confused/iu

const classifyMasteryEvidence = (input: {
  evidenceId: string
  signalId?: string | undefined
  lessonId: string
  stepId: string
  learnerMessageId: string
  tutorMessageId: string
  learnerReply: string
  createdAt: string
}): Readonly<{
  evidence: StoredMasteryEvidence
  signals: readonly StoredMisconceptionSignal[]
}> => {
  const trimmedReply = input.learnerReply.trim()
  const isStuck = STUCK_REPLY_PATTERN.test(trimmedReply)
  if (isStuck) {
    const evidence = normalizeMasteryEvidence({
      id: input.evidenceId,
      lessonId: input.lessonId,
      stepId: input.stepId,
      learnerMessageId: input.learnerMessageId,
      tutorMessageId: input.tutorMessageId,
      kind: 'stuck_signal',
      judgement: 'needs_review',
      confidence: 0.75,
      rationale: 'Learner explicitly signaled they are stuck or unsure.',
      suggestedReview: true,
      createdAt: input.createdAt,
    })
    if (input.signalId === undefined) throw internalError()
    return {
      evidence,
      signals: [
        normalizeMisconceptionSignal({
          id: input.signalId,
          evidenceId: input.evidenceId,
          lessonId: input.lessonId,
          label: '学习者表达卡住',
          severity: 'medium',
          rationale: 'Learner used language that indicates confusion or being stuck.',
          createdAt: input.createdAt,
        }),
      ],
    }
  }

  if (trimmedReply.length < 12) {
    return {
      evidence: normalizeMasteryEvidence({
        id: input.evidenceId,
        lessonId: input.lessonId,
        stepId: input.stepId,
        learnerMessageId: input.learnerMessageId,
        tutorMessageId: input.tutorMessageId,
        kind: 'teach_back',
        judgement: 'insufficient',
        confidence: 0.65,
        rationale: 'Learner reply was too short to show stable understanding.',
        suggestedReview: true,
        createdAt: input.createdAt,
      }),
      signals: [],
    }
  }

  return {
    evidence: normalizeMasteryEvidence({
      id: input.evidenceId,
      lessonId: input.lessonId,
      stepId: input.stepId,
      learnerMessageId: input.learnerMessageId,
      tutorMessageId: input.tutorMessageId,
      kind: 'teach_back',
      judgement: 'partial_understanding',
      confidence: 0.55,
      rationale: 'Learner gave a source-grounded answer that can support follow-up.',
      suggestedReview: false,
      createdAt: input.createdAt,
    }),
    signals: [],
  }
}

const createMasteryDiagnosis = (
  ids: IdGeneratorPort,
  input: Omit<Parameters<typeof classifyMasteryEvidence>[0], 'evidenceId' | 'signalId'>,
): ReturnType<typeof classifyMasteryEvidence> => {
  const evidenceId = ids.generate()
  const signalId = STUCK_REPLY_PATTERN.test(input.learnerReply.trim()) ? ids.generate() : undefined
  return classifyMasteryEvidence({ ...input, evidenceId, signalId })
}

const plusDaysIso = (iso: string, days: number): string => {
  const next = new Date(iso)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString()
}

const createReviewPrompt = (signal: StoredMisconceptionSignal | undefined): string =>
  signal === undefined
    ? '复习：请重新解释这段课堂证据，并说明你的判断依据。'
    : `复习：${signal.label}。请重新解释这段证据想说明什么。`

const createReviewAnswerOutline = (
  evidence: StoredMasteryEvidence,
  signal: StoredMisconceptionSignal | undefined,
): readonly string[] =>
  signal === undefined ? [evidence.rationale] : [evidence.rationale, signal.rationale]

const createReviewItemForDiagnosis = (
  ids: IdGeneratorPort,
  session: StoredLessonSession,
  evidence: StoredMasteryEvidence,
  signal: StoredMisconceptionSignal | undefined,
): StoredReviewItem | undefined => {
  if (!evidence.suggestedReview) return undefined
  if (evidence.judgement === 'partial_understanding') return undefined
  if (session.reviewItems.some((item) => item.masteryEvidenceId === evidence.id)) return undefined

  return normalizeReviewItem({
    id: ids.generate(),
    lessonId: session.id,
    masteryEvidenceId: evidence.id,
    misconceptionSignalId: signal?.id ?? null,
    prompt: createReviewPrompt(signal),
    answerOutline: createReviewAnswerOutline(evidence, signal),
    status: 'active',
    dueAt: plusDaysIso(evidence.createdAt, 1),
    createdAt: evidence.createdAt,
    updatedAt: evidence.createdAt,
  })
}

const nextDueAtForRating = (reviewedAt: string, rating: ReviewRating): string =>
  plusDaysIso(reviewedAt, rating === 'remembered' ? 3 : 1)

const classifyTutorAction = (
  currentState: LessonState,
  learnerReply: string,
): Readonly<{ actionType: TutorActionType; stateAfter: LessonState; rationale: string }> => {
  const normalized = learnerReply.toLowerCase()
  const stuck = /不会|不懂|卡住|不知道|help|stuck|confused/u.test(normalized)
  const summary = /总结|小结|summarize|summary/u.test(normalized)
  const reflect = /复述|解释一下我理解|reflect/u.test(normalized)
  if (summary) {
    return {
      actionType: 'summarize',
      stateAfter: 'summarizing',
      rationale: 'Learner requested a summary.',
    }
  }
  if (reflect) {
    return {
      actionType: 'reflect',
      stateAfter: 'reflecting',
      rationale: 'Learner requested reflection.',
    }
  }
  if (stuck && currentState === 'hinting') {
    return {
      actionType: 'explain',
      stateAfter: 'explaining',
      rationale: 'Learner remained stuck after a hint.',
    }
  }
  if (stuck) {
    return {
      actionType: 'hint',
      stateAfter: 'hinting',
      rationale: 'Learner signaled confusion.',
    }
  }
  return {
    actionType: 'ask',
    stateAfter: 'probing',
    rationale: 'Continue probing with source-grounded question.',
  }
}

const startedLessonStep = (input: {
  modelRunId: string
  lessonId: string
  sequenceNo: number
  stateBefore: LessonState
  stateAfter: LessonState
  actionType: TutorActionType
  createdAt: string
}): StoredLessonSession['steps'][number] =>
  normalizeLessonStep({
    id: input.modelRunId,
    lessonId: input.lessonId,
    sequenceNo: input.sequenceNo,
    stateBefore: input.stateBefore,
    stateAfter: input.stateAfter,
    actionType: input.actionType,
    status: 'started',
    modelRunId: input.modelRunId,
    messageId: null,
    rationale: null,
    errorSummary: null,
    createdAt: input.createdAt,
    finishedAt: null,
  })

const succeedLessonStep = (
  step: StoredLessonSession['steps'][number],
  input: Readonly<{
    messageId: string
    actionType: TutorActionType
    stateAfter: LessonState
    rationale: string
    finishedAt: string
  }>,
): StoredLessonSession['steps'][number] =>
  normalizeLessonStep({
    ...step,
    actionType: input.actionType,
    stateAfter: input.stateAfter,
    status: 'succeeded',
    messageId: input.messageId,
    rationale: input.rationale,
    errorSummary: null,
    finishedAt: input.finishedAt,
  })

const failLessonStep = (
  step: StoredLessonSession['steps'][number],
  error: LessonUseCaseError,
  finishedAt: string,
): StoredLessonSession['steps'][number] =>
  normalizeLessonStep({
    ...step,
    status: error.code === 'OPERATION_CANCELLED' ? 'cancelled' : 'failed',
    messageId: null,
    rationale: null,
    errorSummary: errorSummaryFrom(error),
    finishedAt,
  })

const startOperation = (
  operations: LessonRunOperations | undefined,
  operationId: string | undefined,
): CancellationToken => {
  if (operations === undefined || operationId === undefined) return liveToken()
  return operations.start(operationId)
}

const completeOperation = (
  operations: LessonRunOperations | undefined,
  operationId: string | undefined,
): void => {
  if (operations !== undefined && operationId !== undefined) operations.complete(operationId)
}

const findLearnerMessageBeforeRun = (
  session: StoredLessonSession,
  modelRun: StoredLessonSession['modelRuns'][number],
): StoredLessonSession['messages'][number] | undefined => {
  const outputIndex =
    modelRun.outputMessageId === null
      ? -1
      : session.messages.findIndex((message) => message.id === modelRun.outputMessageId)
  const searchSpace =
    outputIndex >= 0
      ? session.messages.slice(0, outputIndex)
      : session.messages.filter((message) => message.createdAt <= modelRun.startedAt)
  return [...searchSpace].reverse().find((message) => message.role === 'learner')
}

const updatePaperProfileAfterReply = (
  session: StoredLessonSession,
  reply: string,
  updatedAt: string,
  structuredPaperInsights?: StructuredPaperInsights,
): StoredLessonSession['paperProfile'] => {
  if (session.lessonMode !== 'paper' || session.paperProfile === null) {
    return session.paperProfile
  }
  const citedAnchorIds = session.sourceAnchors.map((anchor) => anchor.id)
  const normalizedStructuredInsights = normalizeStructuredPaperInsights(structuredPaperInsights)
  const insights =
    normalizedStructuredInsights ??
    extractFallbackPaperInsights(session.paperProfile.currentStage, reply, citedAnchorIds)

  let readingMap =
    normalizedStructuredInsights === undefined
      ? session.paperProfile.readingMap
      : updatePaperReadingMapAfterReply(
          session.paperProfile.readingMap,
          reply,
          citedAnchorIds,
          updatedAt,
        )

  for (const [kind, summary] of Object.entries(insights.readingMapUpdates ?? {})) {
    readingMap = updateReadingMapSlot(
      readingMap,
      kind as PaperReadingMapSlotKind,
      summary,
      citedAnchorIds,
      updatedAt,
    )
  }

  let insightCards = session.paperProfile.insightCards
  for (const card of insights.cards) {
    insightCards = mergePaperInsightCard(
      insightCards,
      createPaperInsightCard({
        kind: card.kind,
        title: card.title,
        summary: card.summary,
        sourceAnchorIds: card.sourceAnchorIds,
        stage: card.stage,
        confidence: card.confidence,
        updatedAt,
      }),
    )
  }

  let currentStage = session.paperProfile.currentStage
  let stageSummary = session.paperProfile.stageSummary
  if (currentStage === 'orientation') {
    currentStage = 'problem_framing'
    stageSummary = '已进入问题定位：当前回答开始聚焦论文要解决的问题。'
  } else {
    const rule = detectRuleBasedPaperStage(reply, readingMap, insightCards)
    if (rule.strength === 'strong' && rule.stage !== null) {
      const nextStage = clampPaperStageProgression(currentStage, rule.stage)
      if (nextStage !== currentStage) {
        currentStage = nextStage
        stageSummary = `已进入${paperStageLabel(nextStage)}：${rule.rationale}`
      }
    } else if (normalizedStructuredInsights?.suggestedStage !== undefined) {
      const nextStage = clampPaperStageProgression(
        currentStage,
        normalizedStructuredInsights.suggestedStage,
      )
      if (nextStage !== currentStage) {
        currentStage = nextStage
        stageSummary =
          normalizedStructuredInsights.suggestedStageRationale ??
          `已进入${paperStageLabel(nextStage)}：当前回答的规则信号不足，已采用本轮结构化阶段建议。`
      }
    } else if (rule.strength === 'weak' && rule.stage !== null) {
      const nextStage = clampPaperStageProgression(currentStage, rule.stage)
      if (nextStage !== currentStage) {
        currentStage = nextStage
        stageSummary = `已进入${paperStageLabel(nextStage)}：${rule.rationale}`
      }
    }
  }

  return {
    ...session.paperProfile,
    currentStage,
    stageSummary,
    readingMap,
    insightCards,
  }
}

const currentPaperStage = (session: Pick<StoredLessonSession, 'lessonMode' | 'paperProfile'>) =>
  session.lessonMode === 'paper' ? (session.paperProfile?.currentStage ?? 'orientation') : null

export class ListLessonSessions {
  public constructor(private readonly repository: LessonRepositoryPort) {}

  public async execute(): Promise<readonly LessonSession[]> {
    try {
      return (await this.repository.list()).map(toView)
    } catch (error) {
      throw asDatabaseError(error)
    }
  }
}

export class GetLessonSession {
  public constructor(private readonly repository: LessonRepositoryPort) {}

  public async execute(id: string): Promise<LessonSession> {
    let session: StoredLessonSession | undefined
    try {
      session = await this.repository.findById(id)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (!session)
      throw new LessonUseCaseError('LESSON_NOT_FOUND', 'The lesson was not found.', false)
    return toView(session)
  }
}

export class StartLessonFromDocument {
  public constructor(
    private readonly documents: DocumentRepositoryPort,
    private readonly lessons: LessonRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
    private readonly sourceLocator?: DocumentSourceLocatorPort,
    private readonly lessonContextAssembler?: Pick<AssembleLessonContext, 'execute'>,
    private readonly tutorReplyGenerator?: LessonTutorReplyGeneratorPort,
  ) {}

  public async execute(input: LessonStartDraft): Promise<LessonSession> {
    let draft
    try {
      draft = normalizeLessonStartDraft(input)
    } catch (error) {
      throw validationError(error)
    }

    try {
      const document = await this.documents.findById(draft.documentId)
      if (!document) {
        throw new LessonUseCaseError(
          'LESSON_DOCUMENT_NOT_FOUND',
          'The source document was not found.',
          false,
        )
      }
      const lessonMode = inferLessonMode(document.documentType, input.lessonMode)
      if (draft.source.target.kind === 'pdf_block') {
        const block = await this.sourceLocator?.findTextBlock(
          draft.documentId,
          draft.source.target.pageNumber,
          draft.source.target.blockId,
        )
        if (block === undefined || block.documentId !== draft.documentId) {
          throw new LessonUseCaseError(
            'LESSON_SOURCE_NOT_FOUND',
            'The selected PDF evidence was not found in the source document.',
            false,
          )
        }
      }
      draft = { ...draft, lessonMode }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Paper lesson mode requires a paper document'
      ) {
        throw validationError(error)
      }
      if (isLessonError(error)) throw error
      throw databaseError()
    }

    let createdAt: string
    let sessionId: string
    let anchorId: string
    let modelRunId: string
    let messageId: string
    try {
      createdAt = this.clock.now()
      sessionId = this.ids.generate()
      anchorId = this.ids.generate()
      modelRunId = this.ids.generate()
      messageId = this.ids.generate()
    } catch (error) {
      throw asInternalError(error)
    }

    if (this.lessonContextAssembler === undefined) throw internalError()

    const contextSummary = await assembleLessonContextSummary(this.lessonContextAssembler, {
      documentId: draft.documentId,
      query: draft.source.snippet,
      fallbackSnippet: draft.source.snippet,
    })
    const firstQuestion = await generateFirstTutorQuestion(
      this.tutorReplyGenerator,
      {
        documentTitle: draft.documentTitle,
        sourceSnippet: draft.source.snippet,
        lessonMode: draft.lessonMode,
        paperStage: draft.lessonMode === 'paper' ? 'orientation' : null,
        contextChunks: contextSummary.tutorContextChunks,
      },
      draft.lessonMode,
      liveToken(),
    )

    const session: StoredLessonSession = {
      id: sessionId,
      title: draft.title,
      status: 'active',
      documentId: draft.documentId,
      documentTitle: draft.documentTitle,
      sourceAnchors: [
        {
          id: anchorId,
          documentId: draft.documentId,
          startOffset: draft.source.startOffset,
          endOffset: draft.source.endOffset,
          snippet: draft.source.snippet,
          ...(draft.source.target.kind === 'pdf_block' ? { target: draft.source.target } : {}),
        },
      ],
      messages: [
        {
          id: messageId,
          lessonId: sessionId,
          modelRunId,
          role: 'tutor',
          content: firstQuestion.content,
          sourceAnchorIds: [anchorId],
          promptVersion:
            draft.lessonMode === 'paper' ? PAPER_TUTOR_PROMPT_VERSION : MOCK_TUTOR_PROMPT_VERSION,
          createdAt,
        },
      ],
      modelRuns: [
        {
          id: modelRunId,
          lessonId: sessionId,
          providerId: firstQuestion.providerId,
          modelName: firstQuestion.modelName,
          operation: 'lesson_tutor_first_question',
          status: 'succeeded',
          promptManifest:
            draft.lessonMode === 'paper' ? PAPER_TUTOR_PROMPT_MANIFEST : MOCK_TUTOR_PROMPT_MANIFEST,
          inputSummary: {
            documentId: draft.documentId,
            documentTitle: draft.documentTitle,
            sourceAnchorIds: [anchorId],
            sourceCharacterRange: {
              startOffset: draft.source.startOffset,
              endOffset: draft.source.endOffset,
            },
            snippetCharacterCount: draft.source.snippet.length,
            contextCharacterCount: contextSummary.contextCharacterCount,
            contextChunks: contextSummary.contextChunks,
          },
          sourceAnchorIds: [anchorId],
          outputMessageId: messageId,
          errorSummary: null,
          startedAt: createdAt,
          finishedAt: createdAt,
        },
      ],
      currentState: 'probing',
      steps: [
        normalizeLessonStep({
          id: modelRunId,
          lessonId: sessionId,
          sequenceNo: 0,
          stateBefore: 'opening',
          stateAfter: 'probing',
          actionType: 'ask',
          status: 'succeeded',
          modelRunId,
          messageId,
          rationale: 'Started with a source-grounded opening question.',
          errorSummary: null,
          createdAt,
          finishedAt: createdAt,
        }),
      ],
      masteryEvidence: [],
      misconceptionSignals: [],
      reviewItems: [],
      reviewEvents: [],
      lessonMode: draft.lessonMode,
      paperProfile:
        draft.lessonMode === 'paper'
          ? {
              currentStage: 'orientation',
              stageSummary: null,
              termsIntroduced: [],
              citedAnchorIds: [anchorId],
              readingMap: createInitialPaperReadingMap(
                draft.documentTitle,
                draft.source.snippet,
                anchorId,
                createdAt,
              ),
              insightCards: [],
            }
          : null,
      createdAt,
      updatedAt: createdAt,
    }

    try {
      return toView(await this.lessons.create(session))
    } catch (error) {
      throw asDatabaseError(error)
    }
  }
}

export class SubmitLessonReply {
  public constructor(
    private readonly lessons: LessonRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
    private readonly lessonContextAssembler?: Pick<AssembleLessonContext, 'execute'>,
    private readonly tutorReplyGenerator?: LessonTutorReplyGeneratorPort,
    private readonly operations?: LessonRunOperations,
  ) {}

  public async execute(input: LessonReplyDraft): Promise<LessonSession> {
    let draft: LessonReplyDraft
    try {
      draft = normalizeLessonReplyDraft(input)
    } catch (error) {
      throw validationError(error)
    }

    let session: StoredLessonSession | undefined
    try {
      session = await this.lessons.findById(draft.lessonId)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (!session)
      throw new LessonUseCaseError('LESSON_NOT_FOUND', 'The lesson was not found.', false)

    const anchor = session.sourceAnchors[0]
    if (anchor === undefined) throw internalError()
    if (this.lessonContextAssembler === undefined) throw internalError()

    let createdAt: string
    let learnerMessageId: string
    let modelRunId: string
    let tutorMessageId: string
    try {
      createdAt = this.clock.now()
      learnerMessageId = this.ids.generate()
      modelRunId = this.ids.generate()
      tutorMessageId = this.ids.generate()
    } catch (error) {
      throw asInternalError(error)
    }

    const contextSummary = await assembleLessonContextSummary(this.lessonContextAssembler, {
      documentId: session.documentId,
      query: `${latestTutorQuestionForReply(session)}\n${draft.content}`,
      fallbackSnippet: anchor.snippet,
    })

    const startedRun = followUpModelRun({
      id: modelRunId,
      lessonId: session.id,
      lessonMode: session.lessonMode,
      documentId: session.documentId,
      documentTitle: session.documentTitle,
      anchor,
      learnerReply: draft.content,
      contextChunks: contextSummary.contextChunks,
      contextCharacterCount: contextSummary.contextCharacterCount,
      startedAt: createdAt,
    })
    const classifiedAction = classifyTutorAction(session.currentState, draft.content)
    const startedStep = startedLessonStep({
      modelRunId,
      lessonId: session.id,
      sequenceNo: nextStepSequence(session),
      stateBefore: session.currentState,
      stateAfter: classifiedAction.stateAfter,
      actionType: classifiedAction.actionType,
      createdAt,
    })
    const pending: StoredLessonSession = {
      ...session,
      messages: [
        ...session.messages,
        {
          id: learnerMessageId,
          lessonId: session.id,
          modelRunId: null,
          role: 'learner',
          content: draft.content,
          sourceAnchorIds: [],
          promptVersion: LEARNER_INPUT_PROMPT_VERSION,
          createdAt,
        },
      ],
      modelRuns: [...session.modelRuns, startedRun],
      steps: [...session.steps, startedStep],
      updatedAt: createdAt,
    }
    await saveLesson(this.lessons, pending)
    const token = startOperation(this.operations, draft.operationId)

    let tutorReply: LessonTutorReplyResult
    try {
      tutorReply = await generateTutorReply(
        this.tutorReplyGenerator,
        {
          documentTitle: session.documentTitle,
          sourceSnippet: anchor.snippet,
          lessonMode: session.lessonMode,
          paperStage: currentPaperStage(session),
          contextChunks: contextSummary.tutorContextChunks,
          learnerReply: draft.content,
        },
        session.lessonMode,
        token,
      )
    } catch (error) {
      const lessonError = asInternalError(error)
      await saveLesson(this.lessons, {
        ...pending,
        modelRuns: pending.modelRuns.map((run) =>
          run.id === modelRunId ? failModelRun(run, lessonError, createdAt) : run,
        ),
        steps: pending.steps.map((step) =>
          step.id === modelRunId ? failLessonStep(step, lessonError, createdAt) : step,
        ),
      })
      throw lessonError
    } finally {
      completeOperation(this.operations, draft.operationId)
    }

    const action = normalizeTutorAction({
      actionType: tutorReply.actionType ?? classifiedAction.actionType,
      stateBefore: startedStep.stateBefore,
      stateAfter: tutorReply.stateAfter ?? classifiedAction.stateAfter,
      utterance: tutorReply.content,
      citedChunkIds: contextSummary.contextChunks.map((chunk) => chunk.chunkId),
      rationale: tutorReply.rationale ?? classifiedAction.rationale,
    })
    let diagnosis: ReturnType<typeof createMasteryDiagnosis>
    try {
      diagnosis = createMasteryDiagnosis(this.ids, {
        lessonId: session.id,
        stepId: modelRunId,
        learnerMessageId,
        tutorMessageId,
        learnerReply: draft.content,
        createdAt,
      })
    } catch (error) {
      throw asInternalError(error)
    }
    const reviewItem = createReviewItemForDiagnosis(
      this.ids,
      pending,
      diagnosis.evidence,
      diagnosis.signals[0],
    )
    const updated: StoredLessonSession = {
      ...pending,
      messages: [
        ...pending.messages,
        {
          id: tutorMessageId,
          lessonId: session.id,
          modelRunId,
          role: 'tutor',
          content: tutorReply.content,
          sourceAnchorIds: [anchor.id],
          promptVersion:
            session.lessonMode === 'paper'
              ? PAPER_TUTOR_FOLLOW_UP_PROMPT_VERSION
              : MOCK_TUTOR_FOLLOW_UP_PROMPT_VERSION,
          createdAt,
        },
      ],
      modelRuns: pending.modelRuns.map((run) =>
        run.id === modelRunId ? finishModelRun(run, tutorReply, tutorMessageId, createdAt) : run,
      ),
      currentState: action.stateAfter,
      steps: pending.steps.map((step) =>
        step.id === modelRunId
          ? succeedLessonStep(step, {
              messageId: tutorMessageId,
              actionType: action.actionType,
              stateAfter: action.stateAfter,
              rationale: action.rationale,
              finishedAt: createdAt,
            })
          : step,
      ),
      masteryEvidence: [...pending.masteryEvidence, diagnosis.evidence],
      misconceptionSignals: [...pending.misconceptionSignals, ...diagnosis.signals],
      reviewItems:
        reviewItem === undefined ? pending.reviewItems : [...pending.reviewItems, reviewItem],
      reviewEvents: pending.reviewEvents,
      paperProfile: updatePaperProfileAfterReply(
        session,
        draft.content,
        createdAt,
        tutorReply.structuredPaperInsights,
      ),
      updatedAt: createdAt,
    }

    return toView(await saveLesson(this.lessons, updated))
  }
}

export class RetryLessonRun {
  public constructor(
    private readonly lessons: LessonRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
    private readonly lessonContextAssembler?: Pick<AssembleLessonContext, 'execute'>,
    private readonly tutorReplyGenerator?: LessonTutorReplyGeneratorPort,
    private readonly operations?: LessonRunOperations,
  ) {}

  public async execute(input: LessonRunRetryDraft): Promise<LessonSession> {
    let draft: LessonRunRetryDraft
    try {
      draft = normalizeLessonRunRetryDraft(input)
    } catch (error) {
      throw validationError(error)
    }

    let session: StoredLessonSession | undefined
    try {
      session = await this.lessons.findById(draft.lessonId)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (!session)
      throw new LessonUseCaseError('LESSON_NOT_FOUND', 'The lesson was not found.', false)

    const modelRun = session.modelRuns.find((run) => run.id === draft.modelRunId)
    if (modelRun === undefined) {
      throw validationError(new Error('Lesson model run was not found.'))
    }
    if (modelRun.status !== 'failed' && modelRun.status !== 'cancelled') {
      throw validationError(new Error('Lesson model run cannot be retried.'))
    }

    const learnerMessage = findLearnerMessageBeforeRun(session, modelRun)

    const anchorId = modelRun.sourceAnchorIds[0]
    const anchor =
      session.sourceAnchors.find((sourceAnchor) => sourceAnchor.id === anchorId) ??
      session.sourceAnchors[0]
    if (anchor === undefined) throw internalError()
    if (this.lessonContextAssembler === undefined) throw internalError()

    if (learnerMessage === undefined) {
      return toView(session)
    }

    let createdAt: string
    let modelRunId: string
    let tutorMessageId: string
    try {
      createdAt = this.clock.now()
      modelRunId = this.ids.generate()
      tutorMessageId = this.ids.generate()
    } catch (error) {
      throw asInternalError(error)
    }

    const contextSummary = await assembleLessonContextSummary(this.lessonContextAssembler, {
      documentId: session.documentId,
      query: `${tutorQuestionForLearnerMessage(session, learnerMessage.id)}\n${learnerMessage.content}`,
      fallbackSnippet: anchor.snippet,
    })

    const startedRun = followUpModelRun({
      id: modelRunId,
      lessonId: session.id,
      lessonMode: session.lessonMode,
      documentId: session.documentId,
      documentTitle: session.documentTitle,
      anchor,
      learnerReply: learnerMessage.content,
      contextChunks: contextSummary.contextChunks,
      contextCharacterCount: contextSummary.contextCharacterCount,
      startedAt: createdAt,
    })
    const classifiedAction = classifyTutorAction(session.currentState, learnerMessage.content)
    const startedStep = startedLessonStep({
      modelRunId,
      lessonId: session.id,
      sequenceNo: nextStepSequence(session),
      stateBefore: session.currentState,
      stateAfter: classifiedAction.stateAfter,
      actionType: classifiedAction.actionType,
      createdAt,
    })
    const pending: StoredLessonSession = {
      ...session,
      modelRuns: [...session.modelRuns, startedRun],
      steps: [...session.steps, startedStep],
      updatedAt: createdAt,
    }
    await saveLesson(this.lessons, pending)
    const token = startOperation(this.operations, draft.operationId)

    let tutorReply: LessonTutorReplyResult
    try {
      tutorReply = await generateTutorReply(
        this.tutorReplyGenerator,
        {
          documentTitle: session.documentTitle,
          sourceSnippet: anchor.snippet,
          lessonMode: session.lessonMode,
          paperStage: currentPaperStage(session),
          contextChunks: contextSummary.tutorContextChunks,
          learnerReply: learnerMessage.content,
        },
        session.lessonMode,
        token,
      )
    } catch (error) {
      const lessonError = asInternalError(error)
      await saveLesson(this.lessons, {
        ...pending,
        modelRuns: pending.modelRuns.map((run) =>
          run.id === modelRunId ? failModelRun(run, lessonError, createdAt) : run,
        ),
        steps: pending.steps.map((step) =>
          step.id === modelRunId ? failLessonStep(step, lessonError, createdAt) : step,
        ),
      })
      throw lessonError
    } finally {
      completeOperation(this.operations, draft.operationId)
    }

    const action = normalizeTutorAction({
      actionType: tutorReply.actionType ?? classifiedAction.actionType,
      stateBefore: startedStep.stateBefore,
      stateAfter: tutorReply.stateAfter ?? classifiedAction.stateAfter,
      utterance: tutorReply.content,
      citedChunkIds: contextSummary.contextChunks.map((chunk) => chunk.chunkId),
      rationale: tutorReply.rationale ?? classifiedAction.rationale,
    })
    let diagnosis: ReturnType<typeof createMasteryDiagnosis> | undefined
    if (!session.masteryEvidence.some((evidence) => evidence.tutorMessageId === tutorMessageId)) {
      try {
        diagnosis = createMasteryDiagnosis(this.ids, {
          lessonId: session.id,
          stepId: modelRunId,
          learnerMessageId: learnerMessage.id,
          tutorMessageId,
          learnerReply: learnerMessage.content,
          createdAt,
        })
      } catch (error) {
        throw asInternalError(error)
      }
    }
    const reviewItem =
      diagnosis === undefined
        ? undefined
        : createReviewItemForDiagnosis(this.ids, pending, diagnosis.evidence, diagnosis.signals[0])
    const updated: StoredLessonSession = {
      ...pending,
      messages: [
        ...pending.messages,
        {
          id: tutorMessageId,
          lessonId: session.id,
          modelRunId,
          role: 'tutor',
          content: tutorReply.content,
          sourceAnchorIds: [anchor.id],
          promptVersion:
            session.lessonMode === 'paper'
              ? PAPER_TUTOR_FOLLOW_UP_PROMPT_VERSION
              : MOCK_TUTOR_FOLLOW_UP_PROMPT_VERSION,
          createdAt,
        },
      ],
      modelRuns: pending.modelRuns.map((run) =>
        run.id === modelRunId ? finishModelRun(run, tutorReply, tutorMessageId, createdAt) : run,
      ),
      currentState: action.stateAfter,
      steps: pending.steps.map((step) =>
        step.id === modelRunId
          ? succeedLessonStep(step, {
              messageId: tutorMessageId,
              actionType: action.actionType,
              stateAfter: action.stateAfter,
              rationale: action.rationale,
              finishedAt: createdAt,
            })
          : step,
      ),
      masteryEvidence:
        diagnosis === undefined
          ? pending.masteryEvidence
          : [...pending.masteryEvidence, diagnosis.evidence],
      misconceptionSignals:
        diagnosis === undefined
          ? pending.misconceptionSignals
          : [...pending.misconceptionSignals, ...diagnosis.signals],
      reviewItems:
        reviewItem === undefined ? pending.reviewItems : [...pending.reviewItems, reviewItem],
      reviewEvents: pending.reviewEvents,
      paperProfile: updatePaperProfileAfterReply(
        session,
        learnerMessage.content,
        createdAt,
        tutorReply.structuredPaperInsights,
      ),
      updatedAt: createdAt,
    }

    return toView(await saveLesson(this.lessons, updated))
  }
}

export type RecordReviewEventInput = Readonly<{
  lessonId: string
  reviewItemId: string
  rating: ReviewRating
  response: string
}>

const normalizeRecordReviewEventInput = (input: RecordReviewEventInput): RecordReviewEventInput => {
  if (!UUID.test(input.lessonId)) throw new Error('Lesson id is invalid')
  if (!UUID.test(input.reviewItemId)) throw new Error('Review item id is invalid')
  const response = input.response.trim()
  if (response.length === 0) throw new Error('Review response is required')
  if (response.length > 1_000) throw new Error('Review response is too long')
  return { ...input, response }
}

export class RecordReviewEvent {
  public constructor(
    private readonly repository: LessonRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  public async execute(input: RecordReviewEventInput): Promise<LessonSessionView> {
    let normalized: RecordReviewEventInput
    try {
      normalized = normalizeRecordReviewEventInput(input)
    } catch (error) {
      throw validationError(error)
    }

    let session: StoredLessonSession | undefined
    try {
      session = await this.repository.findById(normalized.lessonId)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (session === undefined) {
      throw new LessonUseCaseError('LESSON_NOT_FOUND', 'The lesson was not found.', false)
    }

    const reviewItem = session.reviewItems.find((item) => item.id === normalized.reviewItemId)
    if (reviewItem === undefined) {
      throw new LessonUseCaseError('LESSON_NOT_FOUND', 'The lesson was not found.', false)
    }

    const reviewedAt = this.clock.now()
    const nextDueAt = nextDueAtForRating(reviewedAt, normalized.rating)
    let event
    try {
      event = normalizeReviewEvent({
        id: this.ids.generate(),
        reviewItemId: reviewItem.id,
        lessonId: session.id,
        rating: normalized.rating,
        response: normalized.response,
        previousDueAt: reviewItem.dueAt,
        nextDueAt,
        reviewedAt,
        createdAt: reviewedAt,
      })
    } catch (error) {
      throw asInternalError(error)
    }

    const updated: StoredLessonSession = {
      ...session,
      reviewItems: session.reviewItems.map((item) =>
        item.id === reviewItem.id
          ? {
              ...item,
              dueAt: nextDueAt,
              status: 'active',
              updatedAt: reviewedAt,
            }
          : item,
      ),
      reviewEvents: [...session.reviewEvents, event],
      updatedAt: reviewedAt,
    }

    return toView(await saveLesson(this.repository, updated))
  }
}

export class ProviderLessonTutorReplyGenerator implements LessonTutorReplyGeneratorPort {
  public constructor(
    private readonly providers: ProviderRepositoryPort,
    private readonly vault: SecretVaultPort,
    private readonly gatewayFactory: ProviderGatewayFactoryPort,
  ) {}

  public async generateFirstQuestion(
    input: LessonTutorFirstQuestionRequest,
    token: CancellationToken,
  ): Promise<LessonTutorReplyResult> {
    let activeProvider
    try {
      activeProvider = (await this.providers.list()).find((provider) => provider.isActive)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (activeProvider === undefined) {
      return localTutorFirstQuestion(input, input.lessonMode)
    }

    let apiKey: string | undefined
    if (activeProvider.providerType !== 'mock') {
      if (activeProvider.secretRef === undefined) throw internalError()
      try {
        apiKey = await this.vault.get(activeProvider.secretRef)
      } catch (error) {
        throw asInternalError(error)
      }
    }

    const gateway = this.gatewayFactory.create(toProviderProfile(activeProvider))
    const generated = await gateway.generateLessonTutorFirstQuestion(
      apiKey === undefined
        ? {
            modelName: activeProvider.modelName,
            documentTitle: input.documentTitle,
            sourceSnippet: input.sourceSnippet,
            lessonMode: input.lessonMode,
            paperStage: input.paperStage,
            contextChunks: input.contextChunks,
          }
        : {
            modelName: activeProvider.modelName,
            apiKey,
            documentTitle: input.documentTitle,
            sourceSnippet: input.sourceSnippet,
            lessonMode: input.lessonMode,
            paperStage: input.paperStage,
            contextChunks: input.contextChunks,
          },
      token,
    )
    return {
      content: generated.content,
      providerId: activeProvider.id,
      modelName: activeProvider.modelName,
    }
  }

  public async generateFollowUp(
    input: LessonTutorReplyRequest,
    token: CancellationToken,
  ): Promise<LessonTutorReplyResult> {
    let activeProvider
    try {
      activeProvider = (await this.providers.list()).find((provider) => provider.isActive)
    } catch (error) {
      throw asDatabaseError(error)
    }
    if (activeProvider === undefined) {
      return localTutorReply(input, input.lessonMode)
    }

    let apiKey: string | undefined
    if (activeProvider.providerType !== 'mock') {
      if (activeProvider.secretRef === undefined) throw internalError()
      try {
        apiKey = await this.vault.get(activeProvider.secretRef)
      } catch (error) {
        throw asInternalError(error)
      }
    }

    const gateway = this.gatewayFactory.create(toProviderProfile(activeProvider))
    const generated = await gateway.generateLessonTutorReply(
      apiKey === undefined
        ? {
            modelName: activeProvider.modelName,
            documentTitle: input.documentTitle,
            sourceSnippet: input.sourceSnippet,
            lessonMode: input.lessonMode,
            paperStage: input.paperStage,
            contextChunks: input.contextChunks,
            learnerReply: input.learnerReply,
          }
        : {
            modelName: activeProvider.modelName,
            apiKey,
            documentTitle: input.documentTitle,
            sourceSnippet: input.sourceSnippet,
            lessonMode: input.lessonMode,
            paperStage: input.paperStage,
            contextChunks: input.contextChunks,
            learnerReply: input.learnerReply,
          },
      token,
    )
    return {
      content: generated.content,
      providerId: activeProvider.id,
      modelName: activeProvider.modelName,
      ...(generated.structuredPaperInsights === undefined
        ? {}
        : { structuredPaperInsights: generated.structuredPaperInsights }),
    }
  }
}
