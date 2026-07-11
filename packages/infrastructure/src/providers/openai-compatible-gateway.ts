import {
  ProviderUseCaseError,
  type CancellationToken,
  type ProviderGatewayPort,
} from '@deepstorming/application'

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export class OpenAICompatibleGateway implements ProviderGatewayPort {
  public readonly baseUrl: string
  private readonly fetch: FetchLike
  private readonly timeoutMs: number

  public constructor(
    baseUrl: string,
    options: Readonly<{ fetch?: FetchLike; timeoutMs?: number }> = {},
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.timeoutMs = options.timeoutMs ?? 15_000
  }

  public async testConnection(
    input: Readonly<{ modelName: string; apiKey?: string }>,
    token: CancellationToken,
  ): Promise<void> {
    if (token.cancelled) throw cancelledError()
    const controller = new AbortController()
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)
    const unsubscribe = token.onCancel(() => controller.abort())

    try {
      const response = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(input.apiKey === undefined ? {} : { authorization: `Bearer ${input.apiKey}` }),
        },
        body: JSON.stringify({
          model: input.modelName,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false,
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw await httpError(response)
      const body: unknown = await response.json().catch(() => {
        throw new ProviderUseCaseError(
          'PROVIDER_RESPONSE_INVALID',
          'The provider returned an invalid response.',
          true,
        )
      })
      if (!hasChoices(body)) {
        throw new ProviderUseCaseError(
          'PROVIDER_RESPONSE_INVALID',
          'The provider returned an invalid response.',
          true,
          { fieldName: 'choices' },
        )
      }
    } catch (error) {
      if (token.cancelled) throw cancelledError()
      if (timedOut) {
        throw new ProviderUseCaseError('PROVIDER_TIMEOUT', 'The provider test timed out.', true)
      }
      if (error instanceof ProviderUseCaseError) throw error
      throw new ProviderUseCaseError(
        'PROVIDER_NETWORK_ERROR',
        'The provider test could not reach the provider.',
        true,
      )
    } finally {
      clearTimeout(timeout)
      unsubscribe()
    }
  }
}

const normalizeBaseUrl = (rawBaseUrl: string): string => {
  let normalized = rawBaseUrl.trim().replace(/\/+$/u, '')
  normalized = normalized.replace(/(?:\/chat\/completions)$/iu, '')
  return normalized.replace(/\/+$/u, '')
}

const cancelledError = (): ProviderUseCaseError =>
  new ProviderUseCaseError('OPERATION_CANCELLED', 'The provider test was cancelled.', false)

const httpError = async (response: Response): Promise<ProviderUseCaseError> => {
  const statusCode = response.status
  const bodyCode = await readSafeBodyCode(response)
  if (statusCode === 401) {
    return new ProviderUseCaseError(
      'PROVIDER_AUTH_FAILED',
      'The provider rejected the credential.',
      false,
      { statusCode },
    )
  }
  if (statusCode === 402 || bodyCode?.includes('quota') === true) {
    return new ProviderUseCaseError(
      'PROVIDER_QUOTA_EXCEEDED',
      'The provider quota is exhausted.',
      false,
      { statusCode },
    )
  }
  if (statusCode === 404) {
    return new ProviderUseCaseError(
      'PROVIDER_MODEL_NOT_FOUND',
      'The provider model was not found.',
      false,
      { statusCode },
    )
  }
  if (statusCode === 429) {
    return new ProviderUseCaseError(
      'PROVIDER_RATE_LIMITED',
      'The provider rate limit was reached.',
      true,
      { statusCode },
    )
  }
  return new ProviderUseCaseError('PROVIDER_NETWORK_ERROR', 'The provider request failed.', true, {
    statusCode,
  })
}

const readSafeBodyCode = async (response: Response): Promise<string | undefined> => {
  const text = await response.text().catch(() => '')
  if (text.length === 0) return undefined
  try {
    const body: unknown = JSON.parse(text)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
    const error = (body as Record<string, unknown>)['error']
    if (typeof error !== 'object' || error === null || Array.isArray(error)) return undefined
    const code = (error as Record<string, unknown>)['code']
    return typeof code === 'string' ? code.toLowerCase() : undefined
  } catch {
    return undefined
  }
}

const hasChoices = (body: unknown): boolean => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
  const choices = (body as Record<string, unknown>)['choices']
  return Array.isArray(choices) && choices.length > 0
}
