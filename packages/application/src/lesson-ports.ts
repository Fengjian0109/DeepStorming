import type {
  LessonMessage,
  LessonMode,
  LessonPace,
  LessonTutorSnapshot,
  LessonModelRun,
  LessonState,
  LessonStep,
  LessonSession,
  LessonSourceAnchor,
  LessonSessionStatus,
  MasteryEvidence,
  MisconceptionSignal,
  PaperLessonProfile,
  PaperReadingStage,
  ReviewEvent,
  ReviewItem,
  TutorActionType,
} from '@deepstorming/domain'
import type { StoredDocumentTextBlock } from './document-ports'
import type { CancellationToken } from './provider-ports'

export type StoredLessonSourceAnchor = LessonSourceAnchor
export type StoredLessonMessage = LessonMessage
export type StoredLessonModelRun = LessonModelRun
export type StoredLessonStep = LessonStep
export type StoredMasteryEvidence = MasteryEvidence
export type StoredMisconceptionSignal = MisconceptionSignal
export type StoredReviewItem = ReviewItem
export type StoredReviewEvent = ReviewEvent

export interface DocumentSourceLocatorPort {
  findTextBlock(
    documentId: string,
    pageNumber: number,
    blockId: string,
  ): Promise<StoredDocumentTextBlock | undefined>
}

export type StoredLessonSession = Readonly<{
  id: string
  title: string
  status: LessonSessionStatus
  documentId: string
  documentTitle: string
  sourceAnchors: readonly StoredLessonSourceAnchor[]
  messages: readonly StoredLessonMessage[]
  modelRuns: readonly StoredLessonModelRun[]
  currentState: LessonState
  steps: readonly StoredLessonStep[]
  masteryEvidence: readonly StoredMasteryEvidence[]
  misconceptionSignals: readonly StoredMisconceptionSignal[]
  reviewItems: readonly StoredReviewItem[]
  reviewEvents: readonly StoredReviewEvent[]
  lessonMode: LessonMode
  paperProfile: PaperLessonProfile | null
  tutorSnapshot?: LessonTutorSnapshot
  pace?: LessonPace
  createdAt: string
  updatedAt: string
}>

export type LessonSessionView = LessonSession

export type LessonTutorReplyRequest = Readonly<{
  documentTitle: string
  sourceSnippet: string
  lessonMode: LessonMode
  paperStage: PaperReadingStage | null
  contextChunks: readonly LessonTutorContextChunk[]
  learnerReply: string
  tutorSnapshot?: LessonTutorSnapshot
  pace?: LessonPace
}>

export type LessonTutorFirstQuestionRequest = Readonly<{
  documentTitle: string
  sourceSnippet: string
  lessonMode: LessonMode
  paperStage: PaperReadingStage | null
  contextChunks: readonly LessonTutorContextChunk[]
  tutorSnapshot?: LessonTutorSnapshot
  pace?: LessonPace
}>

export type LessonTutorReplyResult = Readonly<{
  content: string
  providerId: string | null
  modelName: string
  actionType?: TutorActionType
  stateAfter?: LessonState
  rationale?: string
}>

export type LessonTutorContextChunk = Readonly<{
  chunkId: string
  text: string
  pageNumberStart: number
  pageNumberEnd: number
  charCount: number
}>

export interface LessonTutorReplyGeneratorPort {
  generateFirstQuestion(
    input: LessonTutorFirstQuestionRequest,
    token: CancellationToken,
  ): Promise<LessonTutorReplyResult>
  generateFollowUp(
    input: LessonTutorReplyRequest,
    token: CancellationToken,
  ): Promise<LessonTutorReplyResult>
}

export interface LessonRepositoryPort {
  list(): Promise<readonly StoredLessonSession[]>
  findById(id: string): Promise<StoredLessonSession | undefined>
  create(session: StoredLessonSession): Promise<StoredLessonSession>
  save(session: StoredLessonSession): Promise<StoredLessonSession>
}
