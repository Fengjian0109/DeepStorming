import { GetApplicationInfo } from '@deepstorming/application'
import { FakeAppInfoPort } from '@deepstorming/testkit'
import { describe, expect, it } from 'vitest'

import { createAppInfoHandler } from './app-info-handler'

describe('app info IPC handler', () => {
  it('returns a typed result for valid input', async () => {
    const handler = createAppInfoHandler(new GetApplicationInfo(new FakeAppInfoPort()))
    const result = await handler({ requestId: 'f4b7fd8f-4f47-4a61-9224-151f51f347de' })

    expect(result).toEqual({
      ok: true,
      data: { name: 'DeepStorming', version: '0.0.0-test', platform: 'linux' },
      requestId: 'f4b7fd8f-4f47-4a61-9224-151f51f347de',
    })
  })

  it('rejects malformed input without throwing across IPC', async () => {
    const handler = createAppInfoHandler(new GetApplicationInfo(new FakeAppInfoPort()))
    const result = await handler({ requestId: 'not-a-uuid' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_REQUEST')
    }
  })
})
