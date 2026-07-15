import { describe, expect, it, vi } from 'vitest'

import { DocumentUseCaseError } from '@deepstorming/application'

import {
  createDocumentAssetIpcHandlers,
  type DocumentAssetIpcDependencies,
} from './document-asset-handlers'

const requestId = '00000000-0000-4000-8000-000000000001'
const documentId = '00000000-0000-4000-8000-000000000201'
const figureId = '00000000-0000-4000-8000-000000000301'
const figure = {
  id: figureId,
  documentId,
  pageNumber: 2,
  label: 'Figure 2',
  caption: 'Attention architecture',
  assetId: '00000000-0000-4000-8000-000000000401',
  assetKind: 'embedded_image' as const,
  width: 320,
  height: 200,
  createdAt: '2026-07-14T00:00:00.000Z',
}
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1])

const dependencies = () => ({
  getDocumentFigureAsset: {
    execute: vi.fn().mockResolvedValue({ figure, mediaType: 'image/png' as const, data: png }),
  },
})

describe('document asset IPC handlers', () => {
  it('returns only a controlled PNG data URL and verified figure metadata', async () => {
    const deps = dependencies()
    const result = await createDocumentAssetIpcHandlers(
      deps as unknown as DocumentAssetIpcDependencies,
    ).getFigureAsset({ requestId, documentId, figureId })

    expect(result).toEqual({
      ok: true,
      data: {
        figure,
        mediaType: 'image/png',
        dataUrl: `data:image/png;base64,${Buffer.from(png).toString('base64')}`,
      },
      requestId,
    })
    expect(result).not.toHaveProperty('data.storedPath')
    expect(deps.getDocumentFigureAsset.execute).toHaveBeenCalledWith({ documentId, figureId })
  })

  it('strictly rejects malformed input without calling the use case', async () => {
    const deps = dependencies()
    const result = await createDocumentAssetIpcHandlers(
      deps as unknown as DocumentAssetIpcDependencies,
    ).getFigureAsset({ requestId, documentId, figureId, storedPath: '/private/figure.png' })

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
    expect(deps.getDocumentFigureAsset.execute).not.toHaveBeenCalled()
  })

  it('maps unknown and cross-document assets to a stable safe error', async () => {
    const deps = dependencies()
    deps.getDocumentFigureAsset.execute.mockRejectedValueOnce(
      new DocumentUseCaseError(
        'DOCUMENT_FIGURE_NOT_FOUND',
        'The document figure was not found.',
        false,
      ),
    )

    const result = await createDocumentAssetIpcHandlers(
      deps as unknown as DocumentAssetIpcDependencies,
    ).getFigureAsset({ requestId, documentId, figureId })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'DOCUMENT_FIGURE_NOT_FOUND',
        message: 'The document figure was not found.',
        retryable: false,
      },
      requestId,
    })
  })
})
