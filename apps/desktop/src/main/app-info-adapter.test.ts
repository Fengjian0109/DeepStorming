import { describe, expect, it } from 'vitest'

import { ElectronAppInfoAdapter } from './app-info-adapter'

describe('ElectronAppInfoAdapter', () => {
  it('reports the injected build version instead of the Electron executable version', () => {
    const electronApp = {
      getName: () => 'DeepStorming',
      getVersion: () => '43.1.0',
    }

    const adapter = new ElectronAppInfoAdapter(electronApp, '0.0.0')

    expect(adapter.getVersion()).toBe('0.0.0')
  })
})
