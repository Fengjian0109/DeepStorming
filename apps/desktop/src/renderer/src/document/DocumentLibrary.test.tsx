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

const documentTwo = {
  id: '00000000-0000-4000-8000-000000000002',
  documentType: 'generic' as const,
  title: 'Draft 2',
  sourceKind: 'pasted_text' as const,
  characterCount: 6,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

const lessonSession = {
  id: '00000000-0000-4000-8000-000000000101',
  title: 'Notes 课堂',
  status: 'active' as const,
  documentId: document.id,
  documentTitle: document.title,
  sourceAnchors: [
    {
      id: '00000000-0000-4000-8000-000000000301',
      documentId: document.id,
      startOffset: 0,
      endOffset: 4,
      snippet: 'body',
    },
  ],
  messages: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      lessonId: '00000000-0000-4000-8000-000000000101',
      modelRunId: '00000000-0000-4000-8000-000000000501',
      role: 'tutor' as const,
      content: '我们先从《Notes》的这段证据开始：body\n\n你觉得它想解决的核心问题是什么？',
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      promptVersion: 'mock-tutor-v1',
      createdAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  modelRuns: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      lessonId: '00000000-0000-4000-8000-000000000101',
      providerId: null,
      modelName: 'mock-local',
      operation: 'lesson_tutor_first_question' as const,
      status: 'succeeded' as const,
      promptManifest: {
        key: 'lesson.mockTutor.firstQuestion',
        version: 1,
        hash: 'sha256:035f771a5bb55108ad6e123a24d980c302bea46a6976322fefc7f5e81f6525ff',
      },
      inputSummary: {
        documentId: document.id,
        documentTitle: document.title,
        sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
        sourceCharacterRange: { startOffset: 0, endOffset: 4 },
        snippetCharacterCount: 4,
      },
      sourceAnchorIds: ['00000000-0000-4000-8000-000000000301'],
      outputMessageId: '00000000-0000-4000-8000-000000000401',
      errorSummary: null,
      startedAt: '2026-07-11T00:00:00.000Z',
      finishedAt: '2026-07-11T00:00:00.000Z',
    },
  ],
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, resolve, reject }
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
      search: vi.fn().mockResolvedValue({ ok: true, data: [], requestId: crypto.randomUUID() }),
      remove: vi.fn().mockResolvedValue({ ok: true, data: {}, requestId: crypto.randomUUID() }),
      importPdf: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          id: '00000000-0000-4000-8000-000000000901',
          documentId: document.id,
          sourceKind: 'pdf_file',
          status: 'ready',
          originalName: 'paper.pdf',
          fileSizeBytes: 1024,
          contentHash: 'a'.repeat(64),
          error: null,
          createdAt: '2026-07-12T00:00:00.000Z',
          updatedAt: '2026-07-12T00:01:00.000Z',
          finishedAt: '2026-07-12T00:01:00.000Z',
        },
        requestId: crypto.randomUUID(),
      }),
      getPages: vi.fn().mockResolvedValue({ ok: true, data: [], requestId: crypto.randomUUID() }),
      getPageBlocks: vi
        .fn()
        .mockResolvedValue({ ok: true, data: [], requestId: crypto.randomUUID() }),
    },
    lessons: {
      list: vi.fn().mockResolvedValue({ ok: true, data: [], requestId: crypto.randomUUID() }),
      startFromDocument: vi
        .fn()
        .mockResolvedValue({ ok: true, data: lessonSession, requestId: crypto.randomUUID() }),
      get: vi.fn(),
      reply: vi.fn(),
      retryRun: vi.fn(),
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

  it('imports a PDF and opens the ready document detail', async () => {
    const user = userEvent.setup()
    const pdfDocument = { ...document, id: '00000000-0000-4000-8000-000000000991', title: 'paper' }
    window.deepstorming.documents.importPdf = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        id: '00000000-0000-4000-8000-000000000901',
        documentId: pdfDocument.id,
        sourceKind: 'pdf_file',
        status: 'ready',
        originalName: 'paper.pdf',
        fileSizeBytes: 1024,
        contentHash: 'a'.repeat(64),
        error: null,
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:01:00.000Z',
        finishedAt: '2026-07-12T00:01:00.000Z',
      },
      requestId: crypto.randomUUID(),
    })
    window.deepstorming.documents.get = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        ...pdfDocument,
        sourceKind: 'text_file',
        originalFileName: 'paper.pdf',
        plainText: 'PDF body',
      },
      requestId: crypto.randomUUID(),
    })

    render(<DocumentLibrary />)
    const file = new File(['%PDF'], 'paper.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'path', { value: '/tmp/paper.pdf' })
    await user.upload(await screen.findByLabelText('导入 PDF'), file)

    expect(await screen.findByText('PDF 已导入。')).toBeTruthy()
    expect(window.deepstorming.documents.importPdf).toHaveBeenCalledWith({
      filePath: '/tmp/paper.pdf',
      originalName: 'paper.pdf',
    })
    expect(await screen.findByRole('heading', { name: 'paper' })).toBeTruthy()
    expect(await screen.findByText('PDF body')).toBeTruthy()
  })

  it('shows a safe PDF import error', async () => {
    const user = userEvent.setup()
    window.deepstorming.documents.importPdf = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        id: '00000000-0000-4000-8000-000000000901',
        documentId: null,
        sourceKind: 'pdf_file',
        status: 'failed',
        originalName: 'locked.pdf',
        fileSizeBytes: 1024,
        contentHash: 'a'.repeat(64),
        error: {
          code: 'DOCUMENT_PDF_PASSWORD_PROTECTED',
          message: 'The PDF is password protected.',
          retryable: false,
        },
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:01:00.000Z',
        finishedAt: '2026-07-12T00:01:00.000Z',
      },
      requestId: crypto.randomUUID(),
    })

    render(<DocumentLibrary />)
    const file = new File(['%PDF'], 'locked.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'path', { value: '/tmp/locked.pdf' })
    await user.upload(await screen.findByLabelText('导入 PDF'), file)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'The PDF is password protected.',
    )
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

  it('preserves the draft when save fails', async () => {
    window.deepstorming.documents.createFromText = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '文档保存失败。', retryable: true },
      requestId: crypto.randomUUID(),
    })

    const user = userEvent.setup()
    render(<DocumentLibrary />)

    await user.type(screen.getByLabelText('标题'), 'Broken Notes')
    await user.type(screen.getByLabelText('正文'), 'draft body')
    await user.click(screen.getByRole('button', { name: '保存文档' }))

    expect((await screen.findByRole('alert')).textContent).toContain('文档保存失败。')
    expect(screen.getByLabelText('标题')).toHaveProperty('value', 'Broken Notes')
    expect(screen.getByLabelText('正文')).toHaveProperty('value', 'draft body')
  })

  it('does not show stale detail content while a new selection is loading or after that request fails', async () => {
    const firstDetail = deferred<{
      ok: true
      data: typeof document & { plainText: string }
      requestId: string
    }>()
    const secondDetail = deferred<
      | { ok: true; data: typeof documentTwo & { plainText: string }; requestId: string }
      | {
          ok: false
          error: { code: 'INTERNAL_ERROR'; message: string; retryable: true }
          requestId: string
        }
    >()

    window.deepstorming.documents.list = vi.fn().mockResolvedValue({
      ok: true,
      data: [document, documentTwo],
      requestId: crypto.randomUUID(),
    })
    window.deepstorming.documents.get = vi
      .fn()
      .mockReturnValueOnce(firstDetail.promise)
      .mockReturnValueOnce(secondDetail.promise)

    const user = userEvent.setup()
    render(<DocumentLibrary />)

    await user.click((await screen.findAllByRole('button', { name: '查看详情' }))[0]!)
    firstDetail.resolve({
      ok: true,
      data: { ...document, plainText: 'first body' },
      requestId: crypto.randomUUID(),
    })

    expect(await screen.findByText('first body')).toBeTruthy()

    await user.click((await screen.findAllByRole('button', { name: '查看详情' }))[1]!)

    await waitFor(() => expect(screen.queryByText('first body')).toBeNull())
    expect(screen.getByText('正在加载文档详情…')).toBeTruthy()

    secondDetail.resolve({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '文档详情加载失败。', retryable: true },
      requestId: crypto.randomUUID(),
    })

    expect((await screen.findByRole('alert')).textContent).toContain('文档详情加载失败。')
    expect(screen.queryByText('first body')).toBeNull()
    expect(screen.getByText('选择一篇文档后可查看正文。')).toBeTruthy()
  })

  it('shows a stable error when file reading fails', async () => {
    const user = userEvent.setup()
    render(<DocumentLibrary />)

    const file = new File(['broken'], 'broken.md', { type: 'text/markdown' })
    Object.defineProperty(file, 'text', {
      value: vi.fn().mockRejectedValue(new Error('read failed')),
    })

    await user.upload(screen.getByLabelText('导入 .txt 或 .md'), file)

    expect((await screen.findByRole('alert')).textContent).toContain('读取文件失败，请重试。')
    expect(window.deepstorming.documents.createFromText).not.toHaveBeenCalled()
  })

  it('searches document snippets and opens the selected result', async () => {
    window.deepstorming.documents.search = vi.fn().mockResolvedValue({
      ok: true,
      data: [
        {
          documentId: document.id,
          documentType: 'generic',
          title: 'Notes',
          sourceKind: 'pasted_text',
          characterCount: 4,
          snippet: 'The gamma concept appears here.',
          startOffset: 4,
          endOffset: 9,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
        },
      ],
      requestId: crypto.randomUUID(),
    })

    const user = userEvent.setup()
    render(<DocumentLibrary />)

    await user.type(await screen.findByLabelText('搜索文档内容'), 'gamma')
    await user.click(screen.getByRole('button', { name: '搜索内容' }))

    expect(window.deepstorming.documents.search).toHaveBeenCalledWith('gamma')
    expect(await screen.findByText('The gamma concept appears here.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '打开 Notes' }))
    await waitFor(() => expect(window.deepstorming.documents.get).toHaveBeenCalledWith(document.id))
  })

  it('starts a lesson from the selected document detail', async () => {
    const onLessonStarted = vi.fn()
    const user = userEvent.setup()
    render(<DocumentLibrary onLessonStarted={onLessonStarted} />)

    await user.click(await screen.findByRole('button', { name: '粘贴文本' }))
    await user.type(screen.getByLabelText('标题'), 'Notes')
    await user.type(screen.getByLabelText('正文'), 'body')
    await user.click(screen.getByRole('button', { name: '保存文档' }))

    await user.click(await screen.findByRole('button', { name: '开始课堂' }))

    expect(window.deepstorming.lessons.startFromDocument).toHaveBeenCalledWith({
      documentId: document.id,
      documentTitle: 'Notes',
      source: {
        startOffset: 0,
        endOffset: 4,
        snippet: 'body',
      },
    })
    expect(await screen.findByText('课堂已创建。')).toBeTruthy()
    expect(onLessonStarted).toHaveBeenCalledWith(lessonSession.id)
  })
})
