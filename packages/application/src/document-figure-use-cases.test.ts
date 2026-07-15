import { describe, expect, it, vi } from 'vitest'

import type {
  DocumentAssetStorePort,
  DocumentFigureRepositoryPort,
  PdfFigureExtractorPort,
  StoredDocumentFigure,
} from './document-ports'
import { ExtractDocumentFigures, GetDocumentFigureAsset } from './document-use-cases'

const documentId = '00000000-0000-4000-8000-000000000201'
const figureId = '00000000-0000-4000-8000-000000000301'
const assetId = '00000000-0000-4000-8000-000000000401'
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1])

class FigureRepository implements DocumentFigureRepositoryPort {
  public complete = false
  public figures: StoredDocumentFigure[] = []

  async isFigureExtractionComplete(): Promise<boolean> {
    return this.complete
  }

  async completeFigureExtraction(
    _documentId: string,
    figures: readonly StoredDocumentFigure[],
  ): Promise<void> {
    this.figures = [...figures]
    this.complete = true
  }

  async listFigures(): Promise<readonly StoredDocumentFigure[]> {
    return this.figures
  }
}

describe('ExtractDocumentFigures', () => {
  it('persists assets once and replays completed extraction idempotently', async () => {
    const repository = new FigureRepository()
    const extractor: PdfFigureExtractorPort = {
      extract: vi.fn().mockResolvedValue([
        {
          pageNumber: 2,
          label: 'Figure 2',
          caption: 'Attention architecture',
          assetKind: 'embedded_image',
          width: 320,
          height: 200,
          data: png,
        },
      ]),
    }
    const store: DocumentAssetStorePort = {
      writeFigure: vi.fn().mockResolvedValue({ assetId, storedPath: '/managed/figure.png' }),
      readFigure: vi.fn(),
      deleteFigure: vi.fn(),
    }
    const ids = [figureId, assetId]
    const useCase = new ExtractDocumentFigures(
      repository,
      extractor,
      store,
      { now: () => '2026-07-14T00:00:00.000Z' },
      { generate: () => ids.shift()! },
    )
    const input = {
      documentId,
      filePath: '/managed/paper.pdf',
      pages: [{ pageNumber: 2, text: 'Figure 2: Attention architecture' }],
    }
    const token = { cancelled: false, onCancel: () => () => undefined }

    await expect(useCase.execute(input, token)).resolves.toHaveLength(1)
    await expect(useCase.execute(input, token)).resolves.toEqual(repository.figures)
    expect(extractor.extract).toHaveBeenCalledOnce()
    expect(store.writeFigure).toHaveBeenCalledOnce()
  })

  it('cancels before external work and does not mark extraction complete', async () => {
    const repository = new FigureRepository()
    const extractor: PdfFigureExtractorPort = { extract: vi.fn() }
    const store: DocumentAssetStorePort = {
      writeFigure: vi.fn(),
      readFigure: vi.fn(),
      deleteFigure: vi.fn(),
    }
    const useCase = new ExtractDocumentFigures(
      repository,
      extractor,
      store,
      { now: () => '2026-07-14T00:00:00.000Z' },
      { generate: () => figureId },
    )

    await expect(
      useCase.execute(
        { documentId, filePath: '/managed/paper.pdf', pages: [] },
        { cancelled: true, onCancel: () => () => undefined },
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_CANCELLED' })
    expect(extractor.extract).not.toHaveBeenCalled()
    expect(repository.complete).toBe(false)
  })
})

describe('GetDocumentFigureAsset', () => {
  const storedFigure: StoredDocumentFigure = {
    id: figureId,
    documentId,
    pageNumber: 2,
    label: 'Figure 2',
    caption: 'Attention architecture',
    assetId,
    assetKind: 'embedded_image',
    width: 320,
    height: 200,
    createdAt: '2026-07-14T00:00:00.000Z',
  }

  it('reads a figure only after verifying ownership in the requested document', async () => {
    const repository = new FigureRepository()
    repository.figures = [storedFigure]
    const store: DocumentAssetStorePort = {
      writeFigure: vi.fn(),
      readFigure: vi.fn().mockResolvedValue(png),
      deleteFigure: vi.fn(),
    }

    const result = await new GetDocumentFigureAsset(repository, store).execute({
      documentId,
      figureId,
    })

    expect(result).toEqual({ figure: storedFigure, mediaType: 'image/png', data: png })
    expect(store.readFigure).toHaveBeenCalledWith(documentId, assetId)
  })

  it('fails safely for unknown and cross-document figure identifiers without reading assets', async () => {
    const repository = new FigureRepository()
    repository.figures = [storedFigure]
    const store: DocumentAssetStorePort = {
      writeFigure: vi.fn(),
      readFigure: vi.fn(),
      deleteFigure: vi.fn(),
    }
    const useCase = new GetDocumentFigureAsset(repository, store)

    await expect(
      useCase.execute({
        documentId: '00000000-0000-4000-8000-000000000202',
        figureId,
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_FIGURE_NOT_FOUND', retryable: false })
    await expect(
      useCase.execute({
        documentId,
        figureId: '00000000-0000-4000-8000-000000000302',
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_FIGURE_NOT_FOUND', retryable: false })
    expect(store.readFigure).not.toHaveBeenCalled()
  })
})
