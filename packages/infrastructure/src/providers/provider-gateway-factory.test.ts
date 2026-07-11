import { expect, test } from 'vitest'

import type { ProviderProfile } from '@deepstorming/domain'

import { MockProviderGateway } from './mock-provider-gateway'
import { OpenAICompatibleGateway } from './openai-compatible-gateway'
import { ProviderGatewayFactory } from './provider-gateway-factory'

const provider = (overrides: Partial<ProviderProfile>): ProviderProfile => ({
  id: 'provider-1',
  providerType: 'mock',
  displayName: 'Mock',
  modelName: 'mock-success',
  hasApiKey: false,
  capabilities: { streaming: true, structuredOutput: true, embedding: false, vision: false },
  isActive: false,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  ...overrides,
})

test('creates gateways for mock, deepseek, and normalized OpenAI-compatible providers', () => {
  const factory = new ProviderGatewayFactory()

  expect(factory.create(provider({ providerType: 'mock' }))).toBeInstanceOf(MockProviderGateway)

  const deepseek = factory.create(
    provider({ providerType: 'deepseek', baseUrl: 'https://ignored.example' }),
  )
  expect(deepseek).toBeInstanceOf(OpenAICompatibleGateway)
  expect((deepseek as OpenAICompatibleGateway).baseUrl).toBe('https://api.deepseek.com')

  const compatible = factory.create(
    provider({ providerType: 'openai_compatible', baseUrl: 'https://example.test/v1///' }),
  )
  expect(compatible).toBeInstanceOf(OpenAICompatibleGateway)
  expect((compatible as OpenAICompatibleGateway).baseUrl).toBe('https://example.test/v1')
})
