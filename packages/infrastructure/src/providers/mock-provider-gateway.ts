import {
  ProviderUseCaseError,
  type CancellationToken,
  type ProviderGatewayPort,
} from '@deepstorming/application'

export class MockProviderGateway implements ProviderGatewayPort {
  public constructor(private readonly options: Readonly<{ delayMs?: number }> = {}) {}

  public async testConnection(
    input: Readonly<{ modelName: string; apiKey?: string }>,
    token: CancellationToken,
  ): Promise<void> {
    if (token.cancelled) throw cancelledError()
    switch (input.modelName) {
      case 'mock-success':
        return
      case 'mock-auth':
        throw new ProviderUseCaseError(
          'PROVIDER_AUTH_FAILED',
          'The provider rejected the credential.',
          false,
        )
      case 'mock-rate-limit':
        throw new ProviderUseCaseError(
          'PROVIDER_RATE_LIMITED',
          'The provider rate limit was reached.',
          true,
        )
      case 'mock-model-not-found':
        throw new ProviderUseCaseError(
          'PROVIDER_MODEL_NOT_FOUND',
          'The provider model was not found.',
          false,
        )
      case 'mock-invalid':
        throw new ProviderUseCaseError(
          'PROVIDER_RESPONSE_INVALID',
          'The provider returned an invalid response.',
          true,
        )
      case 'mock-delay':
        await waitForDelay(this.options.delayMs ?? 1_000, token)
        return
      default:
        throw new ProviderUseCaseError(
          'PROVIDER_MODEL_NOT_FOUND',
          'The mock provider model was not found.',
          false,
        )
    }
  }

  public async generateLessonTutorReply(
    input: Readonly<{
      modelName: string
      apiKey?: string
      documentTitle: string
      sourceSnippet: string
      learnerReply: string
    }>,
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>> {
    await this.testConnection({ modelName: input.modelName }, token)
    if (input.modelName === 'mock-delay') await waitForDelay(this.options.delayMs ?? 1_000, token)
    return {
      content: `你刚才提到：“${input.learnerReply}”。我们把它和证据“${input.sourceSnippet}”连起来：下一步你会如何验证这个判断？`,
    }
  }
}

const cancelledError = (): ProviderUseCaseError =>
  new ProviderUseCaseError('OPERATION_CANCELLED', 'The provider test was cancelled.', false)

const waitForDelay = async (delayMs: number, token: CancellationToken): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    if (token.cancelled) {
      reject(cancelledError())
      return
    }
    const timeout = setTimeout(resolve, delayMs)
    const unsubscribe = token.onCancel(() => {
      clearTimeout(timeout)
      unsubscribe()
      reject(cancelledError())
    })
  })
}
