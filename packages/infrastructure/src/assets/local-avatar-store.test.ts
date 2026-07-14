import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LocalAvatarStore } from './local-avatar-store'

describe('LocalAvatarStore', () => {
  let directory: string
  let sourceDirectory: string
  let store: LocalAvatarStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'deepstorming-avatar-store-'))
    sourceDirectory = await mkdtemp(join(tmpdir(), 'deepstorming-avatar-source-'))
    store = new LocalAvatarStore(directory, { maxBytes: 16 })
  })

  afterEach(async () => {
    await Promise.all([
      rm(directory, { recursive: true, force: true }),
      rm(sourceDirectory, { recursive: true, force: true }),
    ])
  })

  it('copies a supported avatar to a content-addressed managed path', async () => {
    const source = join(sourceDirectory, 'avatar.png')
    await writeFile(source, Buffer.from('png-image'))

    const first = await store.importAvatar(source)
    const second = await store.importAvatar(source)

    expect(first).toEqual(second)
    expect(first.assetId).toMatch(/^[a-f\d]{64}\.png$/u)
    await expect(readFile(join(directory, 'avatars', first.assetId), 'utf8')).resolves.toBe(
      'png-image',
    )
  })

  it('rejects unsupported and oversized files', async () => {
    const text = join(sourceDirectory, 'avatar.txt')
    const large = join(sourceDirectory, 'large.webp')
    await writeFile(text, 'not-an-image')
    await writeFile(large, 'x'.repeat(17))

    await expect(store.importAvatar(text)).rejects.toThrow('Avatar file type is not supported')
    await expect(store.importAvatar(large)).rejects.toThrow('Avatar file is too large')
  })

  it('rejects traversal asset ids and removes a managed avatar idempotently', async () => {
    await expect(store.removeAvatar('../secret.png')).rejects.toThrow('Avatar asset id is invalid')
    await expect(store.removeAvatar('a'.repeat(64) + '.jpg')).resolves.toBeUndefined()
  })
})
