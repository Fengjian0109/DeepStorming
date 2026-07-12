import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_SOURCE_KINDS,
  DOCUMENT_TYPES,
  countDocumentCharacters,
  documentHashInput,
  normalizeDocumentChunk,
  normalizeDocumentContextBudget,
  normalizeDocumentDraft,
  normalizeDocumentImportJob,
} from './document'

describe('document domain', () => {
  it('normalizes a pasted generic document draft', () => {
    expect(
      normalizeDocumentDraft({
        title: '  Linear Algebra Notes  ',
        plainText: '  Vectors preserve direction.  ',
        sourceKind: 'pasted_text',
      }),
    ).toEqual({
      documentType: 'generic',
      title: 'Linear Algebra Notes',
      plainText: 'Vectors preserve direction.',
      sourceKind: 'pasted_text',
    })
  })

  it('keeps a text file name without accepting a local path', () => {
    expect(
      normalizeDocumentDraft({
        title: 'Paper notes',
        plainText: 'Claim\nEvidence',
        sourceKind: 'text_file',
        originalFileName: '/Users/me/secret/paper.md',
      }),
    ).toMatchObject({
      originalFileName: 'paper.md',
      plainText: 'Claim\nEvidence',
    })
  })

  it('rejects blank titles and blank text', () => {
    expect(() =>
      normalizeDocumentDraft({ title: ' ', plainText: 'content', sourceKind: 'pasted_text' }),
    ).toThrow('Document title must not be blank')
    expect(() =>
      normalizeDocumentDraft({ title: 'Title', plainText: ' \n ', sourceKind: 'pasted_text' }),
    ).toThrow('Document text must not be blank')
  })

  it('defines the accepted document types and source kinds', () => {
    expect(DOCUMENT_TYPES).toEqual(['generic', 'textbook', 'paper'])
    expect(DOCUMENT_SOURCE_KINDS).toEqual(['pasted_text', 'text_file'])
  })

  it('uses normalized plain text as the stable hash input', () => {
    const first = normalizeDocumentDraft({
      title: 'A',
      plainText: '  same text\n',
      sourceKind: 'pasted_text',
    })
    const second = normalizeDocumentDraft({
      title: 'B',
      plainText: 'same text',
      sourceKind: 'text_file',
      originalFileName: 'notes.md',
    })

    expect(documentHashInput(first)).toBe('same text')
    expect(documentHashInput(second)).toBe('same text')
  })

  it('normalizes line endings so equivalent text hashes the same way', () => {
    const pasted = normalizeDocumentDraft({
      title: 'Pasted',
      plainText: 'Line 1\rLine 2\r\nLine 3\n',
      sourceKind: 'pasted_text',
    })
    const file = normalizeDocumentDraft({
      title: 'File',
      plainText: 'Line 1\nLine 2\nLine 3',
      sourceKind: 'text_file',
      originalFileName: 'notes.txt',
    })

    expect(pasted.plainText).toBe('Line 1\nLine 2\nLine 3')
    expect(file.plainText).toBe('Line 1\nLine 2\nLine 3')
    expect(documentHashInput(pasted)).toBe(documentHashInput(file))
    expect(countDocumentCharacters(pasted.plainText)).toBe(countDocumentCharacters(file.plainText))
  })

  it('rejects an invalid source kind at runtime', () => {
    expect(() =>
      normalizeDocumentDraft({
        title: 'Title',
        plainText: 'content',
        sourceKind: 'clipboard' as never,
      }),
    ).toThrow('Document source kind is invalid')
  })

  it('rejects an invalid document type at runtime', () => {
    expect(() =>
      normalizeDocumentDraft({
        title: 'Title',
        plainText: 'content',
        sourceKind: 'pasted_text',
        documentType: 'notes' as never,
      }),
    ).toThrow('Document type is invalid')
  })

  it('normalizes PDF import jobs and rejects unsafe states', () => {
    expect(
      normalizeDocumentImportJob({
        id: '00000000-0000-4000-8000-000000000801',
        documentId: null,
        sourceKind: 'pdf_file',
        status: 'queued',
        originalName: '/Users/me/private/paper.pdf',
        fileSizeBytes: 1024,
        contentHash: 'a'.repeat(64),
        error: null,
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
        finishedAt: null,
      }),
    ).toMatchObject({ status: 'queued', originalName: 'paper.pdf' })

    expect(() =>
      normalizeDocumentImportJob({
        id: 'bad',
        documentId: null,
        sourceKind: 'pdf_file',
        status: 'ready',
        originalName: 'paper.pdf',
        fileSizeBytes: -1,
        contentHash: 'bad',
        error: null,
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
        finishedAt: null,
      }),
    ).toThrow()
  })

  it('normalizes document chunks and rejects invalid ranges', () => {
    expect(
      normalizeDocumentChunk({
        id: '00000000-0000-4000-8000-000000000901',
        documentId: '00000000-0000-4000-8000-000000000902',
        pageNumberStart: 1,
        pageNumberEnd: 2,
        blockIds: ['p1-b1', 'p2-b1'],
        text: '  chunk text  ',
        charCount: 10,
        sourceVersion: 'page-text:v1',
        rebuildToken: 'chunk-rule:v1',
      }),
    ).toEqual({
      id: '00000000-0000-4000-8000-000000000901',
      documentId: '00000000-0000-4000-8000-000000000902',
      pageNumberStart: 1,
      pageNumberEnd: 2,
      blockIds: ['p1-b1', 'p2-b1'],
      text: 'chunk text',
      charCount: 10,
      sourceVersion: 'page-text:v1',
      rebuildToken: 'chunk-rule:v1',
    })

    expect(() =>
      normalizeDocumentChunk({
        id: '00000000-0000-4000-8000-000000000901',
        documentId: '00000000-0000-4000-8000-000000000902',
        pageNumberStart: 2,
        pageNumberEnd: 1,
        blockIds: ['p2-b1'],
        text: 'chunk text',
        charCount: 10,
        sourceVersion: 'page-text:v1',
        rebuildToken: 'chunk-rule:v1',
      }),
    ).toThrow('Document chunk page range is invalid')
  })

  it('normalizes document context budgets and rejects invalid chunk limits', () => {
    expect(normalizeDocumentContextBudget({ maxChunks: 4, maxCharacters: 2400 })).toEqual({
      maxChunks: 4,
      maxCharacters: 2400,
    })

    expect(() =>
      normalizeDocumentContextBudget({ maxChunks: 0, maxCharacters: 2400 }),
    ).toThrow('Document context chunk budget is invalid')
  })
})
