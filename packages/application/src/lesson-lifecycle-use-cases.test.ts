import { describe, expect, it, vi } from 'vitest'

import type { DocumentLearningMemory } from '@deepstorming/domain'
import type {
  LessonMemoryGeneratorPort,
  LessonMemoryRepositoryPort,
  LessonRepositoryPort,
  StoredLessonSession,
} from './lesson-ports'
import { ChoosePostLessonAction, CompleteLessonReview, EndLesson } from './lesson-use-cases'

const lessonId = '00000000-0000-4000-8000-000000000101'
const documentId = '00000000-0000-4000-8000-000000000201'
const operationId = '00000000-0000-4000-8000-000000000301'
const now = '2026-07-15T00:00:00.000Z'

const session = (): StoredLessonSession =>
  ({
    id: lessonId,
    title: 'Attention · 第一课',
    status: 'active',
    documentId,
    documentTitle: 'Deep Learning',
    sourceAnchors: [],
    messages: [
      {
        id: '00000000-0000-4000-8000-000000000401',
        lessonId,
        modelRunId: null,
        role: 'learner',
        content: '我理解了 query 与 key 的匹配。',
        sourceAnchorIds: [],
        promptVersion: 'learner-v1',
        createdAt: now,
      },
    ],
    modelRuns: [],
    currentState: 'probing',
    steps: [],
    masteryEvidence: [],
    misconceptionSignals: [],
    reviewItems: [],
    reviewEvents: [],
    lessonMode: 'standard',
    paperProfile: null,
    pace: 'standard',
    createdAt: now,
    updatedAt: now,
  }) as StoredLessonSession

class Lessons implements LessonRepositoryPort {
  public record = session()
  public readonly savedStatuses: string[] = []

  async list(): Promise<readonly StoredLessonSession[]> {
    return [this.record]
  }

  async findById(id: string): Promise<StoredLessonSession | undefined> {
    return id === this.record.id ? this.record : undefined
  }

  async create(next: StoredLessonSession): Promise<StoredLessonSession> {
    this.record = next
    return next
  }

  async save(next: StoredLessonSession): Promise<StoredLessonSession> {
    this.record = next
    this.savedStatuses.push(next.status)
    return next
  }
}

class Memories implements LessonMemoryRepositoryPort {
  public memory: DocumentLearningMemory | undefined
  public readonly expectedRevisions: Array<number | null> = []

  async findDocumentMemory(): Promise<DocumentLearningMemory | undefined> {
    return this.memory
  }

  async saveDocumentMemory(
    memory: DocumentLearningMemory,
    expectedRevision: number | null,
  ): Promise<'saved' | 'stale'> {
    this.expectedRevisions.push(expectedRevision)
    this.memory = memory
    return 'saved'
  }
}

const generatedMemory = {
  lessonMemory: {
    topic: 'Attention',
    coverage: 'Query、Key 与缩放点积',
    summaryMarkdown: '本节建立了注意力的基础映射。',
    mastered: ['query-key mapping'],
    unstable: ['scaling'],
    misconceptions: [],
    sourceAnchorIds: [],
    figureIds: [],
    unresolvedQuestions: ['why sqrt(d)?'],
    reviewPrompts: ['请解释为什么需要缩放。'],
    nextLessonStart: '推导缩放因子',
  },
  documentMemory: {
    summaryMarkdown: '已掌握注意力映射，缩放仍待巩固。',
    mastered: ['query-key mapping'],
    unstable: ['scaling'],
    misconceptions: [],
    unresolvedQuestions: ['why sqrt(d)?'],
    nextLessonStart: '推导缩放因子',
  },
} as const

