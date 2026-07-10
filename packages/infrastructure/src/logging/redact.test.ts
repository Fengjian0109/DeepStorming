import { describe, expect, it } from 'vitest'

import { redactSensitive } from './redact'

describe('redactSensitive', () => {
  it('redacts nested sensitive keys and bearer tokens', () => {
    expect(
      redactSensitive({
        headers: { authorization: 'Bearer super-secret-value' },
        apiKey: 'not-a-real-secret',
        safe: 'visible',
      }),
    ).toEqual({
      headers: { authorization: '[REDACTED]' },
      apiKey: '[REDACTED]',
      safe: 'visible',
    })
  })
})
