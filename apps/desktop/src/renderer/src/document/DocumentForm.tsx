import type { DocumentDraftDto, DocumentSourceKindDto } from '@deepstorming/contracts'
import React, { useState } from 'react'

type DocumentFormProps = Readonly<{
  disabled?: boolean | undefined
  onSubmit: (draft: DocumentDraftDto) => Promise<boolean>
  onError: (message: string) => void
}>

type DraftState = Readonly<{
  title: string
  plainText: string
  sourceKind: DocumentSourceKindDto
  originalFileName?: string | undefined
}>

const defaultDraft: DraftState = {
  title: '',
  plainText: '',
  sourceKind: 'pasted_text',
}

const isAllowedTextFile = (file: File): boolean => /\.(txt|md)$/i.test(file.name)

export const DocumentForm = ({
  disabled = false,
  onSubmit,
  onError,
}: DocumentFormProps): React.JSX.Element => {
  const [draft, setDraft] = useState<DraftState>(defaultDraft)

  const updateSourceKind = (sourceKind: DocumentSourceKindDto) => {
    setDraft((current) => ({
      ...current,
      sourceKind,
      ...(sourceKind === 'pasted_text' ? { originalFileName: undefined } : {}),
    }))
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const saved = await onSubmit({
      title: draft.title.trim(),
      plainText: draft.plainText.trim(),
      sourceKind: draft.sourceKind,
      ...(draft.originalFileName ? { originalFileName: draft.originalFileName } : {}),
    })

    if (saved) {
      setDraft(defaultDraft)
    }
  }

  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    if (!isAllowedTextFile(file)) {
      input.value = ''
      onError('请选择 .txt 或 .md 文件。')
      return
    }

    try {
      const text = await file.text()
      setDraft({
        title: file.name,
        plainText: text,
        sourceKind: 'text_file',
        originalFileName: file.name,
      })
      input.value = ''
    } catch {
      input.value = ''
      onError('读取文件失败，请重试。')
    }
  }

  return (
    <form className="provider-form" aria-label="新建文档" onSubmit={submit}>
      <div className="document-toolbar" role="toolbar" aria-label="文档来源">
        <button
          type="button"
          className={draft.sourceKind === 'pasted_text' ? undefined : 'secondary-button'}
          onClick={() => updateSourceKind('pasted_text')}
          disabled={disabled}
        >
          粘贴文本
        </button>
        <label className="file-picker">
          <span>导入 .txt 或 .md</span>
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            onChange={(event) => void importFile(event)}
            disabled={disabled}
          />
        </label>
      </div>

      <div className="form-grid">
        <label>
          <span>标题</span>
          <input
            value={draft.title}
            onChange={(event) => {
              const title = event.currentTarget.value
              setDraft((current) => ({ ...current, title }))
            }}
            disabled={disabled}
            required
          />
        </label>

        <label>
          <span>正文</span>
          <textarea
            className="document-textarea"
            value={draft.plainText}
            onChange={(event) => {
              const plainText = event.currentTarget.value
              setDraft((current) => ({ ...current, plainText }))
            }}
            disabled={disabled}
            required
            rows={12}
          />
        </label>
      </div>

      <div className="form-actions">
        <button type="submit" disabled={disabled}>
          保存文档
        </button>
      </div>
    </form>
  )
}
