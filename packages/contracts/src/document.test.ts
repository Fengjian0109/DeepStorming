import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_CHANNELS,
  createDocumentFromTextRequestSchema,
  documentDetailSchema,
  documentErrorCodeSchema,
  documentSummarySchema,
  listDocumentsRequestSchema,
} from './document'

const requestId = '00000000-0000-4000-8000-000000000001'

describe('document contracts', () => {
  it('defines explicit document IPC channels', () => {
    expect(DOCUMENT_CHANNELS).toEqual({
      list: 'documents:list',
      createFromText: 'documents:create-from-text',
      get: 'documents:get',
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

  it('does not expose full text or SQLite internals in summaries', () => {
    const parsed = documentSummarySchema.parse({
      id: requestId,
      documentType: 'generic',
      title: 'Notes',
      sourceKind: 'pasted_text',
      characterCount: 12,
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
    })
    expect(JSON.stringify(parsed)).not.toContain('plainText')
    expect(JSON.stringify(parsed)).not.toContain('contentHash')
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

  it('parses document error codes', () => {
    expect(documentErrorCodeSchema.options).toEqual([
      'DOCUMENT_VALIDATION_FAILED',
      'DOCUMENT_DUPLICATE',
      'DOCUMENT_NOT_FOUND',
      'DATABASE_UNAVAILABLE',
      'INTERNAL_ERROR',
    ])
  })

  it('validates list requests', () => {
    expect(listDocumentsRequestSchema.parse({ requestId })).toEqual({ requestId })
    expect(listDocumentsRequestSchema.safeParse({ requestId, extra: true }).success).toBe(false)
  })
})
