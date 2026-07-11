import { ProviderUseCaseError } from '@deepstorming/application'
import type { ProviderDraftDto, ProviderProfileDto } from '@deepstorming/contracts'
import { describe, expect, it, vi } from 'vitest'

import { createProviderIpcHandlers, type ProviderIpcDependencies } from './provider-handlers'

const REQUEST_ID = 'f4b7fd8f-4f47-4a61-9224-151f51f347de'
const PROVIDER_ID = 'a1f6b565-7bdf-4d68-b5b6-88667b5a7f24'
const OPERATION_ID = 'f5c5a440-5b18-420e-a227-78ad35f4c19d'
const API_KEY = 'sk-test-secret-value'

const providerDraft: ProviderDraftDto = {
  providerType: 'openai_compatible',
  displayName: 'OpenAI Compatible',
  baseUrl: 'https://api.example.test/v1',
  modelName: 'test-model',
  apiKey: API_KEY,
}

const providerProfile: ProviderProfileDto = {
  id: PROVIDER_ID,
  providerType: 'openai_compatible',
  displayName: 'OpenAI Compatible',
  baseUrl: 'https://api.example.test/v1',
  modelName: 'test-model',
  hasApiKey: true,
  capabilities: {
    streaming: true,
    structuredOutput: true,
    embedding: false,
    vision: false,
  },
  isActive: false,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

const createUseCase = (implementation?: (input?: unknown) => unknown) => ({
  execute: vi.fn(implementation ?? (() => providerProfile)),
})

const createDependencies = () => ({
  listProviders: createUseCase(() => [providerProfile]),
  createProvider: createUseCase(),
  updateProvider: createUseCase(),
  deleteProvider: createUseCase(() => undefined),
  activateProvider: createUseCase(),
  testProviderConnection: createUseCase(),
  cancelProviderTest: createUseCase(() => ({ cancelled: true })),
})

const expectNoSensitiveSerialization = (value: unknown): void => {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toContain(API_KEY)
  expect(serialized).not.toContain('apiKey')
  expect(serialized).not.toContain('secretRef')
  expect(serialized).not.toContain('Authorization')
  expect(serialized).not.toContain('Bearer ')
}

describe('provider IPC handlers', () => {
  const cases = [
    {
      name: 'list',
      handler: 'list' as const,
      useCase: 'listProviders' as const,
      input: { requestId: REQUEST_ID },
      expectedExecuteInput: undefined,
      expectedData: [providerProfile],
    },
    {
      name: 'create',
      handler: 'create' as const,
      useCase: 'createProvider' as const,
      input: { requestId: REQUEST_ID, provider: providerDraft },
      expectedExecuteInput: { requestId: REQUEST_ID, provider: providerDraft },
      expectedData: providerProfile,
    },
    {
      name: 'update',
      handler: 'update' as const,
      useCase: 'updateProvider' as const,
      input: { requestId: REQUEST_ID, id: PROVIDER_ID, provider: providerDraft },
      expectedExecuteInput: { requestId: REQUEST_ID, id: PROVIDER_ID, provider: providerDraft },
      expectedData: providerProfile,
    },
    {
      name: 'remove',
      handler: 'remove' as const,
      useCase: 'deleteProvider' as const,
      input: { requestId: REQUEST_ID, id: PROVIDER_ID },
      expectedExecuteInput: { requestId: REQUEST_ID, id: PROVIDER_ID },
      expectedData: {},
      serializesUseCaseOutput: false,
    },
    {
      name: 'activate',
      handler: 'activate' as const,
      useCase: 'activateProvider' as const,
      input: { requestId: REQUEST_ID, id: PROVIDER_ID },
      expectedExecuteInput: { requestId: REQUEST_ID, id: PROVIDER_ID },
      expectedData: providerProfile,
    },
    {
      name: 'testConnection',
      handler: 'testConnection' as const,
      useCase: 'testProviderConnection' as const,
      input: { requestId: REQUEST_ID, id: PROVIDER_ID, operationId: OPERATION_ID },
      expectedExecuteInput: {
        requestId: REQUEST_ID,
        providerId: PROVIDER_ID,
        operationId: OPERATION_ID,
      },
      expectedData: providerProfile,
    },
    {
      name: 'cancelTest',
      handler: 'cancelTest' as const,
      useCase: 'cancelProviderTest' as const,
      input: { requestId: REQUEST_ID, operationId: OPERATION_ID },
      expectedExecuteInput: { operationId: OPERATION_ID },
      expectedData: { cancelled: true },
    },
  ]

  it.each(cases)(
    'returns a typed result and calls only one use case for $name',
    async (testCase) => {
      const dependencies = createDependencies()
      const handlers = createProviderIpcHandlers(dependencies as unknown as ProviderIpcDependencies)

      const result = await handlers[testCase.handler](testCase.input)

      expect(result).toEqual({ ok: true, data: testCase.expectedData, requestId: REQUEST_ID })
      expect(dependencies[testCase.useCase].execute).toHaveBeenCalledTimes(1)
      if (testCase.expectedExecuteInput === undefined) {
        expect(dependencies[testCase.useCase].execute).toHaveBeenCalledWith()
      } else {
        expect(dependencies[testCase.useCase].execute).toHaveBeenCalledWith(
          testCase.expectedExecuteInput,
        )
      }

      for (const [key, useCase] of Object.entries(dependencies)) {
        if (key !== testCase.useCase) expect(useCase.execute).not.toHaveBeenCalled()
      }
      expectNoSensitiveSerialization(result)
    },
  )

  it.each(cases)(
    'strictly rejects malformed $name requests without calling use cases',
    async (testCase) => {
      const dependencies = createDependencies()
      const handlers = createProviderIpcHandlers(dependencies as unknown as ProviderIpcDependencies)

      const result = await handlers[testCase.handler]({ ...testCase.input, extra: true })

      expect(result.ok).toBe(false)
      expect(result.requestId).toBe(REQUEST_ID)
      if (!result.ok) {
        expect(result.error).toEqual({
          code: 'INVALID_REQUEST',
          message: 'The provider request is invalid.',
          retryable: false,
          details: { issueCount: 1 },
        })
      }
      for (const useCase of Object.values(dependencies))
        expect(useCase.execute).not.toHaveBeenCalled()
      expectNoSensitiveSerialization(result)
    },
  )

  it('uses a generated safe request ID when rejecting malformed sensitive request IDs', async () => {
    const dependencies = createDependencies()
    const handlers = createProviderIpcHandlers(dependencies as unknown as ProviderIpcDependencies)

    const result = await handlers.list({
      requestId: `Authorization: Bearer ${API_KEY}`,
      extra: true,
    })

    expect(result.ok).toBe(false)
    expect(result.requestId).toMatch(
      /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u,
    )
    expectNoSensitiveSerialization(result)
  })

  it.each(cases)('maps ProviderUseCaseError safely for $name', async (testCase) => {
    const dependencies = createDependencies()
    dependencies[testCase.useCase].execute.mockRejectedValueOnce(
      new ProviderUseCaseError(
        'PROVIDER_AUTH_FAILED',
        'The provider rejected the configured credential.',
        false,
        { statusCode: 401 },
      ),
    )
    const handlers = createProviderIpcHandlers(dependencies as unknown as ProviderIpcDependencies)

    const result = await handlers[testCase.handler](testCase.input)

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'PROVIDER_AUTH_FAILED',
        message: 'The provider rejected the configured credential.',
        retryable: false,
        details: { statusCode: 401 },
      },
      requestId: REQUEST_ID,
    })
    expectNoSensitiveSerialization(result)
  })

  it.each(cases)('maps unknown errors to INTERNAL_ERROR for $name', async (testCase) => {
    const dependencies = createDependencies()
    dependencies[testCase.useCase].execute.mockRejectedValueOnce(
      new Error(`Authorization: Bearer ${API_KEY}`),
    )
    const handlers = createProviderIpcHandlers(dependencies as unknown as ProviderIpcDependencies)

    const result = await handlers[testCase.handler](testCase.input)

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The provider request could not be completed.',
        retryable: true,
      },
      requestId: REQUEST_ID,
    })
    expectNoSensitiveSerialization(result)
  })

  it.each(cases.filter((testCase) => testCase.serializesUseCaseOutput !== false))(
    'rejects invalid use-case output for $name without serializing secrets',
    async (testCase) => {
      const dependencies = createDependencies()
      dependencies[testCase.useCase].execute.mockResolvedValueOnce({
        ...providerProfile,
        apiKey: API_KEY,
        secretRef: 'secret-ref-to-hide',
        Authorization: `Bearer ${API_KEY}`,
      })
      const handlers = createProviderIpcHandlers(dependencies as unknown as ProviderIpcDependencies)

      const result = await handlers[testCase.handler](testCase.input)

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The provider request could not be completed.',
          retryable: true,
        },
        requestId: REQUEST_ID,
      })
      expectNoSensitiveSerialization(result)
    },
  )
})
