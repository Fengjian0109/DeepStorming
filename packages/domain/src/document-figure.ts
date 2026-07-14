export const DOCUMENT_FIGURE_ASSET_KINDS = ['embedded_image', 'page_render'] as const

export type DocumentFigureAssetKind = (typeof DOCUMENT_FIGURE_ASSET_KINDS)[number]

export type FigureCaption = Readonly<{ label: string; caption: string }>

export type DocumentFigure = Readonly<{
  id: string
  documentId: string
  pageNumber: number
  label: string
  caption: string
  assetId: string
  assetKind: DocumentFigureAssetKind
  width: number
  height: number
  createdAt: string
}>

const UUID = /^[\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu
const CONTROLLED_ASSET_ID = /^[\da-z_-]{1,100}$/iu
const LATIN_CAPTION = /^(Figure|Fig\.)\s*([\da-z]+(?:[.-][\da-z]+)*)\s*[:：.]\s*(.+)$/iu
const CHINESE_CAPTION = /^(图)\s*([\da-z]+(?:[.-][\da-z]+)*)\s*[:：.]\s*(.+)$/iu

const nonBlank = (value: string, message: string, max: number): string => {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > max) throw new Error(message)
  return normalized
}

export const findFigureCaptions = (text: string): readonly FigureCaption[] =>
  text
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .flatMap((line) => {
      const match = LATIN_CAPTION.exec(line) ?? CHINESE_CAPTION.exec(line)
      if (match === null) return []
      return [
        {
          label: `${match[1]} ${match[2]}`,
          caption: match[3]!.trim(),
        },
      ]
    })
    .filter((caption) => caption.caption.length > 0)

export const normalizeDocumentFigure = (figure: DocumentFigure): DocumentFigure => {
  if (!UUID.test(figure.id)) throw new Error('Document figure id is invalid')
  if (!UUID.test(figure.documentId)) throw new Error('Document figure document id is invalid')
  if (!Number.isInteger(figure.pageNumber) || figure.pageNumber < 1) {
    throw new Error('Document figure page number is invalid')
  }
  if (!CONTROLLED_ASSET_ID.test(figure.assetId)) {
    throw new Error('Document figure asset id is invalid')
  }
  if (!DOCUMENT_FIGURE_ASSET_KINDS.includes(figure.assetKind)) {
    throw new Error('Document figure asset kind is invalid')
  }
  if (!Number.isFinite(figure.width) || figure.width <= 0) {
    throw new Error('Document figure width is invalid')
  }
  if (!Number.isFinite(figure.height) || figure.height <= 0) {
    throw new Error('Document figure height is invalid')
  }
  return {
    ...figure,
    label: nonBlank(figure.label, 'Document figure label is invalid', 80),
    caption: nonBlank(figure.caption, 'Document figure caption is invalid', 1_000),
    createdAt: nonBlank(figure.createdAt, 'Document figure created time is invalid', 80),
  }
}
