import { describe, expect, it } from 'vitest'

import { createApplicationInfo } from './application-info'

describe('createApplicationInfo', () => {
  it('normalizes supported runtime information', () => {
    expect(
      createApplicationInfo({ name: ' DeepStorming ', version: ' 0.0.0 ', platform: 'darwin' }),
    ).toEqual({
      name: 'DeepStorming',
      version: '0.0.0',
      platform: 'darwin',
    })
  })

  it('maps an unsupported platform to unknown', () => {
    expect(
      createApplicationInfo({ name: 'DeepStorming', version: '0.0.0', platform: 'aix' }),
    ).toMatchObject({ platform: 'unknown' })
  })

  it('rejects empty version values', () => {
    expect(() =>
      createApplicationInfo({ name: 'DeepStorming', version: ' ', platform: 'linux' }),
    ).toThrow('version must not be empty')
  })
})
