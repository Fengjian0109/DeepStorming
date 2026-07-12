import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DocumentUseCaseError } from '@deepstorming/application'

import { createDocumentIpcHandlers, type DocumentIpcDependencies } from './document-handlers'

const requestId = '00000000-0000-4000-8000-000000000001'
const documentId = '00000000-0000-4000-8000-000000000002'
const summary = {
  id: documentId,
  documentType: 'generic' as const,
  title: 'Notes',
  sourceKind: 'pasted_text' as const,
  characterCount: 4,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}
const searchResult = {
  documentId,
  documentType: 'generic' as const,
  title: 'Notes',
  sourceKind: 'pasted_text' as const,
  characterCount: 4,
  snippet: 'body',
  startOffset: 0,
  endOffset: 4,
  createdAt: '2026-07-11T00:00:00.000Z',
  updatedAt: '2026-07-11T00:00:00.000Z',
}
const importJob = {
  id: '00000000-0000-4000-8000-000000000101',
  documentId: documentId,
  sourceKind: 'pdf_file' as const,
  status: 'ready' as const,
  originalName: 'paper.pdf',
  fileSizeBytes: 1024,
  contentHash: 'a'.repeat(64),
  error: null,
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:01:00.000Z',
  finishedAt: '2026-07-12T00:01:00.000Z',
}
const page = {
  id: '00000000-0000-4000-8000-000000000201',
  documentId,
  pageNumber: 1,
  width: 612,
  height: 792,
  text: 'body',
  textHash: 'b'.repeat(64),
  createdAt: '2026-07-12T00:01:00.000Z',
}
const block = {
  id: '00000000-0000-4000-8000-000000000301',
  documentId,
  pageId: page.id,
  pageNumber: 1,
  blockIndex: 0,
  text: 'body',
  x: 10,
  y: 20,
  width: 100,
  height: 16,
  createdAt: '2026-07-12T00:01:00.000Z',
}

const dependencies = () => ({
  listDocuments: { execute: vi.fn().mockResolvedValue([summary]) },
  createDocumentFromText: { execute: vi.fn().mockResolvedValue(summary) },
  getDocument: { execute: vi.fn().mockResolvedValue({ ...summary, plainText: 'body' }) },
  searchDocuments: { execute: vi.fn().mockResolvedValue([searchResult]) },
  deleteDocument: { execute: vi.fn().mockResolvedValue(undefined) },
  importPdfDocument: { execute: vi.fn().mockResolvedValue(importJob) },
  getDocumentPages: { execute: vi.fn().mockResolvedValue([page]) },
  getDocumentPageBlocks: { execute: vi.fn().mockResolvedValue([block]) },
})

describe('document IPC handlers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists documents through one use case', async () => {
    const deps = dependencies()
    const result = await createDocumentIpcHandlers(deps as unknown as DocumentIpcDependencies).list(
      {
        requestId,
      },
    )

    expect(result).toEqual({ ok: true, data: [summary], requestId })
    expect(deps.listDocuments.execute).toHaveBeenCalledTimes(1)
  })

  it('searches documents through one use case', async () => {
    const deps = dependencies()
    const result = await createDocumentIpcHandlers(
      deps as unknown as DocumentIpcDependencies,
    ).search({
      requestId,
      query: 'body',
    })

    expect(result).toEqual({ ok: true, data: [searchResult], requestId })
    expect(deps.searchDocuments.execute).toHaveBeenCalledWith({ query: 'body' })
  })

  it('imports PDFs through one use case', async () => {
    const deps = dependencies()
    const result = await createDocumentIpcHandlers(
      deps as unknown as DocumentIpcDependencies,
    ).importPdf({
      requestId,
      filePath: '/tmp/paper.pdf',
      originalName: 'paper.pdf',
    })

    expect(result).toEqual({ ok: true, data: importJob, requestId })
    expect(deps.importPdfDocument.execute).toHaveBeenCalledWith({
      filePath: '/tmp/paper.pdf',
      originalName: 'paper.pdf',
    })
  })

  it('returns PDF pages and page blocks through explicit use cases', async () => {
    const deps = dependencies()
    const handlers = createDocumentIpcHandlers(deps as unknown as DocumentIpcDependencies)

    await expect(handlers.getPages({ requestId, documentId })).resolves.toEqual({
      ok: true,
      data: [page],
      requestId,
    })
    await expect(handlers.getPageBlocks({ requestId, documentId, pageNumber: 1 })).resolves.toEqual(
      {
        ok: true,
        data: [block],
        requestId,
      },
    )
    expect(deps.getDocumentPages.execute).toHaveBeenCalledWith(documentId)
    expect(deps.getDocumentPageBlocks.execute).toHaveBeenCalledWith({
      documentId,
      pageNumber: 1,
    })
  })

  it('strictly rejects malformed requests without calling use cases', async () => {
    const deps = dependencies()
    const result = await createDocumentIpcHandlers(
      deps as unknown as DocumentIpcDependencies,
    ).createFromText({
      requestId,
      document: { title: ' ', plainText: 'body', sourceKind: 'pasted_text' },
    })

    expect(result.ok).toBe(false)
    expect(deps.createDocumentFromText.execute).not.toHaveBeenCalled()
  })

  it('strictly rejects malformed search requests without calling use cases', async () => {
    const deps = dependencies()
    const result = await createDocumentIpcHandlers(
      deps as unknown as DocumentIpcDependencies,
    ).search({
      requestId,
      query: ' ',
    })

    expect(result.ok).toBe(false)
    expect(deps.searchDocuments.execute).not.toHaveBeenCalled()
  })

  it('maps DocumentUseCaseError safely', async () => {
    const deps = dependencies()
    deps.getDocument.execute.mockRejectedValueOnce(
      new DocumentUseCaseError('DOCUMENT_NOT_FOUND', 'The document was not found.', false),
    )

    const result = await createDocumentIpcHandlers(deps as unknown as DocumentIpcDependencies).get({
      requestId,
      id: documentId,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'DOCUMENT_NOT_FOUND',
        message: 'The document was not found.',
        retryable: false,
      },
      requestId,
    })
  })
})
