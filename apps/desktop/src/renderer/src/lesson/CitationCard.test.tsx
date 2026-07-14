// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CitationCard } from './CitationCard'

afterEach(() => cleanup())

describe('CitationCard', () => {
  it('emphasizes the verified quote, page range, rationale, and source action', async () => {
    const onReturnToSource = vi.fn()
    render(
      <CitationCard
        citation={{
          chunkId: 'chunk-1',
          quote: '注意力权重之和为 1。',
          rationale: '这是归一化结论的直接证据。',
          pageNumberStart: 4,
          pageNumberEnd: 5,
        }}
        onReturnToSource={onReturnToSource}
      />,
    )

    expect(screen.getByText('“注意力权重之和为 1。”')).toBeTruthy()
    expect(screen.getByText('第 4–5 页')).toBeTruthy()
    expect(screen.getByText('这是归一化结论的直接证据。')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '回到来源' }))
    expect(onReturnToSource).toHaveBeenCalledOnce()
  })
})
