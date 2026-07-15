import { normalizeContextSnapshot, type ContextSnapshot } from '@deepstorming/domain'
import {
  calculateContextBudget,
  estimateTextTokens,
  selectRecentMessageIds,
} from './context-budget'
import type {
  ContextCompressionGeneratorPort,
  ContextCompressionJobRepositoryPort,
} from './context-compression-ports'
import type { ContextSnapshotRepositoryPort, StoredLessonSession } from './lesson-ports'
import { LessonUseCaseError } from './lesson-use-cases'
import type { CancellationToken } from './provider-ports'

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu
export type ContextCompressionResult =
  | Readonly<{
      status: 'not_needed'
      budget: ReturnType<typeof calculateContextBudget>
      snapshot?: ContextSnapshot
    }>
  | Readonly<{
      status: 'compressed'
      budget: ReturnType<typeof calculateContextBudget>
      snapshot: ContextSnapshot
    }>
  | Readonly<{
      status: 'continued_with_previous'
      budget: ReturnType<typeof calculateContextBudget>
      snapshot: ContextSnapshot
    }>
  | Readonly<{
      status: 'continued_without_snapshot'
      budget: ReturnType<typeof calculateContextBudget>
    }>

export class PrepareLessonContextCompression {
  public constructor(
    private readonly snapshots: ContextSnapshotRepositoryPort,
    private readonly jobs: ContextCompressionJobRepositoryPort,
    private readonly generator: ContextCompressionGeneratorPort,
    private readonly now: () => string,
    private readonly id: () => string,
  ) {}

  async execute(
    input: Readonly<{
      session: StoredLessonSession
      operationId: string
      thresholdPercent: number
      recentTurnCount: number
      reservedOutputTokens: number
      fixedPromptTokens: number
    }>,
    token: CancellationToken,
  ): Promise<ContextCompressionResult> {
    if (!UUID.test(input.operationId))
      throw new LessonUseCaseError(
        'LESSON_VALIDATION_FAILED',
        'Context compression operation id is invalid.',
        false,
      )
    const modelName = await this.generator.activeModelName()
    const estimatedInputTokens =
      input.fixedPromptTokens +
      input.session.messages.reduce(
        (sum, message) => sum + estimateTextTokens(message.content) + 8,
        0,
      )
    const budget = calculateContextBudget({
      modelName,
      estimatedInputTokens,
      reservedOutputTokens: input.reservedOutputTokens,
      thresholdPercent: input.thresholdPercent,
    })
    const previous = await this.snapshots.findActive(input.session.id)
    if (!budget.shouldCompress)
      return {
        status: 'not_needed',
        budget,
        ...(previous === undefined ? {} : { snapshot: previous }),
      }

    const replay = await this.jobs.find(input.operationId)
    if (replay?.status === 'succeeded' && replay.snapshotId !== null) {
      const snapshot = (await this.snapshots.listForLesson(input.session.id)).find(
        (value) => value.id === replay.snapshotId,
      )
      if (snapshot !== undefined) return { status: 'compressed', budget, snapshot }
    }
    if (replay?.status === 'started')
      throw new LessonUseCaseError(
        'LESSON_END_IN_PROGRESS',
        'Context compression is already running.',
        false,
      )

    const startedAt = this.now()
    const started = {
      operationId: input.operationId,
      lessonId: input.session.id,
      status: 'started' as const,
      snapshotId: null,
      errorCode: null,
      startedAt,
      finishedAt: null,
    }
    if (replay === undefined) await this.jobs.create(started)
    else await this.jobs.save(started)
    try {
      if (token.cancelled) throw new Error('cancelled')
      const preservedRecentMessageIds = selectRecentMessageIds(
        input.session.messages,
        input.recentTurnCount,
      )
      const generated = await this.generator.generate(
        {
          session: input.session,
          ...(previous === undefined ? {} : { previousSnapshot: previous }),
          preservedRecentMessageIds,
        },
        token,
      )
      if (token.cancelled) throw new Error('cancelled')
      const existing = await this.snapshots.listForLesson(input.session.id)
      const snapshot = normalizeContextSnapshot({
        id: this.id(),
        lessonId: input.session.id,
        version: Math.max(0, ...existing.map((value) => value.version)) + 1,
        modelName,
        contextWindowTokens: budget.contextWindowTokens,
        estimatedInputTokens: budget.estimatedInputTokens,
        reservedOutputTokens: budget.reservedOutputTokens,
        remainingTokens: budget.remainingTokens,
        remainingPercent: budget.remainingPercent,
        thresholdPercent: budget.thresholdPercent,
        coveredMessageIds: input.session.messages.map((message) => message.id),
        preservedRecentMessageIds,
        ...generated,
        createdAt: this.now(),
      })
      const created = await this.snapshots.create(snapshot)
      if (created === 'exists') throw new Error('snapshot conflict')
      if ((await this.snapshots.activate(input.session.id, snapshot.id)) !== 'activated')
        throw new Error('snapshot activation failed')
      await this.jobs.save({
        ...started,
        status: 'succeeded',
        snapshotId: snapshot.id,
        finishedAt: this.now(),
      })
      return { status: 'compressed', budget, snapshot }
    } catch {
      const cancelled = token.cancelled
      await this.jobs.save({
        ...started,
        status: cancelled ? 'cancelled' : 'failed',
        errorCode: cancelled ? 'OPERATION_CANCELLED' : 'AI_GENERATION_FAILED',
        finishedAt: this.now(),
      })
      if (cancelled)
        throw new LessonUseCaseError(
          'OPERATION_CANCELLED',
          'Context compression was cancelled.',
          true,
        )
      if (!budget.hardLimitReached && previous !== undefined)
        return { status: 'continued_with_previous', budget, snapshot: previous }
      if (!budget.hardLimitReached) return { status: 'continued_without_snapshot', budget }
      throw new LessonUseCaseError(
        'AI_GENERATION_FAILED',
        budget.hardLimitReached
          ? 'The context limit was reached and AI compression failed.'
          : 'AI context compression failed.',
        true,
      )
    }
  }
}
