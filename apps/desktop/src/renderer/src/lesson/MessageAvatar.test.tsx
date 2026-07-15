// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { MessageAvatar } from './MessageAvatar'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('loads a managed avatar through the explicit preload API', async () => {
  const assetId = `${'a'.repeat(64)}.png`
  const getAvatar = vi.fn().mockResolvedValue({
    ok: true,
    data: { assetId, mediaType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw==' },
    requestId: crypto.randomUUID(),
  })
  vi.stubGlobal('deepstorming', { learningSettings: { getAvatar } })

  render(<MessageAvatar name="林老师" assetId={assetId} />)

  const image = await screen.findByRole('img', { name: '林老师头像' })
  expect(image.getAttribute('src')).toBe('data:image/png;base64,iVBORw==')
  expect(getAvatar).toHaveBeenCalledWith(assetId)
})

it('shows a stable initial when no managed avatar is available', () => {
  vi.stubGlobal('deepstorming', { learningSettings: { getAvatar: vi.fn() } })
  render(<MessageAvatar name="学习者" />)

  expect(screen.getByLabelText('学习者头像').textContent).toBe('学')
})
