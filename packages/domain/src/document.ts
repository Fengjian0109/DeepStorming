export const DOCUMENT_TYPES = ['generic', 'textbook', 'paper'] as const
export const DOCUMENT_SOURCE_KINDS = ['pasted_text', 'text_file'] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]
export type DocumentSourceKind = (typeof DOCUMENT_SOURCE_KINDS)[number]

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

const normalizeNonBlank = (value: string, message: string): string => {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(message)
  return normalized
}

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

  return {
    documentType: draft.documentType ?? 'generic',
    title: normalizeNonBlank(draft.title, 'Document title must not be blank'),
    plainText: normalizeNonBlank(draft.plainText, 'Document text must not be blank'),
    sourceKind: draft.sourceKind,
    ...(originalFileName !== undefined ? { originalFileName } : {}),
  }
}

export const documentHashInput = (draft: NormalizedDocumentDraft): string => draft.plainText

export const countDocumentCharacters = (plainText: string): number => [...plainText].length
