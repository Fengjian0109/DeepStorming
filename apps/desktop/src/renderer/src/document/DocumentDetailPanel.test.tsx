// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DocumentDetailPanel } from './DocumentDetailPanel'

const longBody = '开'.repeat(400) + '完整正文末尾'
const documentDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  documentType: 'paper' as const,
  title: 'Understanding Deep Learning',
  sourceKind: 'text_file' as const,
  originalFileName: 'udl.pdf',
  characterCount: longBody.length,
  plainText: longBody,
  contentHash: 'a'.repeat(64),
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

afterEach(cleanup)

describe('DocumentDetailPanel', () => {
  it('shows compact metadata and a capped preview instead of the full body', () => {
    render(
      <DocumentDetailPanel
        document={documentDetail}
        busy={false}
        readerOpen={false}
        onStartLesson={vi.fn()}
        onOpenReader={vi.fn()}
        onCloseReader={vi.fn()}
        onDelete={vi.fn()}
        reader={null}
      />,
    )

    expect(screen.getByRole('heading', { name: documentDetail.title })).toBeTruthy()
    expect(screen.getByText('论文 · ' + documentDetail.characterCount + ' 字符')).toBeTruthy()
    expect(screen.getByText('udl.pdf')).toBeTruthy()
    expect(screen.queryByText(longBody)).toBeNull()
    const preview = screen.getByTestId('document-preview').textContent ?? ''
    expect(preview.endsWith('…')).toBe(true)
    expect(preview.length).toBe(321)
  })

  it('exposes lesson, reader, and delete actions', async () => {
    const user = userEvent.setup()
    const onStartLesson = vi.fn()
    const onOpenReader = vi.fn()
    const onDelete = vi.fn()
    render(
      <DocumentDetailPanel
        document={documentDetail}
        busy={false}
        readerOpen={false}
        onStartLesson={onStartLesson}
        onOpenReader={onOpenReader}
        onCloseReader={vi.fn()}
        onDelete={onDelete}
        reader={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: '开始课堂' }))
    await user.click(screen.getByRole('button', { name: '打开阅读器' }))
    await user.click(screen.getByRole('button', { name: '删除文档' }))

    expect(onStartLesson).toHaveBeenCalledTimes(1)
    expect(onOpenReader).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('renders and closes the explicit reader without unmounting document metadata', async () => {
    const user = userEvent.setup()
    const Harness = () => {
      const [readerOpen, setReaderOpen] = useState(false)
      return (
        <DocumentDetailPanel
          document={documentDetail}
          busy={false}
          readerOpen={readerOpen}
          onStartLesson={vi.fn()}
          onOpenReader={() => setReaderOpen(true)}
          onCloseReader={() => setReaderOpen(false)}
          onDelete={vi.fn()}
          reader={<p>完整阅读内容</p>}
        />
      )
    }
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '打开阅读器' }))
    expect(screen.getByText('完整阅读内容')).toBeTruthy()
    expect(screen.getByRole('heading', { name: documentDetail.title })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '关闭阅读器' }))
    expect(screen.queryByText('完整阅读内容')).toBeNull()
  })
})
