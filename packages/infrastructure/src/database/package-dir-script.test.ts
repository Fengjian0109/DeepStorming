import { expect, test } from 'vitest'
import { runPackageWithRestore } from '../../../../scripts/package-dir.mjs'
import { runE2eWithRestore } from '../../../../scripts/test-e2e.mjs'

test('restores the Node ABI after packaging fails and preserves packaging status', () => {
  const calls: string[] = []
  const status = runPackageWithRestore((phase) => {
    calls.push(phase)
    return phase === 'package' ? 23 : 0
  })
  expect(calls).toEqual(['package', 'restore'])
  expect(status).toBe(23)
})

test('restores the Node ABI after Electron E2E rebuild fails', () => {
  const calls: string[] = []
  const status = runE2eWithRestore((phase) => {
    calls.push(phase)
    return phase === 'rebuild' ? 24 : 0
  })
  expect(calls).toEqual(['build', 'rebuild', 'restore'])
  expect(status).toBe(24)
})

test('restores the Node ABI after the Electron development process exits', async () => {
  const devModule = await import('../../../../scripts/dev.mjs').catch(() => undefined)
  expect(devModule?.runDevWithRestore).toBeTypeOf('function')
  if (devModule === undefined) return

  const calls: string[] = []
  const status = await devModule.runDevWithRestore((phase) => {
    calls.push(phase)
    return phase === 'dev' ? 25 : 0
  })
  expect(calls).toEqual(['clean', 'rebuild', 'dev', 'restore'])
  expect(status).toBe(25)
})
