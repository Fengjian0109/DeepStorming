import { describe, expect, expectTypeOf, it } from 'vitest'

import { appErrorCodeSchema, appErrorSchema } from './app-result'
import type { DeepStormingApi, DeepStormingBootstrapApi } from './app-info'
import type { DocumentDraftDto } from './document'
import {
  PROVIDER_CHANNELS,
  activateProviderRequestSchema,
  cancelProviderTestRequestSchema,
  cancelProviderTestResultSchema,
  createProviderRequestSchema,
  listProvidersRequestSchema,
  listProvidersResultSchema,
  providerDraftSchema,
  providerProfileSchema,
  providerResultSchema,
  removeProviderRequestSchema,
  testProviderConnectionRequestSchema,
  updateProviderRequestSchema,
  voidResultSchema,
  type ProviderDraftDto,
} from './provider'

const requestId = 'f4b7fd8f-4f47-4a61-9224-151f51f347de'
const providerId = '12ed23d2-5b15-4e62-a1ca-4ddae5a2145d'
const operationId = '7ec13638-0d1e-42a6-97dd-82c81f70e8e8'

const providerDraft = {
  providerType: 'deepseek',
  displayName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
} as const

const providerProfile = {
  id: providerId,
  providerType: 'deepseek',
  displayName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  modelName: 'deepseek-chat',
  hasApiKey: true,
  capabilities: {
    streaming: true,
    structuredOutput: true,
    embedding: false,
    vision: false,
  },
  isActive: true,
  lastTestStatus: 'success',
  lastTestedAt: '2026-07-10T05:10:00.000Z',
  createdAt: '2026-07-10T05:00:00.000Z',
  updatedAt: '2026-07-10T05:10:00.000Z',
} as const

const failureResult = {
  ok: false,
  error: {
    code: 'PROVIDER_NETWORK_ERROR',
    message: 'The provider could not be reached.',
    retryable: true,
  },
  requestId,
} as const

describe('provider request contracts', () => {
  it('uses the exact provider channel map', () => {
    expect(PROVIDER_CHANNELS).toEqual({
      list: 'provider:list',
      create: 'provider:create',
      update: 'provider:update',
      remove: 'provider:remove',
      activate: 'provider:activate',
      testConnection: 'provider:test-connection',
      cancelTest: 'provider:cancel-test',
    })
  })

  const requests = [
    [listProvidersRequestSchema, { requestId }],
    [createProviderRequestSchema, { requestId, provider: providerDraft }],
    [updateProviderRequestSchema, { requestId, id: providerId, provider: providerDraft }],
    [removeProviderRequestSchema, { requestId, id: providerId }],
    [activateProviderRequestSchema, { requestId, id: providerId }],
    [testProviderConnectionRequestSchema, { requestId, id: providerId, operationId }],
    [cancelProviderTestRequestSchema, { requestId, operationId }],
  ] as const

  it.each(requests)('accepts valid %s input', (schema, input) => {
    expect(schema.safeParse(input).success).toBe(true)
  })

  it.each(requests)('rejects unknown fields for %s', (schema, input) => {
    expect(schema.safeParse({ ...input, unknown: true }).success).toBe(false)
  })

  it.each(requests)('requires a UUID requestId for %s', (schema, input) => {
    expect(schema.safeParse({ ...input, requestId: 'not-a-uuid' }).success).toBe(false)
  })

  const requestsWithIdentifiers = [
    [updateProviderRequestSchema, { requestId, id: 'not-a-uuid', provider: providerDraft }],
    [removeProviderRequestSchema, { requestId, id: 'not-a-uuid' }],
    [activateProviderRequestSchema, { requestId, id: 'not-a-uuid' }],
    [testProviderConnectionRequestSchema, { requestId, id: 'not-a-uuid', operationId }],
    [testProviderConnectionRequestSchema, { requestId, id: providerId, operationId: 'not-a-uuid' }],
    [cancelProviderTestRequestSchema, { requestId, operationId: 'not-a-uuid' }],
  ] as const

  it.each(requestsWithIdentifiers)('requires UUID identifiers for %s', (schema, input) => {
    expect(schema.safeParse(input).success).toBe(false)
  })

  it('keeps nested provider drafts strict', () => {
    expect(
      createProviderRequestSchema.safeParse({
        requestId,
        provider: { ...providerDraft, unknown: true },
      }).success,
    ).toBe(false)
  })
})

