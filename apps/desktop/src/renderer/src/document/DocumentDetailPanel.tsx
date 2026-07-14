import type { DocumentDetailDto } from '@deepstorming/contracts'
import React from 'react'

type DocumentDetailPanelProps = Readonly<{
  document: DocumentDetailDto
  busy: boolean
  readerOpen: boolean
  onStartLesson: () => void
  onOpenReader: () => void
  onCloseReader: () => void
  onDelete: () => void
  reader: React.ReactNode
}>

const documentTypeLabels: Readonly<Record<DocumentDetailDto['documentType'], string>> = {
  generic: '文档',
  textbook: '教材',
  paper: '论文',
}

export const previewDocumentText = (plainText: string): string => {
  const normalized = plainText.replace(/\s+/gu, ' ').trim()
  return normalized.length <= 320 ? normalized : normalized.slice(0, 320) + '…'
}

export const DocumentDetailPanel = ({
  document,
  busy,
  readerOpen,
  onStartLesson,
  onOpenReader,
  onCloseReader,
  onDelete,
  reader,
}: DocumentDetailPanelProps): React.JSX.Element => (
  <article className="document-detail-card">
    <header className="document-detail-summary">
      <div>
        <p className="section-kicker">当前资料</p>
        <h2>{document.title}</h2>
        <p className="field-help">
          {documentTypeLabels[document.documentType]} · {document.characterCount} 字符
        </p>
        {document.originalFileName && (
          <p className="document-original-file">{document.originalFileName}</p>
        )}
      </div>
      <div className="document-detail-actions">
        <button type="button" disabled={busy} onClick={onStartLesson}>
          开始课堂
        </button>
        {readerOpen ? (
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={onCloseReader}
          >
            关闭阅读器
          </button>
        ) : (
          <button type="button" className="secondary-button" disabled={busy} onClick={onOpenReader}>
            打开阅读器
          </button>
        )}
        <button type="button" className="danger-button" disabled={busy} onClick={onDelete}>
          删除文档
        </button>
      </div>
    </header>

    {!readerOpen && (
      <section className="document-preview" aria-label="正文预览">
        <h3>内容预览</h3>
        <p data-testid="document-preview">{previewDocumentText(document.plainText)}</p>
      </section>
    )}

    {readerOpen && <section className="document-reader-region">{reader}</section>}
  </article>
)
