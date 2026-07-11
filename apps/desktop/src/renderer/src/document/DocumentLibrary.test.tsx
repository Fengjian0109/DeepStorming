// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DocumentLibrary } from './DocumentLibrary'

const document = {
  id: '00000000-0000-4000-8000-000000000001',
  documentType: 'generic' as const,
  title: 'Notes',
  sourceKind: 'pasted_text' as const,
  characterCount: 4,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

beforeEach(() => {
  vi.stubGlobal('deepstorming', {
    app: {
      getInfo: vi.fn(),
    },
    documents: {
      list: vi.fn().mockResolvedValue({ ok: true, data: [], requestId: crypto.randomUUID() }),
      createFromText: vi
        .fn()
        .mockResolvedValue({ ok: true, data: document, requestId: crypto.randomUUID() }),
      get: vi.fn().mockResolvedValue({
        ok: true,
        data: { ...document, plainText: 'body' },
        requestId: crypto.randomUUID(),
      }),
      remove: vi.fn().mockResolvedValue({ ok: true, data: {}, requestId: crypto.randomUUID() }),
    },
    provider: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      activate: vi.fn(),
      testConnection: vi.fn(),
      cancelTest: vi.fn(),
    },
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DocumentLibrary', () => {
  it('shows the empty document library state', async () => {
    render(<DocumentLibrary />)
    expect(await screen.findByText('还没有文档')).toBeTruthy()
  })

  it('creates a pasted text document and opens its detail', async () => {
    const user = userEvent.setup()
    render(<DocumentLibrary />)
    await user.click(await screen.findByRole('button', { name: '粘贴文本' }))
    await user.type(screen.getByLabelText('标题'), 'Notes')
    await user.type(screen.getByLabelText('正文'), 'body')
    await user.click(screen.getByRole('button', { name: '保存文档' }))

    expect(await screen.findByText('文档已创建。')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(window.deepstorming.documents.createFromText).toHaveBeenCalledWith({
      title: 'Notes',
      plainText: 'body',
      sourceKind: 'pasted_text',
    })
  })

  it('imports markdown file text without sending paths', async () => {
    const user = userEvent.setup()
    render(<DocumentLibrary />)
    const file = new File(['# Heading\nBody'], 'paper.md', { type: 'text/markdown' })
    await user.upload(await screen.findByLabelText('导入 .txt 或 .md'), file)
    await user.click(await screen.findByRole('button', { name: '保存文档' }))
    expect(window.deepstorming.documents.createFromText).toHaveBeenCalledWith({
      title: 'paper.md',
      plainText: '# Heading\nBody',
      sourceKind: 'text_file',
      originalFileName: 'paper.md',
    })
  })

  it('confirms deletion', async () => {
    window.deepstorming.documents.list = vi.fn().mockResolvedValue({
      ok: true,
      data: [document],
      requestId: crypto.randomUUID(),
    })
    const user = userEvent.setup()
    render(<DocumentLibrary />)
    await user.click(await screen.findByRole('button', { name: '删除 Notes' }))
    expect(await screen.findByRole('dialog', { name: '确认删除文档' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() =>
      expect(window.deepstorming.documents.remove).toHaveBeenCalledWith(document.id),
    )
  })
})
