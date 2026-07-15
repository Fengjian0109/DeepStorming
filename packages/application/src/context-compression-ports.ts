import type { ContextSnapshot } from '@deepstorming/domain'
import type { StoredLessonSession } from './lesson-ports'
import type { CancellationToken } from './provider-ports'

export type ContextCompressionJob = Readonly<{
  operationId: string
  lessonId: string
  status: 'started' | 'succeeded' | 'failed' | 'cancelled'
  snapshotId: string | null
  errorCode: string | null
  startedAt: string
  finishedAt: string | null
}>

export interface ContextCompressionJobRepositoryPort {
  find(operationId: string): Promise<ContextCompressionJob | undefined>
  create(job: ContextCompressionJob): Promise<'created' | 'exists'>
  save(job: ContextCompressionJob): Promise<ContextCompressionJob>
}

export type ContextCompressionContent = Pick<
  ContextSnapshot,
  | 'summaryMarkdown'
  | 'facts'
  | 'mastery'
  | 'misconceptions'
  | 'unresolvedQuestions'
  | 'sourceAnchorIds'
  | 'figureIds'
>

export interface ContextCompressionGeneratorPort {
  activeModelName(): Promise<string>
  generate(
    input: Readonly<{
      session: StoredLessonSession
      previousSnapshot?: ContextSnapshot
      preservedRecentMessageIds: readonly string[]
    }>,
    token: CancellationToken,
  ): Promise<ContextCompressionContent>
}
