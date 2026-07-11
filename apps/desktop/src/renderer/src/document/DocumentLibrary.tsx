import type {
  DocumentDetailDto,
  DocumentDraftDto,
  DocumentSearchResultDto,
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

type DetailState =
  | { status: 'idle' }
  | { status: 'loading'; documentId: string }
  | { status: 'ready'; document: DocumentDetailDto }
  | { status: 'error'; documentId: string }

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ready'; query: string; results: DocumentSearchResultDto[] }
  | { status: 'error'; query: string; message: string }

const getErrorMessage = (fallback: string, result?: { ok: false; error: { message: string } }) =>
  result?.error.message ?? fallback

const snippetFrom = (plainText: string): string => plainText.slice(0, 280).trim()

export const DocumentLibrary = ({
  onLessonStarted,
}: {
  onLessonStarted?: (lessonId: string) => void
}): React.JSX.Element => {
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [asyncState, setAsyncState] = useState<AsyncState>({ status: 'idle' })
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>()
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' })
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummaryDto>()
  const listRequestSequence = useRef(0)
  const detailRequestSequence = useRef(0)
  const searchRequestSequence = useRef(0)
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
    setDetailState({ status: 'loading', documentId: document.id })
    const result = await window.deepstorming.documents.get(document.id)
    if (detailRequestSequence.current !== requestSequence) return

    if (result.ok) {
      setDetailState({ status: 'ready', document: result.data })
      return
    }

    setDetailState({ status: 'error', documentId: document.id })
    setAsyncState({
      status: 'error',
      message: getErrorMessage('文档详情加载失败。', result),
    })
  }, [])

  const searchDocuments = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = searchQuery.trim()
    if (query.length === 0) {
      setSearchState({ status: 'error', query, message: '请输入搜索内容。' })
      return
    }

    const requestSequence = searchRequestSequence.current + 1
    searchRequestSequence.current = requestSequence
    setSearchState({ status: 'loading', query })

    const result = await window.deepstorming.documents.search(query)
    if (searchRequestSequence.current !== requestSequence) return

    if (result.ok) {
      setSearchState({ status: 'ready', query, results: result.data })
      return
    }

    setSearchState({ status: 'error', query, message: result.error.message })
  }

  const openSearchResult = (result: DocumentSearchResultDto) => {
    void loadDetail({
      id: result.documentId,
      documentType: result.documentType,
      title: result.title,
      sourceKind: result.sourceKind,
      ...(result.originalFileName === undefined
        ? {}
        : { originalFileName: result.originalFileName }),
      characterCount: result.characterCount,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    })
  }

  const startLesson = async (input: {
    documentId: string
    documentTitle: string
    startOffset: number
    endOffset: number
    snippet: string
  }) => {
    const token = operationSequence.current + 1
    operationSequence.current = token
    setAsyncState({ status: 'loading', message: '正在创建课堂…' })

    const result = await window.deepstorming.lessons.startFromDocument({
      documentId: input.documentId,
      documentTitle: input.documentTitle,
      source: {
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        snippet: input.snippet,
      },
    })
    if (operationSequence.current !== token) return

    if (!result.ok) {
      setAsyncState({
        status: 'error',
        message: getErrorMessage('课堂创建失败。', result),
      })
      return
    }

    setAsyncState({ status: 'success', message: '课堂已创建。' })
    onLessonStarted?.(result.data.id)
  }

  const createDocument = async (draft: DocumentDraftDto): Promise<boolean> => {
    const token = operationSequence.current + 1
    operationSequence.current = token
    setAsyncState({ status: 'loading', message: '正在保存文档…' })

    const result = await window.deepstorming.documents.createFromText(draft)
    if (operationSequence.current !== token) return false

    if (!result.ok) {
      setAsyncState({
        status: 'error',
        message: getErrorMessage('文档保存失败。', result),
      })
      return false
    }

    setAsyncState({ status: 'success', message: '文档已创建。' })
    await loadDetail(result.data)
    await loadDocuments()
    return true
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
      setSelectedDocumentId(undefined)
      setDetailState({ status: 'idle' })
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

          <form
            className="document-search"
            aria-label="文档内容搜索表单"
            onSubmit={searchDocuments}
          >
            <label>
              <span>搜索文档内容</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                disabled={asyncState.status === 'loading'}
              />
            </label>
            <button type="submit" disabled={asyncState.status === 'loading'}>
              搜索内容
            </button>
          </form>

          {searchState.status === 'loading' && (
            <p className="muted-state">正在搜索“{searchState.query}”…</p>
          )}

          {searchState.status === 'error' && (
            <p role="alert" className="error-state">
              {searchState.message}
            </p>
          )}

          {searchState.status === 'ready' && searchState.results.length === 0 && (
            <p className="muted-state">没有找到“{searchState.query}”。</p>
          )}

          {searchState.status === 'ready' && searchState.results.length > 0 && (
            <div className="document-search-results" aria-label="搜索结果">
              {searchState.results.map((result) => (
                <article key={`${result.documentId}:${result.startOffset}`} className="search-hit">
                  <div>
                    <h3>{result.title}</h3>
                    <p>{result.snippet}</p>
                    <p className="field-help">
                      字符 {result.startOffset}–{result.endOffset}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => openSearchResult(result)}
                    disabled={asyncState.status === 'loading'}
                  >
                    打开 {result.title}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void startLesson({
                        documentId: result.documentId,
                        documentTitle: result.title,
                        startOffset: result.startOffset,
                        endOffset: result.endOffset,
                        snippet: result.snippet,
                      })
                    }
                    disabled={asyncState.status === 'loading'}
                  >
                    用此片段开始课堂
                  </button>
                </article>
              ))}
            </div>
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

          {detailState.status !== 'ready' && (
            <p className="muted-state">
              {detailState.status === 'loading'
                ? '正在加载文档详情…'
                : '选择一篇文档后可查看正文。'}
            </p>
          )}

          {detailState.status === 'ready' && (
            <article>
              <h2>{detailState.document.title}</h2>
              <p className="field-help">
                {detailState.document.sourceKind === 'pasted_text' ? '粘贴文本' : '文本文件'} ·{' '}
                {detailState.document.characterCount} 字符
              </p>
              <div className="form-actions document-detail-actions">
                <button
                  type="button"
                  onClick={() =>
                    void startLesson({
                      documentId: detailState.document.id,
                      documentTitle: detailState.document.title,
                      startOffset: 0,
                      endOffset: snippetFrom(detailState.document.plainText).length,
                      snippet: snippetFrom(detailState.document.plainText),
                    })
                  }
                  disabled={asyncState.status === 'loading'}
                >
                  开始课堂
                </button>
              </div>
              <pre className="document-body">{detailState.document.plainText}</pre>
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
