import type {
  LessonMessage,
  LessonModelRun,
  LessonSession,
  LessonSourceAnchor,
  LessonSessionStatus,
} from '@deepstorming/domain'

export type StoredLessonSourceAnchor = LessonSourceAnchor
export type StoredLessonMessage = LessonMessage
export type StoredLessonModelRun = LessonModelRun

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

export interface LessonRepositoryPort {
  list(): Promise<readonly StoredLessonSession[]>
  findById(id: string): Promise<StoredLessonSession | undefined>
  create(session: StoredLessonSession): Promise<StoredLessonSession>
  save(session: StoredLessonSession): Promise<StoredLessonSession>
}
