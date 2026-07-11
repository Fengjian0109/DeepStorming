import type { ProviderGatewayFactoryPort, ProviderGatewayPort } from '@deepstorming/application'
import type { ProviderProfile } from '@deepstorming/domain'

import { MockProviderGateway } from './mock-provider-gateway'
import { OpenAICompatibleGateway } from './openai-compatible-gateway'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

export class ProviderGatewayFactory implements ProviderGatewayFactoryPort {
  public create(provider: ProviderProfile): ProviderGatewayPort {
    switch (provider.providerType) {
      case 'mock':
        return new MockProviderGateway()
      case 'deepseek':
        return new OpenAICompatibleGateway(DEEPSEEK_BASE_URL)
      case 'openai_compatible':
        return new OpenAICompatibleGateway(provider.baseUrl ?? '')
    }
  }
}
