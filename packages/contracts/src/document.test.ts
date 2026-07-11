import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_CHANNELS,
  createDocumentFromTextRequestSchema,
  documentDetailSchema,
  documentErrorCodeSchema,
  documentBusinessErrorCodeSchema,
  documentSearchResultSchema,
  documentSummaryResultSchema,
  documentSummarySchema,
  listDocumentsRequestSchema,
  searchDocumentsRequestSchema,
  searchDocumentsResultSchema,
} from './document'

const requestId = '00000000-0000-4000-8000-000000000001'

describe('document contracts', () => {
  it('defines explicit document IPC channels', () => {
    expect(DOCUMENT_CHANNELS).toEqual({
      list: 'documents:list',
      createFromText: 'documents:create-from-text',
      get: 'documents:get',
      search: 'documents:search',
      remove: 'documents:remove',
    })
  })

  it('strictly validates create-from-text requests', () => {
    expect(
      createDocumentFromTextRequestSchema.safeParse({
        requestId,
        document: {
          title: 'Notes',
          plainText: 'A useful explanation',
          sourceKind: 'text_file',
          originalFileName: 'notes.md',
        },
      }).success,
    ).toBe(true)

    expect(
      createDocumentFromTextRequestSchema.safeParse({
        requestId,
        document: { title: ' ', plainText: 'content', sourceKind: 'pasted_text' },
      }).success,
    ).toBe(false)
    expect(
      createDocumentFromTextRequestSchema.safeParse({
        requestId,
        document: { title: 'Notes', plainText: ' ', sourceKind: 'pasted_text' },
      }).success,
    ).toBe(false)
    expect(
      createDocumentFromTextRequestSchema.safeParse({
        requestId,
        document: { title: 'Notes', plainText: 'content', sourceKind: 'pasted_text' },
        extra: true,
      }).success,
    ).toBe(false)
  })

  it('rejects full text and SQLite internals on summaries', () => {
    expect(
      documentSummarySchema.safeParse({
        id: requestId,
        documentType: 'generic',
        title: 'Notes',
        sourceKind: 'pasted_text',
        characterCount: 12,
        plainText: 'detail text',
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z',
      }).success,
    ).toBe(false)

    expect(
      documentSummarySchema.safeParse({
        id: requestId,
        documentType: 'generic',
        title: 'Notes',
        sourceKind: 'pasted_text',
        characterCount: 12,
        contentHash: 'abc123',
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z',
      }).success,
    ).toBe(false)
  })

  it('exposes plain text only on detail DTOs', () => {
    expect(
      documentDetailSchema.safeParse({
        id: requestId,
        documentType: 'generic',
        title: 'Notes',
        sourceKind: 'pasted_text',
        characterCount: 12,
        plainText: 'detail text',
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z',
      }).success,
    ).toBe(true)
  })

  it('parses document business error codes', () => {
    expect(documentBusinessErrorCodeSchema.options).toEqual([
      'DOCUMENT_VALIDATION_FAILED',
      'DOCUMENT_DUPLICATE',
      'DOCUMENT_NOT_FOUND',
    ])
  })

  it('accepts shared and document-specific error codes on document results', () => {
    expect(documentErrorCodeSchema.safeParse('INVALID_REQUEST').success).toBe(true)
    expect(documentErrorCodeSchema.safeParse('IPC_RESPONSE_INVALID').success).toBe(true)
    expect(documentErrorCodeSchema.safeParse('DATABASE_UNAVAILABLE').success).toBe(true)
    expect(documentErrorCodeSchema.safeParse('INTERNAL_ERROR').success).toBe(true)
    expect(documentErrorCodeSchema.safeParse('DOCUMENT_NOT_FOUND').success).toBe(true)
    expect(documentErrorCodeSchema.safeParse('PROVIDER_AUTH_FAILED').success).toBe(false)
    expect(documentErrorCodeSchema.safeParse('SECRET_WRITE_FAILED').success).toBe(false)

    expect(
      documentSummaryResultSchema.safeParse({
        ok: false,
        requestId,
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Missing',
          retryable: false,
        },
      }).success,
    ).toBe(true)

    expect(documentBusinessErrorCodeSchema.safeParse('DATABASE_UNAVAILABLE').success).toBe(false)
    expect(documentBusinessErrorCodeSchema.safeParse('INTERNAL_ERROR').success).toBe(false)
  })

  it('validates list requests', () => {
    expect(listDocumentsRequestSchema.parse({ requestId })).toEqual({ requestId })
    expect(listDocumentsRequestSchema.safeParse({ requestId, extra: true }).success).toBe(false)
  })

  it('strictly validates search requests', () => {
    expect(searchDocumentsRequestSchema.parse({ requestId, query: ' retrieval ' })).toEqual({
      requestId,
      query: ' retrieval ',
    })
    expect(searchDocumentsRequestSchema.safeParse({ requestId, query: '   ' }).success).toBe(false)
    expect(
      searchDocumentsRequestSchema.safeParse({ requestId, query: 'x', extra: true }).success,
    ).toBe(false)
  })

  it('returns bounded search snippets and source offsets', () => {
    expect(
      documentSearchResultSchema.safeParse({
        documentId: requestId,
        title: 'Notes',
        documentType: 'generic',
        sourceKind: 'pasted_text',
        characterCount: 42,
        snippet: 'Evidence around the matched term.',
        startOffset: 12,
        endOffset: 19,
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z',
      }).success,
    ).toBe(true)

    expect(
      documentSearchResultSchema.safeParse({
        documentId: requestId,
        title: 'Notes',
        documentType: 'generic',
        sourceKind: 'pasted_text',
        characterCount: 42,
        snippet: 'Evidence',
        plainText: 'full text',
        startOffset: 0,
        endOffset: 8,
        createdAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z',
      }).success,
    ).toBe(false)

    expect(
      searchDocumentsResultSchema.safeParse({
        ok: true,
        data: [
          {
            documentId: requestId,
            title: 'Notes',
            documentType: 'generic',
            sourceKind: 'pasted_text',
            characterCount: 42,
            snippet: 'Evidence',
            startOffset: 0,
            endOffset: 8,
            createdAt: '2026-07-11T00:00:00.000Z',
            updatedAt: '2026-07-11T00:00:00.000Z',
          },
        ],
        requestId,
      }).success,
    ).toBe(true)
  })
})
