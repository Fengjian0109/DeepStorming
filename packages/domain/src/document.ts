export const DOCUMENT_TYPES = ['generic', 'textbook', 'paper'] as const
export const DOCUMENT_SOURCE_KINDS = ['pasted_text', 'text_file'] as const
export const DOCUMENT_IMPORT_STATUSES = [
  'queued',
  'copying',
  'parsing',
  'ready',
  'failed',
  'cancelled',
] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]
export type DocumentSourceKind = (typeof DOCUMENT_SOURCE_KINDS)[number]
export type DocumentImportStatus = (typeof DOCUMENT_IMPORT_STATUSES)[number]

export type DocumentDraft = Readonly<{
  title: string
  plainText: string
  sourceKind: DocumentSourceKind
  documentType?: DocumentType
  originalFileName?: string
}>

export type NormalizedDocumentDraft = Readonly<{
  title: string
  plainText: string
  sourceKind: DocumentSourceKind
  documentType: DocumentType
  originalFileName?: string
}>

export type LearningDocument = Readonly<{
  id: string
  documentType: DocumentType
  title: string
  sourceKind: DocumentSourceKind
  originalFileName?: string
  characterCount: number
  createdAt: string
  updatedAt: string
}>

export type DocumentTextVersion = Readonly<{
  id: string
  documentId: string
  plainText: string
  characterCount: number
  createdAt: string
}>

export type DocumentChunk = Readonly<{
  id: string
  documentId: string
  pageNumberStart: number
  pageNumberEnd: number
  blockIds: readonly string[]
  text: string
  charCount: number
  sourceVersion: string
  rebuildToken: string
}>

export type DocumentContextBudget = Readonly<{
  maxChunks: number
  maxCharacters: number
}>

export type DocumentImportError = Readonly<{
  code: string
  message: string
  retryable: boolean
}>

export type DocumentImportJob = Readonly<{
  id: string
  documentId: string | null
  sourceKind: 'pdf_file'
  status: DocumentImportStatus
  originalName: string
  fileSizeBytes: number
  contentHash: string
  error: DocumentImportError | null
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}>

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu
const SHA_256 = /^[\da-f]{64}$/iu

const normalizeNonBlank = (value: string, message: string): string => {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(message)
  return normalized
}

const normalizeLineEndings = (value: string): string => value.replace(/\r\n?/gu, '\n')

const normalizeFileName = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  const normalized = trimmed.split(/[\\/]/u).filter(Boolean).at(-1) ?? ''
  return normalized.length > 0 ? normalized : undefined
}

export const normalizeDocumentDraft = (draft: DocumentDraft): NormalizedDocumentDraft => {
  if (!DOCUMENT_SOURCE_KINDS.includes(draft.sourceKind))
    throw new Error('Document source kind is invalid')
  if (draft.documentType !== undefined && !DOCUMENT_TYPES.includes(draft.documentType))
    throw new Error('Document type is invalid')
  const originalFileName = normalizeFileName(draft.originalFileName)
  const normalizedPlainText = normalizeNonBlank(
    normalizeLineEndings(draft.plainText),
    'Document text must not be blank',
  )

  return {
    documentType: draft.documentType ?? 'generic',
    title: normalizeNonBlank(draft.title, 'Document title must not be blank'),
    plainText: normalizedPlainText,
    sourceKind: draft.sourceKind,
    ...(originalFileName !== undefined ? { originalFileName } : {}),
  }
}

export const documentHashInput = (draft: NormalizedDocumentDraft): string => draft.plainText

export const countDocumentCharacters = (plainText: string): number =>
  [...normalizeLineEndings(plainText)].length

export const normalizeDocumentImportJob = (job: DocumentImportJob): DocumentImportJob => {
  if (!UUID.test(job.id)) throw new Error('Document import job id is invalid')
  if (job.documentId !== null && !UUID.test(job.documentId)) {
    throw new Error('Document import job document id is invalid')
  }
  if (job.sourceKind !== 'pdf_file') throw new Error('Document import source kind is invalid')
  if (!DOCUMENT_IMPORT_STATUSES.includes(job.status)) {
    throw new Error('Document import status is invalid')
  }
  if (!Number.isInteger(job.fileSizeBytes) || job.fileSizeBytes < 0) {
    throw new Error('Document import file size is invalid')
  }
  if (!SHA_256.test(job.contentHash)) throw new Error('Document import content hash is invalid')
  if (job.status === 'failed' && job.error === null) {
    throw new Error('Document import failure requires an error summary')
  }
  if (job.status !== 'failed' && job.error !== null) {
    throw new Error('Document import error summary is only allowed for failed jobs')
  }
  const originalName = normalizeFileName(job.originalName)
  if (originalName === undefined) throw new Error('Document import original name is invalid')

  return { ...job, originalName }
}

export const normalizeDocumentChunk = (chunk: DocumentChunk): DocumentChunk => {
  if (!UUID.test(chunk.id)) throw new Error('Document chunk id is invalid')
  if (!UUID.test(chunk.documentId)) throw new Error('Document chunk document id is invalid')
  if (!Number.isInteger(chunk.pageNumberStart) || chunk.pageNumberStart < 1) {
    throw new Error('Document chunk page range is invalid')
  }
  if (!Number.isInteger(chunk.pageNumberEnd) || chunk.pageNumberEnd < chunk.pageNumberStart) {
    throw new Error('Document chunk page range is invalid')
  }
  if (chunk.blockIds.length === 0 || chunk.blockIds.some((blockId) => blockId.trim().length === 0)) {
    throw new Error('Document chunk block ids are invalid')
  }
  const text = normalizeNonBlank(chunk.text, 'Document chunk text must not be blank')
  if (!Number.isInteger(chunk.charCount) || chunk.charCount !== [...text].length) {
    throw new Error('Document chunk character count is invalid')
  }

  return {
    ...chunk,
    text,
    sourceVersion: normalizeNonBlank(chunk.sourceVersion, 'Document chunk source version is invalid'),
    rebuildToken: normalizeNonBlank(chunk.rebuildToken, 'Document chunk rebuild token is invalid'),
  }
}

export const normalizeDocumentContextBudget = (
  budget: DocumentContextBudget,
): DocumentContextBudget => {
  if (!Number.isInteger(budget.maxChunks) || budget.maxChunks < 1) {
    throw new Error('Document context chunk budget is invalid')
  }
  if (!Number.isInteger(budget.maxCharacters) || budget.maxCharacters < 1) {
    throw new Error('Document context character budget is invalid')
  }

  return budget
}
