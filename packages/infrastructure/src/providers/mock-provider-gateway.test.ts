import { expect, test } from 'vitest'

import { ProviderUseCaseError, type CancellationToken } from '@deepstorming/application'
import type { LessonSession } from '@deepstorming/domain'

import { MockProviderGateway } from './mock-provider-gateway'

const liveToken = (): CancellationToken => ({ cancelled: false, onCancel: () => () => undefined })

test('returns deterministic structured lesson memory through the mock provider', async () => {
  const session = {
    id: 'lesson-1',
    title: 'Attention',
    documentId: 'document-1',
    documentTitle: 'Deep Learning',
    messages: [{ role: 'learner', content: 'answer' }],
    sourceAnchors: [],
  } as unknown as LessonSession
  const result = await new MockProviderGateway().generateLessonMemory(
    { modelName: 'mock-success', session },
    liveToken(),
  )
  expect(JSON.parse(result.content)).toMatchObject({
    lessonMemory: { topic: 'Attention' },
    documentMemory: { nextLessonStart: '从Attention的未解决问题继续。' },
  })
})

test.each([
  ['mock-success', undefined],
  ['mock-auth', 'PROVIDER_AUTH_FAILED'],
  ['mock-rate-limit', 'PROVIDER_RATE_LIMITED'],
  ['mock-model-not-found', 'PROVIDER_MODEL_NOT_FOUND'],
  ['mock-invalid', 'PROVIDER_RESPONSE_INVALID'],
] as const)('maps deterministic mock model %s', async (modelName, code) => {
  const action = new MockProviderGateway().testConnection({ modelName }, liveToken())
  if (code === undefined) {
    await expect(action).resolves.toBeUndefined()
  } else {
    await expect(action).rejects.toMatchObject({ code })
  }
})

test('honors cancellation while mock-delay is pending', async () => {
  let listener: (() => void) | undefined
  const token: CancellationToken = {
    get cancelled() {
      return listener === undefined ? false : true
    },
    onCancel: (next) => {
      listener = next
      return () => undefined
    },
  }
  const pending = new MockProviderGateway({ delayMs: 60_000 }).testConnection(
    { modelName: 'mock-delay' },
    token,
  )
  listener?.()
  await expect(pending).rejects.toEqual(
    new ProviderUseCaseError('OPERATION_CANCELLED', 'The provider test was cancelled.', false),
  )
})

test('generates deterministic lesson tutor replies from source evidence and learner text', async () => {
  await expect(
    new MockProviderGateway().generateLessonTutorReply(
      {
        modelName: 'mock-success',
        documentTitle: 'Research Notes',
        sourceSnippet: 'Evidence',
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            text: 'Prior context',
            pageNumberStart: 1,
            pageNumberEnd: 1,
            charCount: 13,
          },
        ],
        learnerReply: '它在说明证据如何支撑判断。',
      },
      liveToken(),
    ),
  ).resolves.toEqual({
    content: JSON.stringify({
      narration: null,
      responseMarkdown:
        '你刚才提到：“它在说明证据如何支撑判断。”。我们把它和证据“Evidence”连起来，参考这些上下文：“Prior context”。下一步你会如何验证这个判断？',
      citations: [],
      figureReferences: [],
    }),
  })
})

test('honors cancellation while mock lesson generation is pending', async () => {
  let listener: (() => void) | undefined
  const token: CancellationToken = {
    get cancelled() {
      return listener === undefined ? false : true
    },
    onCancel: (next) => {
      listener = next
      return () => undefined
    },
  }
  const pending = new MockProviderGateway({ delayMs: 60_000 }).generateLessonTutorReply(
    {
      modelName: 'mock-delay',
      documentTitle: 'Research Notes',
      sourceSnippet: 'Evidence',
      contextChunks: [],
      learnerReply: '它在说明证据如何支撑判断。',
    },
    token,
  )
  listener?.()
  await expect(pending).rejects.toEqual(
    new ProviderUseCaseError('OPERATION_CANCELLED', 'The provider test was cancelled.', false),
  )
})

test('generates deterministic first questions from source evidence and chunk context', async () => {
  await expect(
    new MockProviderGateway().generateLessonTutorFirstQuestion(
      {
        modelName: 'mock-success',
        documentTitle: 'Research Notes',
        sourceSnippet: 'Evidence',
        contextChunks: [
          {
            chunkId: '00000000-0000-4000-8000-000000000901',
            text: 'Prior context',
            pageNumberStart: 1,
            pageNumberEnd: 1,
            charCount: 13,
          },
        ],
      },
      liveToken(),
    ),
  ).resolves.toEqual({
    content: JSON.stringify({
      narration: null,
      responseMarkdown:
        '我们先从《Research Notes》的这段证据开始：Evidence\n\n结合这些上下文片段，你觉得它想解决的核心问题是什么？',
      citations: [],
      figureReferences: [],
    }),
  })
})
