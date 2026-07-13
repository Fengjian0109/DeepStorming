import {
  normalizeDocumentChunk,
  normalizeDocumentContextBudget,
  type DocumentChunk,
  type DocumentContextBudget,
} from '@deepstorming/domain'
import type { StoredDocumentChunk, StoredDocumentTextBlock } from './document-ports'

export const DEFAULT_CONTEXT_BUDGET = normalizeDocumentContextBudget({
  maxChunks: 4,
  maxCharacters: 2400,
})

export const DEFAULT_MAX_CHUNK_CHARACTERS = 1200
export const DOCUMENT_CHUNK_REBUILD_TOKEN = 'chunk-rule:v1'

const normalizeBlockText = (text: string): string => text.trim()

const compareBlocks = (left: StoredDocumentTextBlock, right: StoredDocumentTextBlock): number =>
  left.pageNumber - right.pageNumber ||
  left.blockIndex - right.blockIndex ||
  left.id.localeCompare(right.id)

const toDomainChunk = (chunk: StoredDocumentChunk): DocumentChunk =>
  normalizeDocumentChunk({
    id: chunk.id,
    documentId: chunk.documentId,
    pageNumberStart: chunk.pageNumberStart,
    pageNumberEnd: chunk.pageNumberEnd,
    blockIds: chunk.blockIds,
    text: chunk.text,
    charCount: chunk.charCount,
    sourceVersion: chunk.sourceVersion,
    rebuildToken: chunk.rebuildToken,
  })

export const deriveDocumentChunks = (input: {
  documentId: string
  blocks: readonly StoredDocumentTextBlock[]
  sourceVersion: string
  rebuildToken: string
  idForIndex: (index: number) => string
  maxCharactersPerChunk?: number
}): readonly StoredDocumentChunk[] => {
  const maxCharactersPerChunk = input.maxCharactersPerChunk ?? DEFAULT_MAX_CHUNK_CHARACTERS
  const orderedBlocks = [...input.blocks]
    .map((block) => ({ ...block, text: normalizeBlockText(block.text) }))
    .filter((block) => block.text.length > 0)
    .sort(compareBlocks)

  const chunks: StoredDocumentChunk[] = []
  let currentBlocks: StoredDocumentTextBlock[] = []
  let currentText = ''

  const flush = (): void => {
    if (currentBlocks.length === 0) return
    const firstBlock = currentBlocks[0]!
    const lastBlock = currentBlocks[currentBlocks.length - 1]!
    chunks.push({
      id: input.idForIndex(chunks.length),
      documentId: input.documentId,
      chunkIndex: chunks.length,
      pageNumberStart: firstBlock.pageNumber,
      pageNumberEnd: lastBlock.pageNumber,
      blockIds: currentBlocks.map((block) => block.id),
      text: currentText,
      charCount: [...currentText].length,
      sourceVersion: input.sourceVersion,
      rebuildToken: input.rebuildToken,
      createdAt: firstBlock.createdAt,
    })
    currentBlocks = []
    currentText = ''
  }

  for (const block of orderedBlocks) {
    const nextText = currentText.length === 0 ? block.text : `${currentText}\n\n${block.text}`
    if (currentBlocks.length > 0 && [...nextText].length > maxCharactersPerChunk) {
      flush()
    }
    currentBlocks.push(block)
    currentText = currentText.length === 0 ? block.text : `${currentText}\n\n${block.text}`
  }

  flush()
  return chunks
}

export const selectBudgetedChunks = (
  chunks: readonly DocumentChunk[],
  budget: DocumentContextBudget,
): readonly DocumentChunk[] => {
  const selected: DocumentChunk[] = []
  let total = 0
  for (const chunk of chunks) {
    if (selected.length >= budget.maxChunks) break
    if (total + chunk.charCount > budget.maxCharacters) break
    selected.push(chunk)
    total += chunk.charCount
  }
  return selected
}

export const toDocumentChunks = (
  chunks: readonly StoredDocumentChunk[],
): readonly DocumentChunk[] => chunks.map(toDomainChunk)