describe('provider DTO contracts', () => {
  it.each(['mock', 'deepseek', 'openai_compatible'])('accepts provider type %s', (providerType) => {
    expect(providerDraftSchema.safeParse({ ...providerDraft, providerType }).success).toBe(true)
  })

  it.each(['displayName', 'modelName'] as const)('rejects blank required %s values', (field) => {
    expect(providerDraftSchema.safeParse({ ...providerDraft, [field]: '   ' }).success).toBe(false)
  })

  it.each(['********', '••••••', '  ****  ', '  ••••  '])('rejects masked API key %j', (apiKey) => {
    expect(providerDraftSchema.safeParse({ ...providerDraft, apiKey }).success).toBe(false)
  })

  it.each(['secretRef', 'apiKey', 'ciphertext'] as const)(
    'rejects public profile field %s',
    (field) => {
      expect(
        providerProfileSchema.safeParse({ ...providerProfile, [field]: 'private' }).success,
      ).toBe(false)
    },
  )

  it('rejects unknown nested capability fields', () => {
    expect(
      providerProfileSchema.safeParse({
        ...providerProfile,
        capabilities: { ...providerProfile.capabilities, tools: true },
      }).success,
    ).toBe(false)
  })
})

describe('provider result contracts', () => {
  const resultSchemas = [
    listProvidersResultSchema,
    providerResultSchema,
    voidResultSchema,
    cancelProviderTestResultSchema,
  ] as const

  it('accepts valid list, single, void, and cancel successes', () => {
    expect(
      listProvidersResultSchema.safeParse({ ok: true, data: [providerProfile], requestId }).success,
    ).toBe(true)
    expect(
      providerResultSchema.safeParse({ ok: true, data: providerProfile, requestId }).success,
    ).toBe(true)
    expect(voidResultSchema.safeParse({ ok: true, data: {}, requestId }).success).toBe(true)
    expect(
      cancelProviderTestResultSchema.safeParse({
        ok: true,
        data: { cancelled: true },
        requestId,
      }).success,
    ).toBe(true)
  })

  it.each(resultSchemas)('accepts a valid failure result for %s', (schema) => {
    expect(schema.safeParse(failureResult).success).toBe(true)
  })

  it('keeps success data strict', () => {
    expect(
      voidResultSchema.safeParse({ ok: true, data: { unexpected: true }, requestId }).success,
    ).toBe(false)
    expect(
      cancelProviderTestResultSchema.safeParse({
        ok: true,
        data: { cancelled: true, unexpected: true },
        requestId,
      }).success,
    ).toBe(false)
    expect(
      listProvidersResultSchema.safeParse({
        ok: true,
        data: [{ ...providerProfile, secretRef: 'private' }],
        requestId,
      }).success,
    ).toBe(false)
  })
})

