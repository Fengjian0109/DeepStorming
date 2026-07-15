// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DocumentPageDto, DocumentTextBlockDto } from '@deepstorming/contracts'
import { PdfReaderPanel } from './PdfReaderPanel'

const page: DocumentPageDto = {
  id: '00000000-0000-4000-8000-000000000201',
  documentId: '00000000-0000-4000-8000-000000000001',
  pageNumber: 1,
  width: 612,
  height: 792,
  text: 'Alpha evidence',
  textHash: 'a'.repeat(64),
  createdAt: '2026-07-12T00:00:00.000Z',
}
const block: DocumentTextBlockDto = {
  id: '00000000-0000-4000-8000-000000000301',
  documentId: page.documentId,
  pageId: page.id,
  pageNumber: 1,
  blockIndex: 0,
  text: 'Alpha evidence',
  createdAt: page.createdAt,
}

describe('PdfReaderPanel', () => {
  afterEach(cleanup)
  it('searches, selects, and starts a lesson from a matching block', async () => {
    const user = userEvent.setup()
    const onStartLesson = vi.fn()
    render(
      <PdfReaderPanel
        documentId={page.documentId}
        pages={[{ page, blocks: [block] }]}
        onStartLesson={onStartLesson}
      />,
    )

    await user.type(screen.getByLabelText('搜索 PDF 文本块'), 'evidence')
    expect(screen.getByText('Block 1 · Alpha evidence')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '选择 Block 1' }))
    await user.click(screen.getByRole('button', { name: '用此 block 开始课堂' }))

    expect(onStartLesson).toHaveBeenCalledWith({
      documentId: page.documentId,
      pageNumber: 1,
      blockId: block.id,
      blockIndex: 0,
      startOffset: 0,
      endOffset: 14,
      snippet: 'Alpha evidence',
    })
  })

  it('disables start when block text cannot be mapped to document text', async () => {
    const user = userEvent.setup()
    const unmatched = { ...block, text: 'Missing text' }
    render(
      <PdfReaderPanel
        documentId={page.documentId}
        pages={[{ page, blocks: [unmatched] }]}
        onStartLesson={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: '选择 Block 1' }))
    expect(screen.getByRole('button', { name: '用此 block 开始课堂' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(screen.getByText('证据文本不可定位')).toBeTruthy()
  })

  it('highlights and scrolls to a page-level figure source', () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    const secondPage = {
      ...page,
      id: '00000000-0000-4000-8000-000000000202',
      pageNumber: 2,
      text: 'Figure source',
    }

    render(
      <PdfReaderPanel
        documentId={page.documentId}
        pages={[
          { page, blocks: [block] },
          { page: secondPage, blocks: [] },
        ]}
        focusedPageNumber={2}
        onStartLesson={vi.fn()}
      />,
    )

    expect(screen.getByRole('article', { name: 'PDF 页面 2' }).className).toContain(
      'pdf-page-focused',
    )
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })
})