describe('lesson lifecycle use cases', () => {
  it('persists the end job before AI work, saves memory, and replays idempotently', async () => {
    const lessons = new Lessons()
    const memories = new Memories()
    const previous: DocumentLearningMemory = {
      documentId,
      revision: 1,
      summaryMarkdown: 'Previous memory',
      mastered: [],
      unstable: [],
      misconceptions: [],
      unresolvedQuestions: [],
      nextLessonStart: 'Attention',
      sourceLessonIds: ['00000000-0000-4000-8000-000000000102'],
      updatedAt: '2026-07-14T00:00:00.000Z',
    }
    memories.memory = previous
    const generator: LessonMemoryGeneratorPort = {
      generate: vi.fn(async (input) => {
        expect(lessons.record.status).toBe('summarizing')
        expect(lessons.record.endJob).toMatchObject({ operationId, status: 'started' })
        expect(input.previousDocumentMemory).toEqual(previous)
        return generatedMemory
      }),
    }
    const useCase = new EndLesson(lessons, memories, generator, { now: () => now })

    const ended = await useCase.execute(
      { lessonId, operationId },
      { cancelled: false, onCancel: () => () => undefined },
    )

    expect(lessons.savedStatuses).toEqual(['summarizing', 'pending_review'])
    expect(ended.status).toBe('pending_review')
    expect(ended.memory).toMatchObject({ lessonId, documentId, topic: 'Attention' })
    expect(ended.endJob).toMatchObject({ operationId, status: 'succeeded', finishedAt: now })
    expect(memories.memory).toMatchObject({
      documentId,
      revision: 2,
      sourceLessonIds: [previous.sourceLessonIds[0], lessonId],
    })
    expect(memories.expectedRevisions).toEqual([1])

    await expect(
      useCase.execute(
        { lessonId, operationId },
        { cancelled: false, onCancel: () => () => undefined },
      ),
    ).resolves.toEqual(ended)
    expect(generator.generate).toHaveBeenCalledOnce()
  })

  it('persists a recoverable failed job without fabricating memory', async () => {
    const lessons = new Lessons()
    const memories = new Memories()
    const generator: LessonMemoryGeneratorPort = {
      generate: vi.fn().mockRejectedValue(new Error('provider secret detail')),
    }
    const useCase = new EndLesson(lessons, memories, generator, { now: () => now })

    await expect(
      useCase.execute(
        { lessonId, operationId },
        { cancelled: false, onCancel: () => () => undefined },
      ),
    ).rejects.toMatchObject({ code: 'AI_GENERATION_FAILED', retryable: true })
    expect(lessons.record.status).toBe('error')
    expect(lessons.record.memory).toBeUndefined()
    expect(lessons.record.endJob).toMatchObject({
      status: 'failed',
      errorSummary: { code: 'AI_GENERATION_FAILED' },
    })
  })

  it('persists a recoverable end job when cumulative memory cannot be read', async () => {
    const lessons = new Lessons()
    const memories = new Memories()
    memories.findDocumentMemory = async () => {
      throw new Error('sqlite detail')
    }
    const generator: LessonMemoryGeneratorPort = { generate: vi.fn() }
    const useCase = new EndLesson(lessons, memories, generator, { now: () => now })

    await expect(
      useCase.execute(
        { lessonId, operationId },
        { cancelled: false, onCancel: () => () => undefined },
      ),
    ).rejects.toMatchObject({ code: 'DATABASE_UNAVAILABLE' })
    expect(lessons.record).toMatchObject({
      status: 'error',
      endJob: { status: 'failed', errorSummary: { code: 'DATABASE_UNAVAILABLE' } },
    })
    expect(generator.generate).not.toHaveBeenCalled()
  })

  it('branches to immediate review or rest and completes only after a saved review', async () => {
    const lessons = new Lessons()
    lessons.record = {
      ...lessons.record,
      status: 'pending_review',
      memory: {
        lessonId,
        documentId,
        ...generatedMemory.lessonMemory,
        createdAt: now,
      },
    }
    const choose = new ChoosePostLessonAction(lessons, { now: () => now })
    const complete = new CompleteLessonReview(lessons, { now: () => now })

    const resting = await choose.execute({ lessonId, action: 'rest' })
    expect(resting).toMatchObject({ status: 'pending_review', postLessonAction: 'rest' })
    await expect(complete.execute({ lessonId, response: '不能跳过复习。' })).rejects.toMatchObject({
      code: 'LESSON_INVALID_TRANSITION',
    })

    const reviewing = await choose.execute({ lessonId, action: 'immediate_review' })
    expect(reviewing).toMatchObject({ status: 'reviewing', postLessonAction: 'immediate_review' })
    const completed = await complete.execute({ lessonId, response: '缩放避免点积过大。' })
    expect(completed).toMatchObject({
      status: 'completed',
      reviewResponse: '缩放避免点积过大。',
      completedAt: now,
    })
  })
})
