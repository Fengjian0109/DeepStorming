import type {
  LessonMessage,
  LessonModelRun,
  LessonSession,
  LessonSourceAnchor,
  LessonSessionStatus,
} from '@deepstorming/domain'
import type { StoredDocumentTextBlock } from './document-ports'
import type { CancellationToken } from './provider-ports'

export type StoredLessonSourceAnchor = LessonSourceAnchor
export type StoredLessonMessage = LessonMessage
export type StoredLessonModelRun = LessonModelRun

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
  createdAt: string
  updatedAt: string
}>

export type LessonSessionView = LessonSession

export type LessonTutorReplyRequest = Readonly<{
  documentTitle: string
  sourceSnippet: string
  learnerReply: string
}>

export type LessonTutorReplyResult = Readonly<{
  content: string
  providerId: string | null
  modelName: string
}>

export interface LessonTutorReplyGeneratorPort {
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
