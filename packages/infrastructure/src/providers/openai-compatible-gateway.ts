import {
  ProviderUseCaseError,
  type CancellationToken,
  type ProviderGatewayPort,
} from '@deepstorming/application'
import type { LessonPace, LessonTutorSnapshot } from '@deepstorming/domain'

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
      lessonMode?: 'standard' | 'paper'
      tutorSnapshot?: LessonTutorSnapshot
      pace?: LessonPace
      repair?: Readonly<{ reason: string }>
    }>,
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>> {
    if (token.cancelled) throw cancelledError()
    const request =
      input.apiKey === undefined
        ? {
            modelName: input.modelName,
            messages: lessonTutorMessages(input),
            maxTokens: 800,
          }
        : {
            modelName: input.modelName,
            apiKey: input.apiKey,
            messages: lessonTutorMessages(input),
            maxTokens: 800,
          }
    const body = await this.postChatCompletion(
      request,
      token,
      'The provider lesson generation timed out.',
      'The provider lesson generation could not reach the provider.',
    )
    const content = firstAssistantContent(body)
    if (content === undefined) {
      throw new ProviderUseCaseError(
        'PROVIDER_RESPONSE_INVALID',
        'The provider returned an invalid response.',
        true,
        { fieldName: 'choices.message.content' },
      )
    }
    return { content }
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
      lessonMode?: 'standard' | 'paper'
      tutorSnapshot?: LessonTutorSnapshot
      pace?: LessonPace
      repair?: Readonly<{ reason: string }>
    }>,
    token: CancellationToken,
  ): Promise<Readonly<{ content: string }>> {
    if (token.cancelled) throw cancelledError()
    const request =
      input.apiKey === undefined
        ? {
            modelName: input.modelName,
            messages: lessonTutorFirstQuestionMessages(input),
            maxTokens: 800,
          }
        : {
            modelName: input.modelName,
            apiKey: input.apiKey,
            messages: lessonTutorFirstQuestionMessages(input),
            maxTokens: 800,
          }
    const body = await this.postChatCompletion(
      request,
      token,
      'The provider lesson generation timed out.',
      'The provider lesson generation could not reach the provider.',
    )
    const content = firstAssistantContent(body)
    if (content === undefined) {
      throw new ProviderUseCaseError(
        'PROVIDER_RESPONSE_INVALID',
        'The provider returned an invalid response.',
        true,
        { fieldName: 'choices.message.content' },
      )
    }
    return { content }
  }

  private async postChatCompletion(
    input: Readonly<{
      modelName: string
      apiKey?: string
      messages: readonly Readonly<{ role: 'system' | 'user'; content: string }>[]
      maxTokens: number
    }>,
    token: CancellationToken,
    timeoutMessage: string,
    networkMessage: string,
  ): Promise<unknown> {
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
          messages: input.messages,
          max_tokens: input.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      })
      if (!response.ok) throw await httpError(response)
      return await response.json().catch(() => {
        throw new ProviderUseCaseError(
          'PROVIDER_RESPONSE_INVALID',
          'The provider returned an invalid response.',
          true,
        )
      })
    } catch (error) {
      if (token.cancelled) throw cancelledError()
      if (timedOut) {
        throw new ProviderUseCaseError('PROVIDER_TIMEOUT', timeoutMessage, true)
      }
      if (error instanceof ProviderUseCaseError) throw error
      throw new ProviderUseCaseError('PROVIDER_NETWORK_ERROR', networkMessage, true)
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

const formatContextChunks = (
  contextChunks: readonly Readonly<{
    chunkId: string
    text: string
    pageNumberStart: number
    pageNumberEnd: number
    charCount: number
  }>[],
): string =>
  contextChunks.length === 0
    ? '无'
    : contextChunks
        .map(
          (chunk, index) =>
            `${index + 1}. [${chunk.pageNumberStart}-${chunk.pageNumberEnd}] ${chunk.text}`,
        )
        .join('\n')

type AvailableFigure = Readonly<{
  figureId: string
  pageNumber: number
  label: string
  caption: string
}>

const formatAvailableFigures = (figures: readonly AvailableFigure[] | undefined): string =>
  figures === undefined || figures.length === 0
    ? ''
    : `\n可用图片：\n${figures
        .map(
          (figure) =>
            `${figure.figureId} | 第 ${figure.pageNumber} 页 | ${figure.label} | ${figure.caption}`,
        )
        .join('\n')}`

const tutorSystemInstruction = (
  input: Readonly<{
    lessonMode?: 'standard' | 'paper'
    tutorSnapshot?: LessonTutorSnapshot
    pace?: LessonPace
  }>,
  groundingRule: string,
): string => {
  const tutor = input.tutorSnapshot
  if (tutor === undefined) return `你是 DeepStorming 的课堂导师。${groundingRule}`
  const strategy = input.lessonMode === 'paper' ? tutor.paperStrategy : tutor.bookStrategy
  const paceRule =
    input.pace === 'slow'
      ? '慢节奏：每次只推进一个小步骤，先确认理解再继续。'
      : input.pace === 'fast'
        ? '快节奏：保持紧凑，在学习者理解时快速推进。'
        : '标准节奏：在追问、提示和短讲解之间保持平衡。'
  return [
    `你是 DeepStorming 的课堂导师“${tutor.name}”。`,
    `性格：${tutor.personality}。语气：${tutor.tone}。`,
    `擅长领域：${tutor.expertiseTags.join('、') || '通识学习'}。`,
    `引导策略：${strategy}`,
    `苏格拉底强度 ${tutor.socraticIntensity}/5，严格度 ${tutor.strictness}/5，引导风格 ${tutor.guidanceStyle}。`,
    paceRule,
    tutor.customInstructions,
    groundingRule,
  ]
    .filter((line) => line.length > 0)
    .join('\n')
}

const structuredTutorOutputInstruction = (
  repair?: Readonly<{ reason: string }>,
  hasAvailableFigures = false,
): string =>
  [
    '仅输出一个 JSON 对象，不要使用 Markdown 代码栅。字段必须且只能是 narration、responseMarkdown、citations、figureReferences。',
    'narration 是简短动作描写或 null；responseMarkdown 是对学习者展示的 Markdown/LaTeX 正文。',
    'citations 是 {chunkId,quote,rationale} 数组，quote 必须逐字来自对应上下文；figureReferences 是 {figureId,rationale} 数组。没有可验证项时使用空数组。',
    hasAvailableFigures
      ? 'figureReferences 只能使用可用图片清单中的 figureId，不得猜测或编造图片。'
      : '',
    repair === undefined
      ? ''
      : `上一次输出无效：${repair.reason}这是唯一一次修复机会，请严格返回合法 JSON。`,
  ]
    .filter((line) => line.length > 0)
    .join('\n')

const lessonTutorFirstQuestionMessages = (input: {
  readonly documentTitle: string
  readonly sourceSnippet: string
  readonly contextChunks: readonly Readonly<{
    chunkId: string
    text: string
    pageNumberStart: number
    pageNumberEnd: number
    charCount: number
  }>[]
  readonly availableFigures?: readonly AvailableFigure[]
  readonly lessonMode?: 'standard' | 'paper'
  readonly tutorSnapshot?: LessonTutorSnapshot
  readonly pace?: LessonPace
  readonly repair?: Readonly<{ reason: string }>
}): readonly Readonly<{ role: 'system' | 'user'; content: string }>[] => [
  {
    role: 'system',
    content: `${tutorSystemInstruction(
      input,
      '只基于用户提供的证据片段和扩展上下文提出开场问题，不编造来源。',
    )}\n${structuredTutorOutputInstruction(
      input.repair,
      (input.availableFigures?.length ?? 0) > 0,
    )}`,
  },
  {
    role: 'user',
    content: `文档：${input.documentTitle}\n证据片段：${input.sourceSnippet}\n扩展上下文：\n${formatContextChunks(input.contextChunks)}${formatAvailableFigures(input.availableFigures)}\n请用中文提出一个简短开场问题，帮助学习者先判断这段证据想解决的核心问题。`,
  },
]

const lessonTutorMessages = (input: {
  readonly documentTitle: string
  readonly sourceSnippet: string
  readonly contextChunks: readonly Readonly<{
    chunkId: string
    text: string
    pageNumberStart: number
    pageNumberEnd: number
    charCount: number
  }>[]
  readonly availableFigures?: readonly AvailableFigure[]
  readonly learnerReply: string
  readonly lessonMode?: 'standard' | 'paper'
  readonly tutorSnapshot?: LessonTutorSnapshot
  readonly pace?: LessonPace
  readonly repair?: Readonly<{ reason: string }>
}): readonly Readonly<{ role: 'system' | 'user'; content: string }>[] => [
  {
    role: 'system',
    content: `${tutorSystemInstruction(
      input,
      '只基于用户提供的证据片段、扩展上下文和学习者回答继续追问，不编造来源。',
    )}\n${structuredTutorOutputInstruction(
      input.repair,
      (input.availableFigures?.length ?? 0) > 0,
    )}`,
  },
  {
    role: 'user',
    content: `文档：${input.documentTitle}\n证据片段：${input.sourceSnippet}\n扩展上下文：\n${formatContextChunks(input.contextChunks)}${formatAvailableFigures(input.availableFigures)}\n学习者回答：${input.learnerReply}\n请用中文提出一个简短追问，帮助学习者验证自己的判断。`,
  },
]

const firstAssistantContent = (body: unknown): string | undefined => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined
  const choices = (body as Record<string, unknown>)['choices']
  if (!Array.isArray(choices)) return undefined
  const first = choices[0]
  if (typeof first !== 'object' || first === null || Array.isArray(first)) return undefined
  const message = (first as Record<string, unknown>)['message']
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return undefined
  const content = (message as Record<string, unknown>)['content']
  if (typeof content !== 'string') return undefined
  const trimmed = content.trim()
  return trimmed.length === 0 ? undefined : trimmed
}
