import type { DocumentSummaryDto } from '@deepstorming/contracts'
import React from 'react'

type DocumentListProps = Readonly<{
  documents: readonly DocumentSummaryDto[]
  selectedDocumentId?: string | undefined
  disabled?: boolean | undefined
  deletingDocumentId?: string | undefined
  onSelect: (document: DocumentSummaryDto) => void
  onDelete: (document: DocumentSummaryDto) => void
}>

const sourceKindText = {
  pasted_text: '粘贴文本',
  text_file: '文本文件',
} as const

export const DocumentList = ({
  documents,
  selectedDocumentId,
  disabled = false,
  deletingDocumentId,
  onSelect,
  onDelete,
}: DocumentListProps): React.JSX.Element => (
  <section className="provider-list" aria-label="文档列表">
    {documents.map((document) => {
      const isSelected = selectedDocumentId === document.id
      const isDeleting = deletingDocumentId === document.id
      return (
        <article className="document-card" key={document.id}>
          <div className="provider-card-header">
            <div>
              <h3>{document.title}</h3>
              <p>
                {sourceKindText[document.sourceKind]} · {document.characterCount} 字符
              </p>
            </div>
            {isSelected && <span className="status-label">已选中</span>}
          </div>

          {document.originalFileName && (
            <p className="provider-base-url">{document.originalFileName}</p>
          )}

          <div className="card-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => onSelect(document)}
              disabled={disabled}
            >
              查看详情
            </button>
            <button
              type="button"
              className="danger-button"
              onClick={() => onDelete(document)}
              disabled={disabled || isDeleting}
              aria-label={`删除 ${document.title}`}
            >
              删除
            </button>
          </div>
        </article>
      )
    })}
  </section>
)
