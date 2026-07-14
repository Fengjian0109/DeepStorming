import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import type { CancellationToken } from '@deepstorming/application'

import { OpenAICompatibleGateway } from './openai-compatible-gateway'

const liveToken = (): CancellationToken => ({ cancelled: false, onCancel: () => () => undefined })

let server: ReturnType<typeof createServer>
let baseUrl: string
let requests: Array<{
  readonly url: string
  readonly authorization?: string
  readonly body: string
}>

const readBody = async (request: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString()
}

const startServer = async (
  handler: (request: IncomingMessage, response: ServerResponse, body: string) => void,
) => {
  requests = []
  server = createServer(async (request, response) => {
    const body = await readBody(request)
    requests.push({
      url: request.url ?? '',
      body,
      ...(request.headers.authorization === undefined
        ? {}
        : { authorization: request.headers.authorization }),
    })
    handler(request, response, body)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address !== 'object' || address === null) throw new Error('server did not listen')
  baseUrl = `http://127.0.0.1:${address.port}/v1/`
}

beforeEach(() => {
  requests = []
})

afterEach(async () => {
  vi.useRealTimers()
  if (server !== undefined) await new Promise<void>((resolve) => server.close(() => resolve()))
})

test('posts minimal chat completions JSON to normalized URL with bearer auth', async () => {
  await startServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
  })

  await new OpenAICompatibleGateway(baseUrl).testConnection(
    { modelName: 'model-a', apiKey: 'secret-api-key' },
    liveToken(),
  )

  expect(requests).toHaveLength(1)
  expect(requests[0]?.url).toBe('/v1/chat/completions')
  expect(requests[0]?.authorization).toBe('Bearer secret-api-key')
  expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({
    model: 'model-a',
    messages: [{ role: 'user', content: 'ping' }],
    max_tokens: 1,
    stream: false,
  })
})

test.each([
  [401, { error: { code: 'bad-key', message: 'secret response body' } }, 'PROVIDER_AUTH_FAILED'],
  [
    402,
    { error: { code: 'insufficient_quota', message: 'secret response body' } },
    'PROVIDER_QUOTA_EXCEEDED',
  ],
  [
    404,
    { error: { code: 'not-found', message: 'secret response body' } },
    'PROVIDER_MODEL_NOT_FOUND',
  ],
  [
    429,
    { error: { code: 'rate-limit', message: 'secret response body' } },
    'PROVIDER_RATE_LIMITED',
  ],
] as const)('maps HTTP %i to safe provider error', async (statusCode, body, code) => {
  await startServer((_request, response) => {
    response.statusCode = statusCode
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(body))
  })

  await expect(
    new OpenAICompatibleGateway(baseUrl).testConnection(
      { modelName: 'model-a', apiKey: 'secret-api-key' },
      liveToken(),
    ),
  ).rejects.toMatchObject({
    code,
    details: { statusCode },
    message: expect.not.stringContaining('secret response body'),
  })
})

test('maps malformed JSON and missing choices to response invalid', async () => {
  await startServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end('{not-json')
  })
  await expect(
    new OpenAICompatibleGateway(baseUrl).testConnection({ modelName: 'model-a' }, liveToken()),
  ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' })

  await new Promise<void>((resolve) => server.close(() => resolve()))
  await startServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ choices: [] }))
  })
  await expect(
    new OpenAICompatibleGateway(baseUrl).testConnection({ modelName: 'model-a' }, liveToken()),
  ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' })
})

test('maps socket errors without leaking auth or response data', async () => {
  await startServer((_request, response) => {
    response.destroy(new Error('secret socket detail'))
  })

  await expect(
    new OpenAICompatibleGateway(baseUrl).testConnection(
      { modelName: 'model-a', apiKey: 'secret-api-key' },
      liveToken(),
    ),
  ).rejects.toMatchObject({
    code: 'PROVIDER_NETWORK_ERROR',
    message: expect.not.stringContaining('secret'),
  })
})

test('uses a 15-second default timeout and maps timeout safely', async () => {
  vi.useFakeTimers()
  await startServer(() => undefined)
  const gateway = new OpenAICompatibleGateway(baseUrl)

  const pending = gateway.testConnection({ modelName: 'model-a' }, liveToken())
  const expectation = expect(pending).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' })
  await vi.advanceTimersByTimeAsync(15_000)

  await expectation
})

