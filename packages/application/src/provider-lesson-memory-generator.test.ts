import { describe, expect, it, vi } from 'vitest'
import type { ProviderProfile } from '@deepstorming/domain'
import type { StoredLessonSession } from './lesson-ports'
import type {
  CancellationToken,
  ProviderGatewayFactoryPort,
  ProviderGatewayPort,
  ProviderRepositoryPort,
  SecretVaultPort,
  StoredProvider,
} from './provider-ports'
import type { LessonUseCaseError } from './lesson-use-cases'
import { ProviderLessonMemoryGenerator } from './lesson-use-cases'

const provider: StoredProvider = {
  id: '00000000-0000-4000-8000-000000000501',
  providerType: 'deepseek',
  displayName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
  secretRef: 'secret-ref',
  capabilities: { streaming: true, structuredOutput: true, embedding: false, vision: false },
  isActive: true,
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
  revision: 1,
}

const session = {
  id: '00000000-0000-4000-8000-000000000101',
  documentId: '00000000-0000-4000-8000-000000000201',
  documentTitle: 'Deep Learning',
  title: 'Attention',
  lessonMode: 'standard',
  sourceAnchors: [{ id: '00000000-0000-4000-8000-000000000301' }],
  messages: [
    {
      role: 'tutor',
      content: 'query 与 key 进行匹配',
      tutorTurn: { figureReferences: [{ figureId: 'figure-1', rationale: 'diagram' }] },
    },
  ],
} as unknown as StoredLessonSession

const valid = JSON.stringify({
  lessonMemory: {
    topic: 'Attention',
    coverage: 'Pages 1–4',
    summaryMarkdown: 'Summary',
    mastered: ['mapping'],
    unstable: ['scaling'],
    misconceptions: [],
    sourceAnchorIds: [],
    figureIds: [],
    unresolvedQuestions: ['why scale?'],
    reviewPrompts: ['请解释缩放。'],
    nextLessonStart: 'derive scaling',
  },
  documentMemory: {
    summaryMarkdown: 'Cumulative summary',
    mastered: ['mapping'],
    unstable: ['scaling'],
    misconceptions: [],
    unresolvedQuestions: ['why scale?'],
    nextLessonStart: 'derive scaling',
  },
})

const token: CancellationToken = { cancelled: false, onCancel: () => () => undefined }

const setup = (contents: string[], providers: readonly StoredProvider[] = [provider]) => {
  const generateLessonMemory = vi.fn(async () => ({ content: contents.shift() ?? valid }))
  const gateway = { generateLessonMemory } as unknown as ProviderGatewayPort
  const repository = { list: async () => providers } as ProviderRepositoryPort
  const vault = { get: vi.fn(async () => 'api-key') } as unknown as SecretVaultPort
  const factory = {
    create: (_profile: ProviderProfile) => gateway,
  } satisfies ProviderGatewayFactoryPort
  return {
    generator: new ProviderLessonMemoryGenerator(repository, vault, factory),
    generateLessonMemory,
    vault,
  }
}

describe('ProviderLessonMemoryGenerator', () => {
  it('uses the active AI provider and returns validated structured memory', async () => {
    const { generator, generateLessonMemory, vault } = setup([valid])
    await expect(generator.generate({ session }, token)).resolves.toMatchObject({
      lessonMemory: { topic: 'Attention' },
      documentMemory: { nextLessonStart: 'derive scaling' },
    })
    expect(vault.get).toHaveBeenCalledWith('secret-ref')
    expect(generateLessonMemory).toHaveBeenCalledWith(
      expect.objectContaining({ modelName: 'deepseek-chat', apiKey: 'api-key', session }),
      token,
    )
  })

  it('repairs invalid structured output once and then fails safely', async () => {
    const repaired = setup(['{}', valid])
    await expect(repaired.generator.generate({ session }, token)).resolves.toBeDefined()
    expect(repaired.generateLessonMemory).toHaveBeenLastCalledWith(
      expect.objectContaining({ repair: { reason: 'Lesson memory failed validation.' } }),
      token,
    )

    const invalid = setup(['{}', '{}'])
    await expect(invalid.generator.generate({ session }, token)).rejects.toMatchObject({
      code: 'AI_GENERATION_FAILED',
    } satisfies Partial<LessonUseCaseError>)
  })

  it('rejects source and figure identifiers that were not present in the lesson', async () => {
    const invented = JSON.stringify({
      ...JSON.parse(valid),
      lessonMemory: { ...JSON.parse(valid).lessonMemory, figureIds: ['invented-figure'] },
    })
    const invalid = setup([invented, invented])
    await expect(invalid.generator.generate({ session }, token)).rejects.toMatchObject({
      code: 'AI_GENERATION_FAILED',
    })
  })

  it('requires an active provider instead of using a local fallback', async () => {
    const { generator } = setup([], [])
    await expect(generator.generate({ session }, token)).rejects.toMatchObject({
      code: 'AI_PROVIDER_REQUIRED',
    } satisfies Partial<LessonUseCaseError>)
  })
})
