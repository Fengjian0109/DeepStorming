import { describe, expect, it } from 'vitest'

import { appInfoRequestSchema, appInfoResultSchema } from './app-info'

describe('app info contracts', () => {
  it('rejects extra IPC request fields', () => {
    expect(
      appInfoRequestSchema.safeParse({
        requestId: 'f4b7fd8f-4f47-4a61-9224-151f51f347de',
        unsafe: true,
      }).success,
    ).toBe(false)
  })

  it('accepts a valid success result', () => {
    expect(
      appInfoResultSchema.safeParse({
        ok: true,
        data: { name: 'DeepStorming', version: '0.0.0', platform: 'linux' },
        requestId: 'f4b7fd8f-4f47-4a61-9224-151f51f347de',
      }).success,
    ).toBe(true)
  })
})
