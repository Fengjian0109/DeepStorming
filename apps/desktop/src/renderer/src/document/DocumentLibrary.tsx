import type {
  DocumentDetailDto,
  DocumentDraftDto,
  DocumentSummaryDto,
} from '@deepstorming/contracts'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { DocumentForm } from './DocumentForm'
import { DocumentList } from './DocumentList'

type AsyncState =
  | { status: 'idle' }
  | { status: 'loading'; message: string }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; documents: DocumentSummaryDto[] }
  | { status: 'error'; message: string }

const getErrorMessage = (fallback: string, result?: { ok: false; error: { message: string } }) =>
  result?.error.message ?? fallback

export const DocumentLibrary = (): React.JSX.Element => {
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [asyncState, setAsyncState] = useState<AsyncState>({ status: 'idle' })
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetailDto>()
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>()
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummaryDto>()
  const listRequestSequence = useRef(0)
  const detailRequestSequence = useRef(0)
  const operationSequence = useRef(0)

  const loadDocuments = useCallback(async () => {
    const requestSequence = listRequestSequence.current + 1
    listRequestSequence.current = requestSequence
    setListState({ status: 'loading' })
    const result = await window.deepstorming.documents.list()
    if (listRequestSequence.current !== requestSequence) return

    if (result.ok) {
      setListState({ status: 'ready', documents: result.data })
      return
    }

    setListState({ status: 'error', message: result.error.message })
  }, [])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  const loadDetail = useCallback(async (document: DocumentSummaryDto) => {
    const requestSequence = detailRequestSequence.current + 1
    detailRequestSequence.current = requestSequence
    setSelectedDocumentId(document.id)
    const result = await window.deepstorming.documents.get(document.id)
    if (detailRequestSequence.current !== requestSequence) return

    if (result.ok) {
      setSelectedDocument(result.data)
      return
    }

    setAsyncState({
      status: 'error',
      message: getErrorMessage('文档详情加载失败。', result),
    })
  }, [])

  const createDocument = async (draft: DocumentDraftDto) => {
    const token = operationSequence.current + 1
    operationSequence.current = token
    setAsyncState({ status: 'loading', message: '正在保存文档…' })

    const result = await window.deepstorming.documents.createFromText(draft)
    if (operationSequence.current !== token) return

    if (!result.ok) {
      setAsyncState({
        status: 'error',
        message: getErrorMessage('文档保存失败。', result),
      })
      return
    }

    setAsyncState({ status: 'success', message: '文档已创建。' })
    await loadDetail(result.data)
    await loadDocuments()
  }

  const deleteDocument = async () => {
    if (!deleteTarget) return

    const token = operationSequence.current + 1
    operationSequence.current = token
    setAsyncState({ status: 'loading', message: '正在删除文档…' })

    const result = await window.deepstorming.documents.remove(deleteTarget.id)
    if (operationSequence.current !== token) return

    if (!result.ok) {
      setAsyncState({
        status: 'error',
        message: getErrorMessage('文档删除失败。', result),
      })
      return
    }

    if (selectedDocumentId === deleteTarget.id) {
      setSelectedDocument(undefined)
      setSelectedDocumentId(undefined)
    }
    setDeleteTarget(undefined)
    setAsyncState({ status: 'success', message: '文档已删除。' })
    await loadDocuments()
  }

  return (
    <div className="provider-workspace">
      <section className="workspace-header" aria-labelledby="document-title">
        <div>
          <p className="section-kicker">DOCUMENTS</p>
          <h1 id="document-title">文档库</h1>
          <p>直接输入正文或导入 .txt / .md 文件，统一管理学习文档。</p>
        </div>
      </section>

      <div className="document-layout">
        <aside className="panel">
          <h2>新建文档</h2>
          <DocumentForm
            disabled={asyncState.status === 'loading'}
            onSubmit={createDocument}
            onError={(message) => setAsyncState({ status: 'error', message })}
          />
        </aside>

        <main className="panel">
          <div className="panel-header">
            <h2>文档列表</h2>
            {listState.status === 'error' && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => void loadDocuments()}
              >
                重试加载
              </button>
            )}
          </div>

          {asyncState.status !== 'idle' && (
            <p
              className={`operation-state operation-state-${asyncState.status}`}
              role={asyncState.status === 'error' ? 'alert' : 'status'}
            >
              {asyncState.message}
            </p>
          )}

          {listState.status === 'loading' && <p className="muted-state">正在加载文档…</p>}

          {listState.status === 'error' && (
            <p role="alert" className="error-state">
              {listState.message}
            </p>
          )}

          {listState.status === 'ready' && listState.documents.length === 0 && (
            <div className="empty-state">
              <h3>还没有文档</h3>
              <p>从粘贴文本或导入文本文件开始建立你的文档库。</p>
            </div>
          )}

          {listState.status === 'ready' && listState.documents.length > 0 && (
            <DocumentList
              documents={listState.documents}
              selectedDocumentId={selectedDocumentId}
              deletingDocumentId={deleteTarget?.id}
              disabled={asyncState.status === 'loading'}
              onSelect={(document) => void loadDetail(document)}
              onDelete={setDeleteTarget}
            />
          )}
        </main>

        <section className="panel document-detail" aria-live="polite">
          <div className="panel-header">
            <h2>文档详情</h2>
          </div>

          {!selectedDocument && <p className="muted-state">选择一篇文档后可查看正文。</p>}

          {selectedDocument && (
            <article>
              <h2>{selectedDocument.title}</h2>
              <p className="field-help">
                {selectedDocument.sourceKind === 'pasted_text' ? '粘贴文本' : '文本文件'} ·{' '}
                {selectedDocument.characterCount} 字符
              </p>
              <pre className="document-body">{selectedDocument.plainText}</pre>
            </article>
          )}
        </section>
      </div>

      {deleteTarget && (
        <div className="modal-backdrop">
          <div role="dialog" aria-modal="true" aria-label="确认删除文档" className="confirm-dialog">
            <h2>确认删除文档</h2>
            <p>删除 {deleteTarget.title}？</p>
            <p>删除后需要重新导入或重新粘贴内容。</p>
            <div className="form-actions">
              <button
                type="button"
                className="danger-button"
                onClick={() => void deleteDocument()}
                disabled={asyncState.status === 'loading'}
              >
                确认删除
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDeleteTarget(undefined)}
                disabled={asyncState.status === 'loading'}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