test('bridges cancellation token to AbortController', async () => {
  await startServer(() => undefined)
  let cancelled = false
  let listener: (() => void) | undefined
  const token: CancellationToken = {
    get cancelled() {
      return cancelled
    },
    onCancel: (next) => {
      listener = next
      return () => undefined
    },
  }

  const pending = new OpenAICompatibleGateway(baseUrl, { timeoutMs: 60_000 }).testConnection(
    { modelName: 'model-a' },
    token,
  )
  await vi.waitFor(() => expect(listener).toBeTypeOf('function'))
  cancelled = true
  listener?.()

  await expect(pending).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
})

test('posts lesson tutor prompt and returns first assistant message content', async () => {
  await startServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ choices: [{ message: { content: '下一步请验证这个判断。' } }] }))
  })

  const result = await new OpenAICompatibleGateway(baseUrl).generateLessonTutorReply(
    {
      modelName: 'model-a',
      apiKey: 'secret-api-key',
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
  )

  expect(result).toEqual({ content: '下一步请验证这个判断。' })
  expect(requests).toHaveLength(1)
  expect(requests[0]?.url).toBe('/v1/chat/completions')
  expect(requests[0]?.authorization).toBe('Bearer secret-api-key')
  expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({
    model: 'model-a',
    messages: [
      {
        role: 'system',
        content:
          '你是 DeepStorming 的课堂导师。只基于用户提供的证据片段、扩展上下文和学习者回答继续追问，不编造来源。',
      },
      {
        role: 'user',
        content:
          '文档：Research Notes\n证据片段：Evidence\n扩展上下文：\n1. [1-1] Prior context\n学习者回答：它在说明证据如何支撑判断。\n请用中文提出一个简短追问，帮助学习者验证自己的判断。',
      },
    ],
    max_tokens: 220,
    stream: false,
  })
})

test('includes the frozen tutor profile and pace in the AI system prompt', async () => {
  await startServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ choices: [{ message: { content: '继续思考。' } }] }))
  })

  await new OpenAICompatibleGateway(baseUrl).generateLessonTutorFirstQuestion(
    {
      modelName: 'model-a',
      documentTitle: 'Research Notes',
      sourceSnippet: 'Evidence',
      contextChunks: [],
      lessonMode: 'paper',
      pace: 'slow',
      tutorSnapshot: {
        tutorProfileId: '00000000-0000-4000-8000-000000000201',
        tutorProfileRevision: 3,
        name: '苏格拉底导师',
        personality: '耐心、好奇',
        tone: '清晰、温和',
        expertiseTags: ['深度学习'],
        strictness: 3,
        socraticIntensity: 5,
        guidanceStyle: 'question_first',
        bookStrategy: '逐层追问',
        paperStrategy: '检验论文的问题、方法、证据与局限',
        customInstructions: '优先要求学习者举证',
        promptVersion: 'tutor-profile-v3',
      },
    },
    liveToken(),
  )

  const systemPrompt = JSON.parse(requests[0]?.body ?? '{}').messages[0].content as string
  expect(systemPrompt).toContain('课堂导师“苏格拉底导师”')
  expect(systemPrompt).toContain('检验论文的问题、方法、证据与局限')
  expect(systemPrompt).toContain('慢节奏')
  expect(systemPrompt).toContain('优先要求学习者举证')
})

test('posts first-question tutor prompt with chunk context', async () => {
  await startServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify({ choices: [{ message: { content: '这段证据想解释什么问题？' } }] }),
    )
  })

  const result = await new OpenAICompatibleGateway(baseUrl).generateLessonTutorFirstQuestion(
    {
      modelName: 'model-a',
      apiKey: 'secret-api-key',
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
  )

  expect(result).toEqual({ content: '这段证据想解释什么问题？' })
  expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({
    model: 'model-a',
    messages: [
      {
        role: 'system',
        content:
          '你是 DeepStorming 的课堂导师。只基于用户提供的证据片段和扩展上下文提出开场问题，不编造来源。',
      },
      {
        role: 'user',
        content:
          '文档：Research Notes\n证据片段：Evidence\n扩展上下文：\n1. [1-1] Prior context\n请用中文提出一个简短开场问题，帮助学习者先判断这段证据想解决的核心问题。',
      },
    ],
    max_tokens: 220,
    stream: false,
  })
})

test('rejects empty lesson tutor content as invalid provider response', async () => {
  await startServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ choices: [{ message: { content: '   ' } }] }))
  })

  await expect(
    new OpenAICompatibleGateway(baseUrl).generateLessonTutorReply(
      {
        modelName: 'model-a',
        documentTitle: 'Research Notes',
        sourceSnippet: 'Evidence',
        contextChunks: [],
        learnerReply: '它在说明证据如何支撑判断。',
      },
      liveToken(),
    ),
  ).rejects.toMatchObject({ code: 'PROVIDER_RESPONSE_INVALID' })
})
