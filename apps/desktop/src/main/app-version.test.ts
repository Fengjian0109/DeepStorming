import { describe, expect, it } from 'vitest'

import { normalizeApplicationVersion } from './app-version'

describe('normalizeApplicationVersion', () => {
  it('trims the build version', () => {
    expect(normalizeApplicationVersion(' 0.0.0 ')).toBe('0.0.0')
  })

  it('rejects an empty build version', () => {
    expect(() => normalizeApplicationVersion(' ')).toThrow('Application version must not be empty')
  })
})
