import { describe, expect, it } from 'vitest'

import { findFigureCaptions, normalizeDocumentFigure } from './document-figure'

describe('document figures', () => {
  it('matches Figure, Fig., and Chinese figure captions without matching prose', () => {
    expect(findFigureCaptions('Figure 2: Attention architecture\nordinary text')).toEqual([
      { label: 'Figure 2', caption: 'Attention architecture' },
    ])
    expect(findFigureCaptions('Fig. 3. Training curve')).toEqual([
      { label: 'Fig. 3', caption: 'Training curve' },
    ])
    expect(findFigureCaptions('图 4：消融实验结果')).toEqual([
      { label: '图 4', caption: '消融实验结果' },
    ])
    expect(findFigureCaptions('This paragraph mentions figure quality.')).toEqual([])
  })

  it('normalizes controlled figure metadata and rejects unsafe assets', () => {
    expect(
      normalizeDocumentFigure({
        id: '00000000-0000-4000-8000-000000000101',
        documentId: '00000000-0000-4000-8000-000000000201',
        pageNumber: 2,
        label: 'Figure 2',
        caption: 'Attention architecture',
        assetId: '00000000-0000-4000-8000-000000000301',
        assetKind: 'embedded_image',
        width: 320,
        height: 200,
        createdAt: '2026-07-14T00:00:00.000Z',
      }),
    ).toMatchObject({ pageNumber: 2, assetKind: 'embedded_image' })
    expect(() =>
      normalizeDocumentFigure({
        id: '00000000-0000-4000-8000-000000000101',
        documentId: '00000000-0000-4000-8000-000000000201',
        pageNumber: 2,
        label: 'Figure 2',
        caption: 'Attention architecture',
        assetId: '../private',
        assetKind: 'page_render',
        width: 320,
        height: 200,
        createdAt: '2026-07-14T00:00:00.000Z',
      }),
    ).toThrow('Document figure asset id is invalid')
  })
})
