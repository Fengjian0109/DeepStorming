import { z } from 'zod'

import { createAppResultSchema } from './app-result'
import type {
  CancelProviderTestResult,
  ListProvidersResult,
  ProviderDraftDto,
  ProviderResult,
  VoidResult,
} from './provider'

export const APP_CHANNELS = {
  getInfo: 'app:get-info',
} as const

export const appInfoRequestSchema = z
  .object({
    requestId: z.string().uuid(),
  })
  .strict()

export const appInfoSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    platform: z.enum(['darwin', 'win32', 'linux', 'unknown']),
  })
  .strict()

export const appInfoResultSchema = createAppResultSchema(appInfoSchema)

export type AppInfoRequest = z.infer<typeof appInfoRequestSchema>
export type AppInfoDto = z.infer<typeof appInfoSchema>
export type AppInfoResult = z.infer<typeof appInfoResultSchema>

export type DeepStormingApi = {
  app: {
    getInfo: () => Promise<AppInfoResult>
  }
  provider: {
    list: () => Promise<ListProvidersResult>
    create: (provider: ProviderDraftDto) => Promise<ProviderResult>
    update: (id: string, provider: ProviderDraftDto) => Promise<ProviderResult>
    remove: (id: string) => Promise<VoidResult>
    activate: (id: string) => Promise<ProviderResult>
    testConnection: (id: string, operationId: string) => Promise<ProviderResult>
    cancelTest: (operationId: string) => Promise<CancelProviderTestResult>
  }
}
