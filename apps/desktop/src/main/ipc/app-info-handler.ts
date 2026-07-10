import { randomUUID } from 'node:crypto'

import type { GetApplicationInfo } from '@deepstorming/application'
import { type AppInfoResult, appInfoRequestSchema, type AppResult } from '@deepstorming/contracts'

const requestIdFrom = (input: unknown): string => {
  if (
    input !== null &&
    typeof input === 'object' &&
    'requestId' in input &&
    typeof input.requestId === 'string'
  ) {
    return input.requestId
  }

  return randomUUID()
}

export const createAppInfoHandler =
  (getApplicationInfo: GetApplicationInfo) =>
  async (input: unknown): Promise<AppInfoResult> => {
    const parsed = appInfoRequestSchema.safeParse(input)
    const requestId = requestIdFrom(input)

    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'The app information request is invalid.',
          retryable: false,
          details: { issueCount: parsed.error.issues.length },
        },
        requestId,
      }
    }

    try {
      return {
        ok: true,
        data: getApplicationInfo.execute(),
        requestId: parsed.data.requestId,
      }
    } catch {
      const result: AppResult<never> = {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'DeepStorming could not read its runtime information.',
          retryable: true,
        },
        requestId: parsed.data.requestId,
      }

      return result
    }
  }
