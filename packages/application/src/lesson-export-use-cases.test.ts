import { describe, expect, it } from 'vitest'
import type { DocumentAssetStorePort, DocumentFigureRepositoryPort } from './document-ports'
import type {
  LessonExportDestinationPort,
  LessonExportJob,
  LessonExportJobRepositoryPort,
  LessonExportPayload,
  LessonTranscriptExporterPort,
} from './lesson-export-ports'
import {
  CancelLessonExport,
  ExportLessonTranscript,
  LessonExportOperations,
} from './lesson-export-use-cases'
import type { LessonRepositoryPort, StoredLessonSession } from './lesson-ports'

const lessonId = '00000000-0000-4000-8000-000000000101'
const documentId = '00000000-0000-4000-8000-000000000201'
const operationId = '00000000-0000-4000-8000-000000000301'
const figureId = 'figure-1'
const now = '2026-07-15T01:00:00.000Z'

const session = (): StoredLessonSession => ({
  id: lessonId,
  title: '注意力机制',
  status: 'completed',
  documentId,
  documentTitle: '深度学习',
  sourceAnchors: [],
  messages: [
    {
      id: 'message-1',
      lessonId,
      modelRunId: null,
      role: 'learner',
      content: '$a=\\sum_{i=1}^{N}i^2$',
      sourceAnchorIds: [],
      promptVersion: 'private-prompt-v1',
      createdAt: now,
    },
    {
      id: 'message-2',
      lessonId,
      modelRunId: null,
      role: 'tutor',
      content: 'legacy',
      sourceAnchorIds: [],
      promptVersion: 'private-tutor-v1',
      createdAt: now,
      tutorTurn: {
        narration: '导师翻开课本。',
        responseMarkdown: '这是公式。',
        citations: [
          {
            chunkId: 'chunk-1',
            quote: '注意力是一种映射',
            rationale: '定义',
            pageNumberStart: 2,
            pageNumberEnd: 2,
          },
        ],
        figureReferences: [{ figureId, rationale: '结构示意' }],
      },
    },
  ],
  modelRuns: [
    {
      id: 'run-secret',
      lessonId,
      providerId: 'provider-secret',
      modelName: 'secret-model',
      operation: 'lesson_tutor_first_question',
      status: 'succeeded',
      promptManifest: { key: 'secret.prompt', version: 1, hash: 'secret-hash' },
      inputSummary: {
        documentId,
        documentTitle: '深度学习',
        sourceAnchorIds: [],
        sourceCharacterRange: { startOffset: 0, endOffset: 1 },
        snippetCharacterCount: 1,
        contextCharacterCount: 1,
        contextChunks: [],
      },
      sourceAnchorIds: [],
      outputMessageId: 'message-2',
      errorSummary: null,
      startedAt: now,
      finishedAt: now,
    },
  ],
  currentState: 'completed',
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

class Jobs implements LessonExportJobRepositoryPort {
  readonly records = new Map<string, LessonExportJob>()
  readonly statuses: string[] = []
  async find(id: string) {
    return this.records.get(id)
  }
  async create(job: LessonExportJob) {
    if (this.records.has(job.operationId)) return 'exists' as const
    this.records.set(job.operationId, job)
    this.statuses.push(job.status)
    return 'created' as const
  }
  async save(job: LessonExportJob) {
    this.records.set(job.operationId, job)
    this.statuses.push(job.status)
    return job
  }
}

const dependencies = () => {
  const jobs = new Jobs()
  const payloads: LessonExportPayload[] = []
  const lessons: LessonRepositoryPort = {
    list: async () => [session()],
    findById: async (id) => (id === lessonId ? session() : undefined),
    create: async (value) => value,
    save: async (value) => value,
  }
  const figures: DocumentFigureRepositoryPort = {
    isFigureExtractionComplete: async () => true,
    completeFigureExtraction: async () => undefined,
    listFigures: async () => [
      {
        id: figureId,
        documentId,
        pageNumber: 2,
        label: '图 1',
        caption: '结构',
        assetId: 'asset-1',
        assetKind: 'embedded_image',
        width: 10,
        height: 10,
        createdAt: now,
      },
    ],
  }
  const assets: DocumentAssetStorePort = {
    writeFigure: async () => ({ assetId: 'asset-1', storedPath: '/asset' }),
    readFigure: async () => new Uint8Array([1, 2, 3]),
    deleteFigure: async () => undefined,
  }
  const destination: LessonExportDestinationPort = { choose: async () => '/tmp/lesson.md' }
  const markdown: LessonTranscriptExporterPort = {
    export: async (payload) => {
      payloads.push(payload)
    },
  }
  const pdf: LessonTranscriptExporterPort = { export: async () => undefined }
  const operations = new LessonExportOperations()
  return { jobs, payloads, lessons, figures, assets, destination, markdown, pdf, operations }
}

describe('ExportLessonTranscript', () => {
  it('persists started before export and only supplies referenced figure assets', async () => {
    const d = dependencies()
    const useCase = new ExportLessonTranscript(
      d.lessons,
      d.figures,
      d.assets,
      d.jobs,
      d.destination,
      d.markdown,
      d.pdf,
      () => now,
      d.operations,
    )
    const result = await useCase.execute({ lessonId, operationId, format: 'markdown' })
    expect(result).toMatchObject({
      outcome: 'exported',
      targetPath: '/tmp/lesson.md',
      format: 'markdown',
    })
    expect(d.jobs.statuses).toEqual(['started', 'succeeded'])
    expect(d.payloads[0]?.figures).toHaveLength(1)
    expect(d.payloads[0]?.session.modelRuns).toEqual([])
    expect(d.payloads[0]?.session.messages.map((message) => message.promptVersion)).toEqual([
      'exported',
      'exported',
    ])
  })

  it('returns dialog_cancelled without creating a job', async () => {
    const d = dependencies()
    d.destination.choose = async () => undefined
    const result = await new ExportLessonTranscript(
      d.lessons,
      d.figures,
      d.assets,
      d.jobs,
      d.destination,
      d.markdown,
      d.pdf,
      () => now,
      d.operations,
    ).execute({ lessonId, operationId, format: 'pdf' })
    expect(result).toEqual({ outcome: 'dialog_cancelled', format: 'pdf' })
    expect(d.jobs.records.size).toBe(0)
  })

  it('replays a succeeded operation without writing twice', async () => {
    const d = dependencies()
    d.jobs.records.set(operationId, {
      operationId,
      lessonId,
      format: 'markdown',
      targetPath: '/tmp/lesson.md',
      status: 'succeeded',
      errorCode: null,
      startedAt: now,
      finishedAt: now,
    })
    const result = await new ExportLessonTranscript(
      d.lessons,
      d.figures,
      d.assets,
      d.jobs,
      d.destination,
      d.markdown,
      d.pdf,
      () => now,
      d.operations,
    ).execute({ lessonId, operationId, format: 'markdown' })
    expect(result.outcome).toBe('exported')
    expect(d.payloads).toHaveLength(0)
  })

  it('persists cancellation and clears the operation registry', async () => {
    const d = dependencies()
    d.markdown.export = async (_payload, _path, token) => {
      d.operations.cancel(operationId)
      if (token.cancelled) throw new Error('cancelled')
    }
    const useCase = new ExportLessonTranscript(
      d.lessons,
      d.figures,
      d.assets,
      d.jobs,
      d.destination,
      d.markdown,
      d.pdf,
      () => now,
      d.operations,
    )
    await expect(
      useCase.execute({ lessonId, operationId, format: 'markdown' }),
    ).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
    expect(d.jobs.statuses).toEqual(['started', 'cancelled'])
    expect(new CancelLessonExport(d.operations).execute({ operationId })).toEqual({
      cancelled: false,
    })
  })
})
