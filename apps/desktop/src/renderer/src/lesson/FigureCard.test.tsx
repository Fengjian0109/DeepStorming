// @vitest-environment jsdom

import type { DeepStormingBootstrapApi, DocumentFigureAssetResult } from '@deepstorming/contracts'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FigureCard } from './FigureCard'

const documentId = '00000000-0000-4000-8000-000000000201'
const figureId = '00000000-0000-4000-8000-000000000301'
const requestId = '00000000-0000-4000-8000-000000000001'
const success: DocumentFigureAssetResult = {
  ok: true,
  data: {
    figure: {
      id: figureId,
      documentId,
      pageNumber: 4,
      label: 'Figure 2',
      caption: 'Attention architecture',
      assetId: '00000000-0000-4000-8000-000000000401',
      assetKind: 'embedded_image',
      width: 320,
      height: 200,
      createdAt: '2026-07-14T00:00:00.000Z',
    },
    mediaType: 'image/png',
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  },
  requestId,
}

const installApi = (getFigureAsset: ReturnType<typeof vi.fn>) => {
  Object.defineProperty(window, 'deepstorming', {
    configurable: true,
    value: {
      documents: { getFigureAsset },
    } as unknown as DeepStormingBootstrapApi,
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('FigureCard', () => {
  it('shows loading then the verified figure, caption, page, and rationale', async () => {
    const getFigureAsset = vi.fn().mockResolvedValue(success)
    installApi(getFigureAsset)
    const onReturnToSource = vi.fn()
    const user = userEvent.setup()

    render(
      <FigureCard
        documentId={documentId}
        figureId={figureId}
        rationale="用于对比注意力模块"
        onReturnToSource={onReturnToSource}
      />,
    )

    expect(screen.getByText('正在加载图片…')).toBeTruthy()
    const image = await screen.findByRole('img', { name: 'Figure 2：Attention architecture' })
    expect(image.getAttribute('src')).toBe(success.ok ? success.data.dataUrl : '')
    expect(screen.getByText('第 4 页')).toBeTruthy()
    expect(screen.getByText('用于对比注意力模块')).toBeTruthy()
    expect(getFigureAsset).toHaveBeenCalledWith(documentId, figureId)

    await user.click(screen.getByRole('button', { name: '回到图片来源' }))
    expect(onReturnToSource).toHaveBeenCalledWith(success.ok ? success.data.figure : undefined)
  })

  it('shows a safe error and supports retrying the controlled request', async () => {
    const getFigureAsset = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'DOCUMENT_FIGURE_NOT_FOUND',
          message: 'The document figure was not found.',
          retryable: false,
        },
        requestId,
      })
      .mockResolvedValueOnce(success)
    installApi(getFigureAsset)
    const user = userEvent.setup()

    render(<FigureCard documentId={documentId} figureId={figureId} rationale="证据" />)

    expect(await screen.findByText('图片暂时无法显示。')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '重试加载图片' }))
    expect(
      await screen.findByRole('img', { name: 'Figure 2：Attention architecture' }),
    ).toBeTruthy()
    expect(getFigureAsset).toHaveBeenCalledTimes(2)
  })
})
