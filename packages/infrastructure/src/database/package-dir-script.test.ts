import { expect, test } from 'vitest'
import { runPackageWithRestore } from '../../../../scripts/package-dir.mjs'

test('restores the Node ABI after packaging fails and preserves packaging status', () => {
  const calls: string[] = []
  const status = runPackageWithRestore((phase) => {
    calls.push(phase)
    return phase === 'package' ? 23 : 0
  })
  expect(calls).toEqual(['package', 'restore'])
  expect(status).toBe(23)
})
