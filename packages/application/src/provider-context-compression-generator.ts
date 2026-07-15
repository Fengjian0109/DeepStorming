import type { ContextSnapshot } from '@deepstorming/domain'
import type {
  ContextCompressionContent,
  ContextCompressionGeneratorPort,
} from './context-compression-ports'
import type { StoredLessonSession } from './lesson-ports'
import { LessonUseCaseError } from './lesson-use-cases'
import type {
  CancellationToken,
  ProviderGatewayFactoryPort,
  ProviderRepositoryPort,
  SecretVaultPort,
} from './provider-ports'
import { toProviderProfile } from './provider-use-cases'

const keys = [
  'summaryMarkdown',
  'facts',
  'mastery',
  'misconceptions',
  'unresolvedQuestions',
  'sourceAnchorIds',
  'figureIds',
] as const
const parse = (candidate: string, session: StoredLessonSession): ContextCompressionContent => {
  const value: unknown = JSON.parse(candidate)
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid context snapshot')
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join('|') !== [...keys].sort().join('|'))
    throw new Error('invalid context snapshot fields')
  if (
    typeof record['summaryMarkdown'] !== 'string' ||
    record['summaryMarkdown'].trim().length === 0
  )
    throw new Error('invalid context summary')
  const result: Record<string, readonly string[]> = {}
  for (const key of keys.slice(1)) {
    const list = record[key]
    if (
      !Array.isArray(list) ||
      list.some((item) => typeof item !== 'string' || item.trim().length === 0)
    )
      throw new Error('invalid context list')
    result[key] = list as string[]
  }
  const anchors = new Set(session.sourceAnchors.map((anchor) => anchor.id))
  const figures = new Set(
    session.messages.flatMap(
      (message) => message.tutorTurn?.figureReferences.map((figure) => figure.figureId) ?? [],
    ),
  )
  if (
    result['sourceAnchorIds']!.some((id) => !anchors.has(id)) ||
    result['figureIds']!.some((id) => !figures.has(id))
  )
    throw new Error('context references are not allowed')
  return {
    summaryMarkdown: record['summaryMarkdown'].trim(),
    facts: result['facts']!,
    mastery: result['mastery']!,
    misconceptions: result['misconceptions']!,
    unresolvedQuestions: result['unresolvedQuestions']!,
    sourceAnchorIds: result['sourceAnchorIds']!,
    figureIds: result['figureIds']!,
  }
}

export class ProviderContextCompressionGenerator implements ContextCompressionGeneratorPort {
  public constructor(
    private readonly providers: ProviderRepositoryPort,
    private readonly vault: SecretVaultPort,
    private readonly gatewayFactory: ProviderGatewayFactoryPort,
  ) {}
  private async active() {
    const provider = (await this.providers.list()).find((value) => value.isActive)
    if (provider === undefined)
      throw new LessonUseCaseError(
        'AI_PROVIDER_REQUIRED',
        'An active AI provider is required.',
        false,
      )
    return provider
  }
  async activeModelName(): Promise<string> {
    return (await this.active()).modelName
  }
  async generate(
    input: Readonly<{
      session: StoredLessonSession
      previousSnapshot?: ContextSnapshot
      preservedRecentMessageIds: readonly string[]
    }>,
    token: CancellationToken,
  ): Promise<ContextCompressionContent> {
    const provider = await this.active()
    const apiKey =
      provider.providerType === 'mock'
        ? undefined
        : provider.secretRef === undefined
          ? undefined
          : await this.vault.get(provider.secretRef)
    if (provider.providerType !== 'mock' && apiKey === undefined)
      throw new LessonUseCaseError(
        'INTERNAL_ERROR',
        'The provider credential is unavailable.',
        true,
      )
    const gateway = this.gatewayFactory.create(toProviderProfile(provider))
    if (gateway.generateContextCompression === undefined) {
      throw new LessonUseCaseError(
        'AI_GENERATION_FAILED',
        'The active provider does not support context compression.',
        true,
      )
    }
    const request = {
      modelName: provider.modelName,
      ...(apiKey === undefined ? {} : { apiKey }),
      session: input.session,
      ...(input.previousSnapshot === undefined ? {} : { previousSnapshot: input.previousSnapshot }),
      preservedRecentMessageIds: input.preservedRecentMessageIds,
    }
    const first = await gateway.generateContextCompression(request, token)
    try {
      return parse(first.content, input.session)
    } catch {
      const repaired = await gateway.generateContextCompression(
        { ...request, repair: { reason: 'Context snapshot failed strict validation.' } },
        token,
      )
      try {
        return parse(repaired.content, input.session)
      } catch {
        throw new LessonUseCaseError(
          'AI_GENERATION_FAILED',
          'AI context compression returned invalid structured data.',
          true,
        )
      }
    }
  }
}
