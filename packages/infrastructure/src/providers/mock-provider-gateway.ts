import {
  ProviderUseCaseError,
  type CancellationToken,
  type ProviderGatewayPort,
} from '@deepstorming/application'
import type { DocumentLearningMemory, LessonSession } from '@deepstorming/domain'

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
      contextChunks: readonly Readonly<{
        chunkId: string
        text: string
        pageNumberStart: number
        pageNumberEnd: number
        charCount: number
      }>[]
      learnerReply: string
    }>,
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>> {
    await this.testConnection({ modelName: input.modelName }, token)
    if (input.modelName === 'mock-delay') await waitForDelay(this.options.delayMs ?? 1_000, token)
    return {
      content: JSON.stringify({
        narration: null,
        responseMarkdown: `你刚才提到：“${input.learnerReply}”。我们把它和证据“${input.sourceSnippet}”连起来，参考这些上下文：“${input.contextChunks.length === 0 ? '无额外上下文' : input.contextChunks.map((chunk) => chunk.text).join('；')}”。下一步你会如何验证这个判断？`,
        citations: [],
        figureReferences: [],
      }),
    }
  }

  public async generateLessonTutorFirstQuestion(
    input: Readonly<{
      modelName: string
      apiKey?: string
      documentTitle: string
      sourceSnippet: string
      contextChunks: readonly Readonly<{
        chunkId: string
        text: string
        pageNumberStart: number
        pageNumberEnd: number
        charCount: number
      }>[]
    }>,
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>> {
    await this.testConnection({ modelName: input.modelName }, token)
    if (input.modelName === 'mock-delay') await waitForDelay(this.options.delayMs ?? 1_000, token)
    return {
      content: JSON.stringify({
        narration: null,
        responseMarkdown: `我们先从《${input.documentTitle}》的这段证据开始：${input.sourceSnippet}\n\n结合这些上下文片段，你觉得它想解决的核心问题是什么？`,
        citations: [],
        figureReferences: [],
      }),
    }
  }

  public async generateLessonMemory(
    input: Readonly<{
      modelName: string
      apiKey?: string
      session: LessonSession
      previousDocumentMemory?: DocumentLearningMemory
      repair?: Readonly<{ reason: string }>
    }>,
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>> {
    await this.testConnection({ modelName: input.modelName }, token)
    const learnerMessages = input.session.messages.filter((message) => message.role === 'learner')
    const topic = input.session.title.trim() || input.session.documentTitle
    const summary = `本节围绕${topic}完成了 ${learnerMessages.length} 次学习者回应。`
    return {
      content: JSON.stringify({
        lessonMemory: {
          topic,
          coverage:
            input.session.sourceAnchors.map((anchor) => anchor.snippet).join('；') || '课堂对话',
          summaryMarkdown: summary,
          mastered: [],
          unstable: [],
          misconceptions: [],
          sourceAnchorIds: input.session.sourceAnchors.map((anchor) => anchor.id),
          figureIds: [],
          unresolvedQuestions: [],
          reviewPrompts: [`请用自己的话总结${topic}。`],
          nextLessonStart: `从${topic}的未解决问题继续。`,
        },
        documentMemory: {
          summaryMarkdown: [input.previousDocumentMemory?.summaryMarkdown, summary]
            .filter(Boolean)
            .join('\n\n'),
          mastered: input.previousDocumentMemory?.mastered ?? [],
          unstable: input.previousDocumentMemory?.unstable ?? [],
          misconceptions: input.previousDocumentMemory?.misconceptions ?? [],
          unresolvedQuestions: input.previousDocumentMemory?.unresolvedQuestions ?? [],
          nextLessonStart: `从${topic}的未解决问题继续。`,
        },
      }),
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
