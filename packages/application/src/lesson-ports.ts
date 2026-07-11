import type { LessonSession, LessonSourceAnchor, LessonSessionStatus } from '@deepstorming/domain'

export type StoredLessonSourceAnchor = LessonSourceAnchor

export type StoredLessonSession = Readonly<{
  id: string
  title: string
  status: LessonSessionStatus
  documentId: string
  documentTitle: string
  sourceAnchors: readonly StoredLessonSourceAnchor[]
  createdAt: string
  updatedAt: string
}>

export type LessonSessionView = LessonSession

export interface LessonRepositoryPort {
  list(): Promise<readonly StoredLessonSession[]>
  findById(id: string): Promise<StoredLessonSession | undefined>
  create(session: StoredLessonSession): Promise<StoredLessonSession>
}
