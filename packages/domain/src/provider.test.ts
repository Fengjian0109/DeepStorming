import { describe, expect, it } from 'vitest'

import {
  PROVIDER_TYPES,
  assertProviderHasCredential,
  capabilitiesFor,
  normalizeProviderDraft,
  type ProviderCapabilities,
  type ProviderType,
} from './provider'

describe('normalizeProviderDraft', () => {
  it('trims provider draft values', () => {
    expect(
      normalizeProviderDraft({
        providerType: 'openai_compatible',
        displayName: ' Local model ',
        baseUrl: ' https://models.example.com/v1 ',
        modelName: ' local-chat ',
        apiKey: ' secret-key ',
      }),
    ).toEqual({
      providerType: 'openai_compatible',
      displayName: 'Local model',
      baseUrl: 'https://models.example.com/v1',
      modelName: 'local-chat',
      apiKey: 'secret-key',
    })
  })

  it.each([
    [
      'displayName',
      { displayName: ' ', modelName: 'deepseek-chat' },
      'displayName must not be empty',
    ],
    ['modelName', { displayName: 'DeepSeek', modelName: '\t' }, 'modelName must not be empty'],
  ])('requires a non-empty %s', (_field, values, message) => {
    expect(() =>
      normalizeProviderDraft({
        providerType: 'deepseek',
        ...values,
      }),
    ).toThrow(message)
  })

  it('defaults the DeepSeek base URL', () => {
    expect(
      normalizeProviderDraft({
        providerType: 'deepseek',
        displayName: 'DeepSeek',
        modelName: 'deepseek-chat',
      }),
    ).toEqual({
      providerType: 'deepseek',
      displayName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      modelName: 'deepseek-chat',
    })
  })

  it('clears the base URL and allows an absent key for Mock', () => {
    expect(
      normalizeProviderDraft({
        providerType: 'mock',
        displayName: ' Mock ',
        baseUrl: ' https://ignored.example.com ',
        modelName: ' deterministic ',
      }),
    ).toEqual({
      providerType: 'mock',
      displayName: 'Mock',
      modelName: 'deterministic',
    })
  })

  it.each([
    undefined,
    '',
    'not a url',
    'models.example.com/v1',
    'https://',
    'https://models.example.com:invalid/v1',
    'https://example..com/v1',
    'https://-example.com/v1',
    'https://[not-ipv6]/v1',
  ])('requires a valid URL for OpenAI-compatible providers: %s', (baseUrl) => {
    expect(() =>
      normalizeProviderDraft({
        providerType: 'openai_compatible',
        displayName: 'Compatible',
        ...(baseUrl === undefined ? {} : { baseUrl }),
        modelName: 'chat',
      }),
    ).toThrow('baseUrl must be a valid URL')
  })

  it('accepts an HTTPS URL for a remote OpenAI-compatible provider', () => {
    expect(
      normalizeProviderDraft({
        providerType: 'openai_compatible',
        displayName: 'Compatible',
        baseUrl: 'https://models.example.com:8443/v1',
        modelName: 'chat',
      }).baseUrl,
    ).toBe('https://models.example.com:8443/v1')
  })

  it.each([
    'https://[:1:2:3:4:5:6:7:8]/v1',
    'https://[1:2:3:4:5:6:7:8:]/v1',
    'https://[:::1]/v1',
    'https://[1:::]/v1',
    'https://[::1:2:3:4:5:6:7:8]/v1',
    'https://[1:2:3:4:5:6:7:8::]/v1',
  ])('rejects malformed IPv6 colon placement and compression: %s', (baseUrl) => {
    expect(() =>
      normalizeProviderDraft({
        providerType: 'openai_compatible',
        displayName: 'Compatible',
        baseUrl,
        modelName: 'chat',
      }),
    ).toThrow('baseUrl must be a valid URL')
  })

  it.each(['http://localhost:11434/v1', 'http://127.0.0.1:11434/v1', 'http://[::1]:11434/v1'])(
    'accepts HTTP for an exact loopback host when explicitly allowed: %s',
    (baseUrl) => {
      expect(
        normalizeProviderDraft(
          {
            providerType: 'openai_compatible',
            displayName: 'Local',
            baseUrl,
            modelName: 'chat',
          },
          { allowInsecureLoopback: true },
        ).baseUrl,
      ).toBe(baseUrl)
    },
  )

  it.each(['http://localhost:11434/v1', 'http://127.0.0.1/v1', 'http://[::1]/v1'])(
    'rejects loopback HTTP unless explicitly allowed: %s',
    (baseUrl) => {
      expect(() =>
        normalizeProviderDraft({
          providerType: 'openai_compatible',
          displayName: 'Compatible',
          baseUrl,
          modelName: 'chat',
        }),
      ).toThrow('baseUrl must use HTTPS')
    },
  )

  it.each([
    'http://models.example.com/v1',
    'http://localhost.example.com/v1',
    'http://127.0.0.1.example.com/v1',
    'ftp://localhost/v1',
    'file://localhost/v1',
  ])('rejects disallowed or deceptive URL protocols and hosts: %s', (baseUrl) => {
    expect(() =>
      normalizeProviderDraft(
        {
          providerType: 'openai_compatible',
          displayName: 'Compatible',
          baseUrl,
          modelName: 'chat',
        },
        { allowInsecureLoopback: true },
      ),
    ).toThrow('baseUrl must use HTTPS')
  })

  it.each([
    'https://user:password@models.example.com/v1',
    'http://user:password@localhost:11434/v1',
  ])('rejects credentials embedded in a base URL: %s', (baseUrl) => {
    expect(() =>
      normalizeProviderDraft(
        {
          providerType: 'openai_compatible',
          displayName: 'Compatible',
          baseUrl,
          modelName: 'chat',
        },
        { allowInsecureLoopback: true },
      ),
    ).toThrow('baseUrl must not include credentials')
  })

  it('rejects a masked API key after trimming', () => {
    expect(() =>
      normalizeProviderDraft({
        providerType: 'deepseek',
        displayName: 'DeepSeek',
        modelName: 'deepseek-chat',
        apiKey: '••••••••',
      }),
    ).toThrow('Masked API keys cannot be saved')

    expect(() =>
      normalizeProviderDraft({
        providerType: 'deepseek',
        displayName: 'DeepSeek',
        modelName: 'deepseek-chat',
        apiKey: '  ****  ',
      }),
    ).toThrow('Masked API keys cannot be saved')

    expect(() =>
      normalizeProviderDraft({
        providerType: 'mock',
        displayName: 'Mock',
        modelName: 'deterministic',
        apiKey: ' **** ',
      }),
    ).toThrow('Masked API keys cannot be saved')
  })

  it('omits blank optional fields', () => {
    expect(
      normalizeProviderDraft({
        providerType: 'deepseek',
        displayName: 'DeepSeek',
        baseUrl: ' ',
        modelName: 'deepseek-chat',
        apiKey: ' ',
      }),
    ).toEqual({
      providerType: 'deepseek',
      displayName: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      modelName: 'deepseek-chat',
    })
  })
})

