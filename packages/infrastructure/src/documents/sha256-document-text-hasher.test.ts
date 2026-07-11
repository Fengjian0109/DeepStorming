import { describe, expect, it } from 'vitest'
import { Sha256DocumentTextHasher } from './sha256-document-text-hasher'

describe('Sha256DocumentTextHasher', () => {
  it('hashes document text with SHA-256 hex', async () => {
    await expect(new Sha256DocumentTextHasher().hash('same text')).resolves.toBe(
      '2e68a7bba11b90d1bae1daea2dd4951779cf45d5897c62539d01f44054bcb1e0',
    )
  })
})
