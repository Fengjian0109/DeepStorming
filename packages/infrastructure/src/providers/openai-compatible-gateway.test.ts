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
