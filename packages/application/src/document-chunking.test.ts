import { describe, expect, it } from 'vitest'
import { normalizeDocumentContextBudget, type DocumentChunk } from '@deepstorming/domain'
import {
  DEFAULT_CONTEXT_BUDGET,
  deriveDocumentChunks,
  selectBudgetedChunks,
} from './document-chunking'
import type { StoredDocumentTextBlock } from './document-ports'

const documentId = '00000000-0000-4000-8000-000000000101'

const fakeBlock = (
  overrides: Partial<StoredDocumentTextBlock> & Pick<StoredDocumentTextBlock, 'id' | 'text'>,
): StoredDocumentTextBlock => ({
  id: overrides.id,
  documentId,
  pageId: overrides.pageId ?? `page-${overrides.pageNumber ?? 1}`,
  pageNumber: overrides.pageNumber ?? 1,
  blockIndex: overrides.blockIndex ?? 0,
  text: overrides.text,
  createdAt: overrides.createdAt ?? '2026-07-13T00:00:00.000Z',
  ...(overrides.x === undefined ? {} : { x: overrides.x }),
  ...(overrides.y === undefined ? {} : { y: overrides.y }),
  ...(overrides.width === undefined ? {} : { width: overrides.width }),
  ...(overrides.height === undefined ? {} : { height: overrides.height }),
})

const fakeChunk = (
  overrides: Partial<DocumentChunk> & Pick<DocumentChunk, 'id' | 'charCount'>,
): DocumentChunk => ({
  id: overrides.id,
  documentId: overrides.documentId ?? documentId,
  pageNumberStart: overrides.pageNumberStart ?? 1,
  pageNumberEnd: overrides.pageNumberEnd ?? 1,
  blockIds: overrides.blockIds ?? ['p1-b1'],
  text: overrides.text ?? 'x'.repeat(overrides.charCount),
  charCount: overrides.charCount,
  sourceVersion: overrides.sourceVersion ?? 'text-version:v1',
  rebuildToken: overrides.rebuildToken ?? 'chunk-rule:v1',
})

describe('document chunking helpers', () => {
  it('derives chunks from adjacent blocks in natural page order', () => {
    const chunks = deriveDocumentChunks({
      documentId,
      blocks: [
        fakeBlock({ id: 'p1-b1', pageNumber: 1, blockIndex: 0, text: 'Alpha introduction.' }),
        fakeBlock({ id: 'p1-b2', pageNumber: 1, blockIndex: 1, text: 'Beta evidence extends.' }),
        fakeBlock({
          id: 'p2-b1',
          pageNumber: 2,
          blockIndex: 0,
          text: 'Gamma details close the example.',
        }),
      ],
      sourceVersion: 'text-version:v1',
      rebuildToken: 'chunk-rule:v1',
      maxCharactersPerChunk: 50,
      idForIndex: (index) => `chunk-${index}`,
    })

    expect(chunks).toEqual([
      {
        id: 'chunk-0',
        documentId,
        chunkIndex: 0,
        pageNumberStart: 1,
        pageNumberEnd: 1,
        blockIds: ['p1-b1', 'p1-b2'],
        text: 'Alpha introduction.\n\nBeta evidence extends.',
        charCount: 43,
        sourceVersion: 'text-version:v1',
        rebuildToken: 'chunk-rule:v1',
        createdAt: '2026-07-13T00:00:00.000Z',
      },
      {
        id: 'chunk-1',
        documentId,
        chunkIndex: 1,
        pageNumberStart: 2,
        pageNumberEnd: 2,
        blockIds: ['p2-b1'],
        text: 'Gamma details close the example.',
        charCount: 32,
        sourceVersion: 'text-version:v1',
        rebuildToken: 'chunk-rule:v1',
        createdAt: '2026-07-13T00:00:00.000Z',
      },
    ])
  })

  it('selects the top chunks under the shared context budget', () => {
    const selected = selectBudgetedChunks(
      [
        fakeChunk({ id: 'a', charCount: 900 }),
        fakeChunk({ id: 'b', charCount: 900 }),
        fakeChunk({ id: 'c', charCount: 900 }),
      ],
      normalizeDocumentContextBudget({ maxChunks: 2, maxCharacters: 2400 }),
    )

    expect(selected.map((chunk) => chunk.id)).toEqual(['a', 'b'])
    expect(DEFAULT_CONTEXT_BUDGET).toEqual({ maxChunks: 4, maxCharacters: 2400 })
  })
})
