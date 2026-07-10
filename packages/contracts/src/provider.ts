import { z } from 'zod'

import { createAppResultSchema } from './app-result'

export const PROVIDER_CHANNELS = {
  list: 'provider:list',
  create: 'provider:create',
  update: 'provider:update',
  remove: 'provider:remove',
  activate: 'provider:activate',
  testConnection: 'provider:test-connection',
  cancelTest: 'provider:cancel-test',
} as const

export const providerTypeSchema = z.enum(['mock', 'deepseek', 'openai_compatible'])

export const providerTestStatusSchema = z.enum(['testing', 'success', 'error', 'cancelled'])

export const providerCapabilitiesSchema = z
  .object({
    streaming: z.boolean(),
    structuredOutput: z.boolean(),
    embedding: z.boolean(),
    vision: z.boolean(),
  })
  .strict()

const requiredTextSchema = z.string().refine((value) => value.trim().length > 0, {
  message: 'Required text must not be blank',
})

const apiKeySchema = z.string().refine((value) => !/^[*•]+$/u.test(value.trim()), {
  message: 'Masked API keys cannot be saved',
})

const timestampSchema = z.iso.datetime()

export const providerDraftSchema = z
  .object({
    providerType: providerTypeSchema,
    displayName: requiredTextSchema,
    baseUrl: z.string().optional(),
    modelName: requiredTextSchema,
    apiKey: apiKeySchema.optional(),
  })
  .strict()

export const providerProfileSchema = z
  .object({
    id: z.string().uuid(),
    providerType: providerTypeSchema,
    displayName: requiredTextSchema,
    baseUrl: z.string().optional(),
    modelName: requiredTextSchema,
    hasApiKey: z.boolean(),
    capabilities: providerCapabilitiesSchema,
    isActive: z.boolean(),
    lastTestStatus: providerTestStatusSchema.optional(),
    lastTestedAt: timestampSchema.optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()

const requestIdSchema = z.string().uuid()
const providerIdSchema = z.string().uuid()
const operationIdSchema = z.string().uuid()

export const listProvidersRequestSchema = z.object({ requestId: requestIdSchema }).strict()

export const createProviderRequestSchema = z
  .object({
    requestId: requestIdSchema,
    provider: providerDraftSchema,
  })
  .strict()

export const updateProviderRequestSchema = z
  .object({
    requestId: requestIdSchema,
    id: providerIdSchema,
    provider: providerDraftSchema,
  })
  .strict()

export const removeProviderRequestSchema = z
  .object({ requestId: requestIdSchema, id: providerIdSchema })
  .strict()

export const activateProviderRequestSchema = z
  .object({ requestId: requestIdSchema, id: providerIdSchema })
  .strict()

export const testProviderConnectionRequestSchema = z
  .object({
    requestId: requestIdSchema,
    id: providerIdSchema,
    operationId: operationIdSchema,
  })
  .strict()

export const cancelProviderTestRequestSchema = z
  .object({ requestId: requestIdSchema, operationId: operationIdSchema })
  .strict()

const voidDataSchema = z.object({}).strict()
const cancelProviderTestDataSchema = z.object({ cancelled: z.boolean() }).strict()

export const listProvidersResultSchema = createAppResultSchema(z.array(providerProfileSchema))
export const providerResultSchema = createAppResultSchema(providerProfileSchema)
export const voidResultSchema = createAppResultSchema(voidDataSchema)
export const cancelProviderTestResultSchema = createAppResultSchema(cancelProviderTestDataSchema)

export type ProviderTypeDto = z.infer<typeof providerTypeSchema>
export type ProviderTestStatusDto = z.infer<typeof providerTestStatusSchema>
export type ProviderCapabilitiesDto = z.infer<typeof providerCapabilitiesSchema>
export type ProviderDraftDto = z.infer<typeof providerDraftSchema>
export type ProviderProfileDto = z.infer<typeof providerProfileSchema>

export type ListProvidersRequest = z.infer<typeof listProvidersRequestSchema>
export type CreateProviderRequest = z.infer<typeof createProviderRequestSchema>
export type UpdateProviderRequest = z.infer<typeof updateProviderRequestSchema>
export type RemoveProviderRequest = z.infer<typeof removeProviderRequestSchema>
export type ActivateProviderRequest = z.infer<typeof activateProviderRequestSchema>
export type TestProviderConnectionRequest = z.infer<typeof testProviderConnectionRequestSchema>
export type CancelProviderTestRequest = z.infer<typeof cancelProviderTestRequestSchema>

export type ListProvidersResult = z.infer<typeof listProvidersResultSchema>
export type ProviderResult = z.infer<typeof providerResultSchema>
export type VoidResult = z.infer<typeof voidResultSchema>
export type CancelProviderTestResult = z.infer<typeof cancelProviderTestResultSchema>
