import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_SOURCE_KINDS,
  DOCUMENT_TYPES,
  documentHashInput,
  normalizeDocumentDraft,
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
})