describe('Provider types and credentials', () => {
  it('publishes the supported Provider types', () => {
    const providerTypes: readonly ProviderType[] = PROVIDER_TYPES

    expect(providerTypes).toEqual(['mock', 'deepseek', 'openai_compatible'])
    expect(Object.isFrozen(providerTypes)).toBe(true)
  })

  it('accepts Mock without a credential', () => {
    expect(() =>
      assertProviderHasCredential({
        providerType: 'mock',
        hasExistingKey: false,
      }),
    ).not.toThrow()
  })

  it.each(['deepseek', 'openai_compatible'] as const)(
    'requires an existing or new key for %s',
    (providerType) => {
      expect(() =>
        assertProviderHasCredential({
          providerType,
          hasExistingKey: false,
        }),
      ).toThrow('API key is required')

      expect(() =>
        assertProviderHasCredential({
          providerType,
          hasExistingKey: true,
        }),
      ).not.toThrow()

      expect(() =>
        assertProviderHasCredential({
          providerType,
          hasExistingKey: false,
          apiKey: ' new-key ',
        }),
      ).not.toThrow()
    },
  )
})

describe('capabilitiesFor', () => {
  it('prevents callers from corrupting shared capabilities', () => {
    const capabilities = capabilitiesFor('deepseek') as { streaming: boolean }
    let streamingAfterMutation: boolean

    try {
      capabilities.streaming = false
      streamingAfterMutation = capabilitiesFor('deepseek').streaming
    } catch {
      streamingAfterMutation = capabilitiesFor('deepseek').streaming
    } finally {
      if (!Object.isFrozen(capabilities)) {
        capabilities.streaming = true
      }
    }

    expect(Object.isFrozen(capabilities)).toBe(true)
    expect(streamingAfterMutation).toBe(true)
  })

  it.each([
    ['mock', { streaming: true, structuredOutput: true, embedding: false, vision: false }],
    ['deepseek', { streaming: true, structuredOutput: true, embedding: false, vision: false }],
    [
      'openai_compatible',
      { streaming: true, structuredOutput: false, embedding: false, vision: false },
    ],
  ] satisfies ReadonlyArray<readonly [ProviderType, ProviderCapabilities]>)(
    'returns deterministic readonly capabilities for %s',
    (providerType, expected) => {
      const first: ProviderCapabilities = capabilitiesFor(providerType)
      const second: ProviderCapabilities = capabilitiesFor(providerType)

      expect(first).toEqual(expected)
      expect(second).toEqual(expected)
    },
  )
})