describe('provider error and API contracts', () => {
  const newErrorCodes = [
    'DATABASE_UNAVAILABLE',
    'DATABASE_MIGRATION_FAILED',
    'PROVIDER_NOT_FOUND',
    'PROVIDER_VALIDATION_FAILED',
    'PROVIDER_AUTH_FAILED',
    'PROVIDER_RATE_LIMITED',
    'PROVIDER_QUOTA_EXCEEDED',
    'PROVIDER_MODEL_NOT_FOUND',
    'PROVIDER_NETWORK_ERROR',
    'PROVIDER_TIMEOUT',
    'PROVIDER_RESPONSE_INVALID',
    'SECRET_VAULT_UNAVAILABLE',
    'SECRET_WRITE_FAILED',
    'SECRET_DELETE_FAILED',
    'OPERATION_CANCELLED',
  ] as const

  it.each(newErrorCodes)('accepts error code %s', (code) => {
    expect(appErrorCodeSchema.safeParse(code).success).toBe(true)
  })

  it('rejects unknown error codes', () => {
    expect(appErrorCodeSchema.safeParse('PROVIDER_SECRET_LEAKED').success).toBe(false)
  })

  it.each(['apiKey', 'authorization', 'requestBody', 'responseBody', 'stack', 'unexpected'])(
    'rejects unsafe or unknown diagnostic detail %s',
    (field) => {
      expect(
        appErrorSchema.safeParse({
          code: 'PROVIDER_RESPONSE_INVALID',
          message: 'The provider response was invalid.',
          retryable: false,
          details: { [field]: 'private' },
        }).success,
      ).toBe(false)
    },
  )

  it('rejects nested diagnostic payloads', () => {
    expect(
      appErrorSchema.safeParse({
        code: 'PROVIDER_RESPONSE_INVALID',
        message: 'The provider response was invalid.',
        retryable: false,
        details: { issueCount: 1, payload: { nested: 'private' } },
      }).success,
    ).toBe(false)
  })

  it('accepts only the allowlisted diagnostic detail shapes', () => {
    expect(
      appErrorSchema.safeParse({
        code: 'PROVIDER_VALIDATION_FAILED',
        message: 'The provider configuration was invalid.',
        retryable: false,
        details: {
          issueCount: 2,
          statusCode: 422,
          fieldName: 'modelName',
          operationId,
        },
      }).success,
    ).toBe(true)
  })

  it.each([
    { issueCount: -1 },
    { issueCount: 1.5 },
    { statusCode: 99 },
    { statusCode: 600 },
    { statusCode: 200.5 },
    { fieldName: '' },
    { operationId: 'not-a-uuid' },
  ])('rejects invalid diagnostic detail constraints for %j', (details) => {
    expect(
      appErrorSchema.safeParse({
        code: 'PROVIDER_VALIDATION_FAILED',
        message: 'The provider configuration was invalid.',
        retryable: false,
        details,
      }).success,
    ).toBe(false)
  })

  it('exposes an explicit, type-safe provider API', () => {
    const api = {
      app: {
        getInfo: async () => ({
          ok: false as const,
          error: { code: 'INTERNAL_ERROR' as const, message: 'Unavailable', retryable: true },
          requestId,
        }),
      },
      documents: {
        list: async () => ({ ok: true as const, data: [], requestId }),
        createFromText: async (_document: DocumentDraftDto) => ({
          ok: true as const,
          data: {
            id: providerId,
            documentType: 'generic' as const,
            title: 'Notes',
            sourceKind: 'pasted_text' as const,
            characterCount: 12,
            createdAt: '2026-07-10T05:00:00.000Z',
            updatedAt: '2026-07-10T05:10:00.000Z',
          },
          requestId,
        }),
        get: async (_id: string) => ({
          ok: true as const,
          data: {
            id: providerId,
            documentType: 'generic' as const,
            title: 'Notes',
            sourceKind: 'pasted_text' as const,
            characterCount: 12,
            plainText: 'detail text',
            createdAt: '2026-07-10T05:00:00.000Z',
            updatedAt: '2026-07-10T05:10:00.000Z',
          },
          requestId,
        }),
        search: async (_query: string) => ({
          ok: true as const,
          data: [
            {
              documentId: providerId,
              documentType: 'generic' as const,
              title: 'Notes',
              sourceKind: 'pasted_text' as const,
              characterCount: 12,
              snippet: 'detail',
              startOffset: 0,
              endOffset: 6,
              createdAt: '2026-07-10T05:00:00.000Z',
              updatedAt: '2026-07-10T05:10:00.000Z',
            },
          ],
          requestId,
        }),
        remove: async (_id: string) => ({ ok: true as const, data: {}, requestId }),
      },
      lessons: {
        list: async () => ({ ok: true as const, data: [], requestId }),
        startFromDocument: async () => ({
          ok: true as const,
          data: {
            id: providerId,
            title: 'Notes 课堂',
            status: 'active' as const,
            documentId: providerId,
            documentTitle: 'Notes',
            sourceAnchors: [
              {
                id: operationId,
                documentId: providerId,
                startOffset: 0,
                endOffset: 6,
                snippet: 'detail',
              },
            ],
            messages: [
              {
                id: requestId,
                lessonId: providerId,
                modelRunId: operationId,
                role: 'tutor' as const,
                content:
                  '我们先从《Notes》的这段证据开始：detail\n\n你觉得它想解决的核心问题是什么？',
                sourceAnchorIds: [operationId],
                promptVersion: 'mock-tutor-v1',
                createdAt: '2026-07-10T05:00:00.000Z',
              },
            ],
            modelRuns: [
              {
                id: operationId,
                lessonId: providerId,
                providerId: null,
                modelName: 'mock-local',
                operation: 'lesson_tutor_first_question',
                status: 'succeeded',
                promptManifest: {
                  key: 'lesson.mockTutor.firstQuestion',
                  version: 1,
                  hash: 'sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff',
                },
                inputSummary: {
                  documentId: providerId,
                  documentTitle: 'Notes',
                  sourceAnchorIds: [operationId],
                  sourceCharacterRange: { startOffset: 0, endOffset: 6 },
                  snippetCharacterCount: 6,
                },
                sourceAnchorIds: [operationId],
                outputMessageId: requestId,
                startedAt: '2026-07-10T05:00:00.000Z',
                finishedAt: '2026-07-10T05:00:00.000Z',
              },
            ],
            createdAt: '2026-07-10T05:00:00.000Z',
            updatedAt: '2026-07-10T05:10:00.000Z',
          },
          requestId,
        }),
        get: async (_id: string) => ({
          ok: true as const,
          data: {
            id: providerId,
            title: 'Notes 课堂',
            status: 'active' as const,
            documentId: providerId,
            documentTitle: 'Notes',
            sourceAnchors: [
              {
                id: operationId,
                documentId: providerId,
                startOffset: 0,
                endOffset: 6,
                snippet: 'detail',
              },
            ],
            messages: [
              {
                id: requestId,
                lessonId: providerId,
                modelRunId: operationId,
                role: 'tutor' as const,
                content:
                  '我们先从《Notes》的这段证据开始：detail\n\n你觉得它想解决的核心问题是什么？',
                sourceAnchorIds: [operationId],
                promptVersion: 'mock-tutor-v1',
                createdAt: '2026-07-10T05:00:00.000Z',
              },
            ],
            modelRuns: [
              {
                id: operationId,
                lessonId: providerId,
                providerId: null,
                modelName: 'mock-local',
                operation: 'lesson_tutor_first_question',
                status: 'succeeded',
                promptManifest: {
                  key: 'lesson.mockTutor.firstQuestion',
                  version: 1,
                  hash: 'sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff',
                },
                inputSummary: {
                  documentId: providerId,
                  documentTitle: 'Notes',
                  sourceAnchorIds: [operationId],
                  sourceCharacterRange: { startOffset: 0, endOffset: 6 },
                  snippetCharacterCount: 6,
                },
                sourceAnchorIds: [operationId],
                outputMessageId: requestId,
                startedAt: '2026-07-10T05:00:00.000Z',
                finishedAt: '2026-07-10T05:00:00.000Z',
              },
            ],
            createdAt: '2026-07-10T05:00:00.000Z',
            updatedAt: '2026-07-10T05:10:00.000Z',
          },
          requestId,
        }),
      },
      provider: {
        list: async () => ({ ok: true as const, data: [providerProfile], requestId }),
        create: async (_provider: ProviderDraftDto) => ({
          ok: true as const,
          data: providerProfile,
          requestId,
        }),
        update: async (_id: string, _provider: ProviderDraftDto) => ({
          ok: true as const,
          data: providerProfile,
          requestId,
        }),
        remove: async (_id: string) => ({ ok: true as const, data: {}, requestId }),
        activate: async (_id: string) => ({
          ok: true as const,
          data: providerProfile,
          requestId,
        }),
        testConnection: async (_id: string, _operationId: string) => ({
          ok: true as const,
          data: providerProfile,
          requestId,
        }),
        cancelTest: async (_operationId: string) => ({
          ok: true as const,
          data: { cancelled: true },
          requestId,
        }),
      },
    } satisfies DeepStormingApi

    expect(api.provider.list).toBeTypeOf('function')
    expectTypeOf(api.provider.create).parameters.toEqualTypeOf<[ProviderDraftDto]>()
    expectTypeOf(api.provider.update).parameters.toEqualTypeOf<[string, ProviderDraftDto]>()
    expectTypeOf(api.provider.testConnection).parameters.toEqualTypeOf<[string, string]>()
    expectTypeOf<DeepStormingBootstrapApi>().toEqualTypeOf<DeepStormingApi>()
  })
})
