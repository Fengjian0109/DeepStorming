import { z } from 'zod'

import { createAppResultSchema } from './app-result'

export const APP_CHANNELS = {
  getInfo: 'app:get-info',
} as const

export const appInfoRequestSchema = z
  .object({
    requestId: z.string().uuid(),
  })
  .strict()

export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  platform: z.enum(['darwin', 'win32', 'linux', 'unknown']),
})

export const appInfoResultSchema = createAppResultSchema(appInfoSchema)

export type AppInfoRequest = z.infer<typeof appInfoRequestSchema>
export type AppInfoDto = z.infer<typeof appInfoSchema>
export type AppInfoResult = z.infer<typeof appInfoResultSchema>

export type DeepStormingApi = {
  app: {
    getInfo: () => Promise<AppInfoResult>
  }
}
