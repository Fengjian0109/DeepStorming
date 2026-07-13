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

const hash32 = (value: string, seed: number): number => {
  let hash = seed >>> 0
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const formatHex = (value: number): string => value.toString(16).padStart(8, '0')

const toDeterministicUuid = (value: string): string => {
  const hex = [
    formatHex(hash32(value, 0x811c9dc5)),
    formatHex(hash32(value, 0x9e3779b9)),
    formatHex(hash32(value, 0x85ebca6b)),
    formatHex(hash32(value, 0xc2b2ae35)),
  ].join('')

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

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
  idForChunk: (chunk: { chunkIndex: number; blockIds: readonly string[]; text: string }) => string
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
    const chunkIndex = chunks.length
    const blockIds = currentBlocks.map((block) => block.id)
    chunks.push({
      id: input.idForChunk({ chunkIndex, blockIds, text: currentText }),
      documentId: input.documentId,
      chunkIndex,
      pageNumberStart: firstBlock.pageNumber,
      pageNumberEnd: lastBlock.pageNumber,
      blockIds,
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

export const createDeterministicChunkId = (input: {
  documentId: string
  sourceVersion: string
  rebuildToken: string
  chunkIndex: number
  blockIds: readonly string[]
  text: string
}): string =>
  toDeterministicUuid(
    [
      input.documentId,
      input.sourceVersion,
      input.rebuildToken,
      String(input.chunkIndex),
      input.blockIds.join(','),
      input.text,
    ].join('|'),
  )

export const selectBudgetedChunks = (
  chunks: readonly DocumentChunk[],
  budget: DocumentContextBudget,
): readonly DocumentChunk[] => {
  const selected: DocumentChunk[] = []
  let total = 0
  for (const chunk of chunks) {
    if (selected.length >= budget.maxChunks) break
    if (total + chunk.charCount > budget.maxCharacters) continue
    selected.push(chunk)
    total += chunk.charCount
  }
  return selected
}

export const toDocumentChunks = (
  chunks: readonly StoredDocumentChunk[],
): readonly DocumentChunk[] => chunks.map(toDomainChunk)
