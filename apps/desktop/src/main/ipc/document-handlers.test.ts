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

const dependencies = () => ({
  listDocuments: { execute: vi.fn().mockResolvedValue([summary]) },
  createDocumentFromText: { execute: vi.fn().mockResolvedValue(summary) },
  getDocument: { execute: vi.fn().mockResolvedValue({ ...summary, plainText: 'body' }) },
  deleteDocument: { execute: vi.fn().mockResolvedValue(undefined) },
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
