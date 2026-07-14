import type { DocumentSummaryDto } from '@deepstorming/contracts'
import React from 'react'

type DocumentListProps = Readonly<{
  documents: readonly DocumentSummaryDto[]
  selectedDocumentId?: string | undefined
  disabled?: boolean | undefined
  onSelect: (document: DocumentSummaryDto) => void
}>

const sourceKindText = {
  pasted_text: '粘贴文本',
  text_file: '本地文件',
} as const

export const DocumentList = ({
  documents,
  selectedDocumentId,
  disabled = false,
  onSelect,
}: DocumentListProps): React.JSX.Element => (
  <section className="document-list" aria-label="文档列表">
    {documents.map((document) => {
      const isSelected = selectedDocumentId === document.id
      return (
        <button
          type="button"
          className={`document-list-row ${isSelected ? 'document-list-row-selected' : ''}`}
          key={document.id}
          aria-label={'打开文档：' + document.title}
          aria-current={isSelected ? 'page' : undefined}
          disabled={disabled}
          onClick={() => onSelect(document)}
        >
          <span className="document-list-title">{document.title}</span>
          <span className="document-list-meta">
            {sourceKindText[document.sourceKind]} · {document.characterCount} 字符
          </span>
          {document.originalFileName && (
            <span className="document-list-file">{document.originalFileName}</span>
          )}
        </button>
      )
    })}
  </section>
)
