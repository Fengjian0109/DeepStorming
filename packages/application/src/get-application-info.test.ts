import { describe, expect, it } from 'vitest'

import { GetApplicationInfo } from './get-application-info'

describe('GetApplicationInfo', () => {
  it('returns normalized application information through the port', () => {
    const useCase = new GetApplicationInfo({
      getName: () => 'DeepStorming',
      getVersion: () => '0.0.0',
      getPlatform: () => 'darwin',
    })

    expect(useCase.execute()).toEqual({
      name: 'DeepStorming',
      version: '0.0.0',
      platform: 'darwin',
    })
  })
})
