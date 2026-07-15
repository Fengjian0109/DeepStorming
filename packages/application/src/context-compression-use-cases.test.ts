import { expect, it } from 'vitest'
import type { ContextSnapshot } from '@deepstorming/domain'
import type {
  ContextCompressionGeneratorPort,
  ContextCompressionJob,
  ContextCompressionJobRepositoryPort,
} from './context-compression-ports'
import { PrepareLessonContextCompression } from './context-compression-use-cases'
import type { ContextSnapshotRepositoryPort, StoredLessonSession } from './lesson-ports'

const lessonId = '00000000-0000-4000-8000-000000000101'
const operationId = '00000000-0000-4000-8000-000000000201'
const now = '2026-07-15T03:00:00.000Z'
const session = (): StoredLessonSession => ({
  id: lessonId,
  title: 'lesson',
  status: 'active',
  documentId: 'doc',
  documentTitle: 'doc',
  sourceAnchors: [],
  messages: Array.from({ length: 10 }, (_, index) => ({
    id: `m${index}`,
    lessonId,
    modelRunId: null,
    role: index % 2 === 0 ? ('learner' as const) : ('tutor' as const),
    content: '中'.repeat(300),
    sourceAnchorIds: [],
    promptVersion: 'v1',
    createdAt: now,
  })),
  modelRuns: [],
  currentState: 'probing',
  steps: [],
  masteryEvidence: [],
  misconceptionSignals: [],
  reviewItems: [],
  reviewEvents: [],
  lessonMode: 'standard',
  paperProfile: null,
  createdAt: now,
  updatedAt: now,
})
class Jobs implements ContextCompressionJobRepositoryPort {
  records = new Map<string, ContextCompressionJob>()
  statuses: string[] = []
  async find(id: string) {
    return this.records.get(id)
  }
  async create(job: ContextCompressionJob) {
    this.records.set(job.operationId, job)
    this.statuses.push(job.status)
    return 'created' as const
  }
  async save(job: ContextCompressionJob) {
    this.records.set(job.operationId, job)
    this.statuses.push(job.status)
    return job
  }
}
class Snapshots implements ContextSnapshotRepositoryPort {
  values: ContextSnapshot[] = []
  active: ContextSnapshot | undefined
  async create(value: ContextSnapshot) {
    this.values.push(value)
    return 'created' as const
  }
  async listForLesson() {
    return this.values
  }
  async findActive() {
    return this.active
  }
  async activate(_lessonId: string, id: string) {
    this.active = this.values.find((value) => value.id === id)
    return this.active ? ('activated' as const) : ('not_found' as const)
  }
}
const token = { cancelled: false, onCancel: () => () => undefined }
const content = {
  summaryMarkdown: 'AI summary',
  facts: ['fact'],
  mastery: ['mastered'],
  misconceptions: [],
  unresolvedQuestions: ['question'],
  sourceAnchorIds: [],
  figureIds: [],
}

it('persists started before AI work and activates a new immutable snapshot', async () => {
  const jobs = new Jobs()
  const snapshots = new Snapshots()
  const observed: string[] = []
  const generator: ContextCompressionGeneratorPort = {
    activeModelName: async () => 'mock-4k',
    generate: async () => {
      observed.push(jobs.statuses.at(-1) ?? 'none')
      return content
    },
  }
  const useCase = new PrepareLessonContextCompression(
    snapshots,
    jobs,
    generator,
    () => now,
    () => '00000000-0000-4000-8000-000000000301',
  )
  const result = await useCase.execute(
    {
      session: session(),
      operationId,
      thresholdPercent: 30,
      recentTurnCount: 2,
      reservedOutputTokens: 200,
      fixedPromptTokens: 900,
    },
    token,
  )
  expect(observed).toEqual(['started'])
  expect(result.status).toBe('compressed')
  expect(jobs.statuses).toEqual(['started', 'succeeded'])
  expect(snapshots.active?.preservedRecentMessageIds).toEqual(['m8', 'm9'])
  expect(session().messages).toHaveLength(10)
})

it('keeps the previous active snapshot when AI compression fails below the hard limit', async () => {
  const jobs = new Jobs()
  const snapshots = new Snapshots()
  const previous = {
    ...content,
    id: 'old',
    lessonId,
    version: 1,
    modelName: 'mock-4k',
    contextWindowTokens: 4_096,
    estimatedInputTokens: 2_900,
    reservedOutputTokens: 200,
    remainingTokens: 996,
    remainingPercent: 24.32,
    thresholdPercent: 30,
    coveredMessageIds: ['m0'],
    preservedRecentMessageIds: ['m0'],
    createdAt: now,
  }
  snapshots.active = previous
  const generator: ContextCompressionGeneratorPort = {
    activeModelName: async () => 'mock-4k',
    generate: async () => {
      throw new Error('provider failed')
    },
  }
  const result = await new PrepareLessonContextCompression(
    snapshots,
    jobs,
    generator,
    () => now,
    () => '00000000-0000-4000-8000-000000000302',
  ).execute(
    {
      session: session(),
      operationId,
      thresholdPercent: 30,
      recentTurnCount: 2,
      reservedOutputTokens: 200,
      fixedPromptTokens: 500,
    },
    token,
  )
  expect(result).toMatchObject({ status: 'continued_with_previous', snapshot: previous })
  expect(snapshots.active).toBe(previous)
  expect(jobs.statuses).toEqual(['started', 'failed'])
})
