import {
  ProviderUseCaseError,
  type CancellationToken,
  type ProviderGatewayPort,
} from '@deepstorming/application'
import type { ContextSnapshot, DocumentLearningMemory, LessonSession } from '@deepstorming/domain'

export class MockProviderGateway implements ProviderGatewayPort {
  public constructor(private readonly options: Readonly<{ delayMs?: number }> = {}) {}

  public async testConnection(
    input: Readonly<{ modelName: string; apiKey?: string }>,
    token: CancellationToken,
  ): Promise<void> {
    if (token.cancelled) throw cancelledError()
    switch (input.modelName) {
      case 'mock-success':
      case 'mock-rich':
      case 'mock-rich-4k':
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
      availableFigures?: readonly Readonly<{
        figureId: string
        pageNumber: number
        label: string
        caption: string
      }>[]
      learnerReply: string
    }>,
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>> {
    await this.testConnection({ modelName: input.modelName }, token)
    if (input.modelName === 'mock-delay') await waitForDelay(this.options.delayMs ?? 1_000, token)
    if (input.modelName.startsWith('mock-rich')) return richTutorTurn(input)
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
      availableFigures?: readonly Readonly<{
        figureId: string
        pageNumber: number
        label: string
        caption: string
      }>[]
    }>,
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>> {
    await this.testConnection({ modelName: input.modelName }, token)
    if (input.modelName === 'mock-delay') await waitForDelay(this.options.delayMs ?? 1_000, token)
    if (input.modelName.startsWith('mock-rich')) return richTutorTurn(input)
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

  public async generateContextCompression(
    input: Readonly<{
      modelName: string
      apiKey?: string
      session: LessonSession
      previousSnapshot?: ContextSnapshot
      preservedRecentMessageIds: readonly string[]
      repair?: Readonly<{ reason: string }>
    }>,
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>> {
    await this.testConnection({ modelName: input.modelName }, token)
    const learner = input.session.messages.filter((message) => message.role === 'learner')
    return {
      content: JSON.stringify({
        summaryMarkdown: `课堂已进行 ${learner.length} 次学习者回应。`,
        facts: [],
        mastery: [],
        misconceptions: [],
        unresolvedQuestions: [],
        sourceAnchorIds: input.session.sourceAnchors.map((anchor) => anchor.id),
        figureIds: [
          ...new Set(
            input.session.messages.flatMap(
              (message) =>
                message.tutorTurn?.figureReferences.map((figure) => figure.figureId) ?? [],
            ),
          ),
        ],
      }),
    }
  }
}

const richTutorTurn = (input: {
  contextChunks: readonly Readonly<{ chunkId: string; text: string }>[]
  availableFigures?: readonly Readonly<{ figureId: string }>[]
}): Readonly<{ content: string }> => {
  const chunk = input.contextChunks[0]
  const figure = input.availableFigures?.[0]
  return {
    content: JSON.stringify({
      narration: '导师指向证据与图表，等待你的推导。',
      responseMarkdown: '用公式 $E=mc^2$ 表达后，你会怎样检验这条结论？',
      citations:
        chunk === undefined
          ? []
          : [
              {
                chunkId: chunk.chunkId,
                quote: chunk.text.slice(0, 240),
                rationale: '这段原文给出了判断与可观察证据之间的关系。',
              },
            ],
      figureReferences:
        figure === undefined
          ? []
          : [{ figureId: figure.figureId, rationale: '图表提供了可对照的结果。' }],
    }),
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
