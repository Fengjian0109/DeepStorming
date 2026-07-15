import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { LocalDocumentAssetStore } from './local-document-asset-store'

const roots: string[] = []
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('LocalDocumentAssetStore', () => {
  it('atomically stores PNG assets and replays identical writes idempotently', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deepstorming-assets-'))
    roots.push(root)
    const store = new LocalDocumentAssetStore(root)
    const input = {
      documentId: '00000000-0000-4000-8000-000000000201',
      assetId: '00000000-0000-4000-8000-000000000301',
      data: png,
    }

    const first = await store.writeFigure(input)
    const second = await store.writeFigure(input)

    expect(second).toEqual(first)
    expect(await readFile(first.storedPath)).toEqual(Buffer.from(png))
    await expect(store.readFigure(input.documentId, input.assetId)).resolves.toEqual(png)
  })

  it('does not read assets outside the requested document namespace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deepstorming-assets-'))
    roots.push(root)
    const store = new LocalDocumentAssetStore(root)
    await store.writeFigure({
      documentId: '00000000-0000-4000-8000-000000000201',
      assetId: '00000000-0000-4000-8000-000000000301',
      data: png,
    })

    await expect(
      store.readFigure(
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000301',
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects traversal, non-PNG data, and conflicting retries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deepstorming-assets-'))
    roots.push(root)
    const store = new LocalDocumentAssetStore(root)
    await expect(
      store.writeFigure({
        documentId: '../private',
        assetId: 'asset',
        data: png,
      }),
    ).rejects.toThrow('invalid')
    await expect(
      store.writeFigure({
        documentId: '00000000-0000-4000-8000-000000000201',
        assetId: '00000000-0000-4000-8000-000000000301',
        data: Uint8Array.from([1, 2, 3]),
      }),
    ).rejects.toThrow('PNG')

    await store.writeFigure({
      documentId: '00000000-0000-4000-8000-000000000201',
      assetId: '00000000-0000-4000-8000-000000000301',
      data: png,
    })
    await expect(
      store.writeFigure({
        documentId: '00000000-0000-4000-8000-000000000201',
        assetId: '00000000-0000-4000-8000-000000000301',
        data: Uint8Array.from([...png, 4]),
      }),
    ).rejects.toThrow('different content')
  })
})
