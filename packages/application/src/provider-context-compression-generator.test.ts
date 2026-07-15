import { expect, it, vi } from 'vitest'
import type { StoredLessonSession } from './lesson-ports'
import type {
  CancellationToken,
  ProviderGatewayPort,
  ProviderRepositoryPort,
  SecretVaultPort,
} from './provider-ports'
import { ProviderContextCompressionGenerator } from './provider-context-compression-generator'

const session = {
  id: 'lesson',
  sourceAnchors: [{ id: 'anchor-1' }],
  messages: [{ tutorTurn: { figureReferences: [{ figureId: 'figure-1' }] } }],
} as unknown as StoredLessonSession
const valid = JSON.stringify({
  summaryMarkdown: 'summary',
  facts: ['fact'],
  mastery: [],
  misconceptions: [],
  unresolvedQuestions: [],
  sourceAnchorIds: ['anchor-1'],
  figureIds: ['figure-1'],
})
const token: CancellationToken = { cancelled: false, onCancel: () => () => undefined }

it('repairs invalid structured compression once with the same provider', async () => {
  const generate = vi
    .fn()
    .mockResolvedValueOnce({ content: '{}' })
    .mockResolvedValueOnce({ content: valid })
  const providers = {
    list: async () => [
      {
        id: 'provider',
        providerType: 'mock',
        displayName: 'Mock',
        baseUrl: 'mock://local',
        modelName: 'mock-success',
        capabilities: { streaming: false, structuredOutput: true, embedding: false, vision: false },
        isActive: true,
        createdAt: '2026-07-15',
        updatedAt: '2026-07-15',
        revision: 1,
      },
    ],
  } as unknown as ProviderRepositoryPort
  const vault = {} as SecretVaultPort
  const factory = {
    create: () => ({ generateContextCompression: generate }) as unknown as ProviderGatewayPort,
  }
  const result = await new ProviderContextCompressionGenerator(providers, vault, factory).generate(
    { session, preservedRecentMessageIds: [] },
    token,
  )
  expect(result.summaryMarkdown).toBe('summary')
  expect(generate).toHaveBeenCalledTimes(2)
  expect(generate.mock.calls[1]?.[0]).toMatchObject({ repair: { reason: expect.any(String) } })
})

it('rejects foreign source and figure ids after the single repair', async () => {
  const invalid = JSON.stringify({
    summaryMarkdown: 'summary',
    facts: [],
    mastery: [],
    misconceptions: [],
    unresolvedQuestions: [],
    sourceAnchorIds: ['foreign'],
    figureIds: [],
  })
  const gateway = {
    generateContextCompression: vi.fn().mockResolvedValue({ content: invalid }),
  } as unknown as ProviderGatewayPort
  const providers = {
    list: async () => [
      {
        id: 'provider',
        providerType: 'mock',
        displayName: 'Mock',
        baseUrl: 'mock://local',
        modelName: 'mock-success',
        capabilities: { streaming: false, structuredOutput: true, embedding: false, vision: false },
        isActive: true,
        createdAt: '2026-07-15',
        updatedAt: '2026-07-15',
        revision: 1,
      },
    ],
  } as unknown as ProviderRepositoryPort
  await expect(
    new ProviderContextCompressionGenerator(providers, {} as SecretVaultPort, {
      create: () => gateway,
    }).generate({ session, preservedRecentMessageIds: [] }, token),
  ).rejects.toMatchObject({ code: 'AI_GENERATION_FAILED' })
})
