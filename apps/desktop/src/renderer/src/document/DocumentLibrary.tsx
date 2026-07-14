import type {
  DocumentDetailDto,
  DocumentDraftDto,
  DocumentPageDto,
  DocumentSearchResultDto,
  DocumentSummaryDto,
  DocumentTextBlockDto,
} from '@deepstorming/contracts'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { WorkspaceContextual } from '../app/WorkspaceShell'
import { DocumentCreateDialog } from './DocumentCreateDialog'
import { DocumentDetailPanel } from './DocumentDetailPanel'
import { DocumentList } from './DocumentList'
import { PdfReaderPanel } from './PdfReaderPanel'

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

type PagePreviewState =
  | { status: 'idle' }
  | { status: 'loading'; documentId: string }
  | {
      status: 'ready'
      documentId: string
      pages: Array<Readonly<{ page: DocumentPageDto; blocks: DocumentTextBlockDto[] }>>
    }
  | { status: 'error'; documentId: string; message: string }

const getErrorMessage = (fallback: string, result?: { ok: false; error: { message: string } }) =>
  result?.error.message ?? fallback

const snippetFrom = (plainText: string): string => plainText.slice(0, 280).trim()

const titleFromPdfName = (name: string): string => name.replace(/\.pdf$/iu, '').trim() || name

export type DocumentEvidenceFocus = Readonly<{
  documentId: string
  pageNumber: number
  blockId: string
}>

export const DocumentLibrary = ({
  onLessonStarted,
  focusTarget,
  onFocusConsumed,
}: {
  onLessonStarted?: (lessonId: string) => void
  focusTarget?: DocumentEvidenceFocus | undefined
  onFocusConsumed?: () => void
}): React.JSX.Element => {
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [asyncState, setAsyncState] = useState<AsyncState>({ status: 'idle' })
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>()
  const [detailState, setDetailState] = useState<DetailState>({ status: 'idle' })
  const [pagePreviewState, setPagePreviewState] = useState<PagePreviewState>({ status: 'idle' })
  const [readerOpen, setReaderOpen] = useState(false)
  const [selectedPdfTarget, setSelectedPdfTarget] =
    useState<Readonly<{ pageNumber: number; blockId: string }>>()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' })
  const [deleteTarget, setDeleteTarget] = useState<DocumentSummaryDto>()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const listRequestSequence = useRef(0)
  const detailRequestSequence = useRef(0)
  const readerRequestSequence = useRef(0)
  const searchRequestSequence = useRef(0)
  const operationSequence = useRef(0)
  const consumedFocusKey = useRef<string | undefined>(undefined)

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
    readerRequestSequence.current += 1
    setSelectedDocumentId(document.id)
    setSelectedPdfTarget(undefined)
    setReaderOpen(false)
    setDetailState({ status: 'loading', documentId: document.id })
    setPagePreviewState({ status: 'idle' })
    const result = await window.deepstorming.documents.get(document.id)
    if (detailRequestSequence.current !== requestSequence) return

    if (result.ok) {
      setDetailState({ status: 'ready', document: result.data })
      return result.data
    }

    setDetailState({ status: 'error', documentId: document.id })
    setPagePreviewState({ status: 'idle' })
    setAsyncState({
      status: 'error',
      message: getErrorMessage('文档详情加载失败。', result),
    })
  }, [])

  const openReader = useCallback(async (document: DocumentDetailDto) => {
    const requestSequence = readerRequestSequence.current + 1
    readerRequestSequence.current = requestSequence
    setReaderOpen(true)

    const isPdf = document.originalFileName?.toLowerCase().endsWith('.pdf') ?? false
    if (!isPdf) {
      setPagePreviewState({ status: 'ready', documentId: document.id, pages: [] })
      return
    }

    setPagePreviewState({ status: 'loading', documentId: document.id })
    const pagesResult = await window.deepstorming.documents.getPages(document.id)
    if (readerRequestSequence.current !== requestSequence) return
    if (!pagesResult.ok) {
      setPagePreviewState({
        status: 'error',
        documentId: document.id,
        message: pagesResult.error.message,
      })
      return
    }

    const pagesWithBlocks: Array<
      Readonly<{ page: DocumentPageDto; blocks: DocumentTextBlockDto[] }>
    > = []
    for (const page of pagesResult.data) {
      const blocksResult = await window.deepstorming.documents.getPageBlocks(
        document.id,
        page.pageNumber,
      )
      if (readerRequestSequence.current !== requestSequence) return
      if (!blocksResult.ok) {
        setPagePreviewState({
          status: 'error',
          documentId: document.id,
          message: blocksResult.error.message,
        })
        return
      }
      pagesWithBlocks.push({ page, blocks: [...blocksResult.data] })
    }

    setPagePreviewState({ status: 'ready', documentId: document.id, pages: pagesWithBlocks })
  }, [])

  const closeReader = useCallback(() => {
    readerRequestSequence.current += 1
    setReaderOpen(false)
    setPagePreviewState({ status: 'idle' })
    setSelectedPdfTarget(undefined)
  }, [])

  useEffect(() => {
    if (focusTarget === undefined) {
      consumedFocusKey.current = undefined
      return
    }
    if (listState.status !== 'ready') return
    const summary = listState.documents.find((document) => document.id === focusTarget.documentId)
    if (summary === undefined) return
    const key = `${focusTarget.documentId}:${focusTarget.pageNumber}:${focusTarget.blockId}`
    if (consumedFocusKey.current === key) return
    void loadDetail(summary).then((document) => {
      if (document === undefined) return
      consumedFocusKey.current = key
      setSelectedPdfTarget({ pageNumber: focusTarget.pageNumber, blockId: focusTarget.blockId })
      void openReader(document)
      onFocusConsumed?.()
    })
  }, [focusTarget, listState, loadDetail, onFocusConsumed, openReader])

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
    target?: Readonly<{
      kind: 'pdf_block'
      pageNumber: number
      blockId: string
      blockIndex: number
    }>
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
        ...(input.target === undefined ? {} : { target: input.target }),
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

  const importPdf = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    const filePath = window.deepstorming.documents.getPathForFile(file)
    if (filePath === undefined) {
      setAsyncState({
        status: 'error',
        message: '无法读取 PDF 文件路径，请在桌面应用中重新选择文件。',
      })
      return
    }

    const token = operationSequence.current + 1
    operationSequence.current = token
    setAsyncState({ status: 'loading', message: '正在导入 PDF…' })

    const result = await window.deepstorming.documents.importPdf({
      filePath,
      originalName: file.name,
    })
    if (operationSequence.current !== token) return

    if (!result.ok) {
      setAsyncState({
        status: 'error',
        message: getErrorMessage('PDF 导入失败。', result),
      })
      return
    }

    if (result.data.status === 'failed') {
      setAsyncState({
        status: 'error',
        message: result.data.error?.message ?? 'PDF 导入失败。',
      })
      return
    }

    if (result.data.status !== 'ready' || result.data.documentId === null) {
      setAsyncState({ status: 'success', message: 'PDF 导入已开始。' })
      await loadDocuments()
      return
    }

    setAsyncState({ status: 'success', message: 'PDF 已导入。' })
    await loadDetail({
      id: result.data.documentId,
      documentType: 'paper',
      title: titleFromPdfName(result.data.originalName),
      sourceKind: 'text_file',
      originalFileName: result.data.originalName,
      characterCount: 0,
      createdAt: result.data.createdAt,
      updatedAt: result.data.updatedAt,
    })
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
      readerRequestSequence.current += 1
      setSelectedDocumentId(undefined)
      setDetailState({ status: 'idle' })
      setPagePreviewState({ status: 'idle' })
      setReaderOpen(false)
      setSelectedPdfTarget(undefined)
    }
    setDeleteTarget(undefined)
    setAsyncState({ status: 'success', message: '文档已删除。' })
    await loadDocuments()
  }

  let readerContent: React.ReactNode = null
  if (detailState.status === 'ready') {
    const document = detailState.document
    const isPdf = document.originalFileName?.toLowerCase().endsWith('.pdf') ?? false

    if (!isPdf) {
      readerContent = <pre className="document-reader-body">{document.plainText}</pre>
    } else if (
      pagePreviewState.status === 'loading' &&
      pagePreviewState.documentId === document.id
    ) {
      readerContent = <p className="muted-state">正在加载 PDF 页面…</p>
    } else if (pagePreviewState.status === 'error' && pagePreviewState.documentId === document.id) {
      readerContent = (
        <div className="reader-error-state">
          <p role="alert" className="error-state">
            {pagePreviewState.message}
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void openReader(document)}
          >
            重试加载阅读器
          </button>
        </div>
      )
    } else if (
      pagePreviewState.status === 'ready' &&
      pagePreviewState.documentId === document.id &&
      pagePreviewState.pages.length > 0
    ) {
      readerContent = (
        <PdfReaderPanel
          documentId={document.id}
          pages={pagePreviewState.pages}
          selectedTarget={selectedPdfTarget}
          onSelectTarget={setSelectedPdfTarget}
          onStartLesson={(input) =>
            void startLesson({
              ...input,
              documentTitle: document.title,
              target: {
                kind: 'pdf_block',
                pageNumber: input.pageNumber,
                blockId: input.blockId,
                blockIndex: input.blockIndex,
              },
            })
          }
        />
      )
    } else {
      readerContent = <p className="muted-state">这个 PDF 暂无可显示的页面。</p>
    }
  }

  return (
    <div className="document-workspace">
      <WorkspaceContextual>
        <section className="document-contextual-navigation" aria-label="文档导航内容">
          <div className="contextual-section-header">
            <h2>文档</h2>
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
                <article key={result.documentId + ':' + result.startOffset} className="search-hit">
                  <h3>{result.title}</h3>
                  <p>{result.snippet}</p>
                  <p className="field-help">
                    字符 {result.startOffset}–{result.endOffset}
                  </p>
                  <div className="card-actions">
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
                  </div>
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
              <p>从粘贴文本或导入文件开始建立你的文档库。</p>
            </div>
          )}
          {listState.status === 'ready' && listState.documents.length > 0 && (
            <DocumentList
              documents={listState.documents}
              selectedDocumentId={selectedDocumentId}
              disabled={asyncState.status === 'loading'}
              onSelect={(document) => void loadDetail(document)}
            />
          )}
        </section>
      </WorkspaceContextual>

      <section className="document-main-canvas" aria-labelledby="document-title">
        <header className="workspace-header document-main-header">
          <div>
            <p className="section-kicker">DOCUMENTS</p>
            <h1 id="document-title">文档库</h1>
            <p>导入资料、查看摘要，然后进入阅读器或开始课堂。</p>
          </div>
        </header>

        <div className="document-import-section">
          <div className="document-import-toolbar" role="toolbar" aria-label="添加学习资料">
            <button type="button" onClick={() => setCreateDialogOpen(true)}>
              粘贴文本 / 导入 TXT、MD
            </button>
            <label className="file-picker">
              <span>{asyncState.status === 'loading' ? '处理中…' : '导入可选择文字的 PDF'}</span>
              <input
                type="file"
                aria-label="导入可选择文字的 PDF"
                accept=".pdf,application/pdf"
                disabled={asyncState.status === 'loading'}
                onChange={(event) => void importPdf(event)}
              />
            </label>
          </div>
          <p className="field-help">第一版仅支持带可选择文字层的 PDF，不支持扫描件。</p>
        </div>

        {asyncState.status !== 'idle' && (
          <p
            className={'operation-state operation-state-' + asyncState.status}
            role={asyncState.status === 'error' ? 'alert' : 'status'}
          >
            {asyncState.message}
          </p>
        )}

        <section className="document-main-panel" aria-live="polite">
          {detailState.status !== 'ready' && (
            <div className="document-detail-empty">
              <h2>文档详情</h2>
              <p className="muted-state">
                {detailState.status === 'loading'
                  ? '正在加载文档详情…'
                  : '选择一篇文档后可查看摘要。'}
              </p>
            </div>
          )}
          {detailState.status === 'ready' && (
            <DocumentDetailPanel
              document={detailState.document}
              busy={asyncState.status === 'loading'}
              readerOpen={readerOpen}
              onStartLesson={() =>
                void startLesson({
                  documentId: detailState.document.id,
                  documentTitle: detailState.document.title,
                  startOffset: 0,
                  endOffset: snippetFrom(detailState.document.plainText).length,
                  snippet: snippetFrom(detailState.document.plainText),
                })
              }
              onOpenReader={() => void openReader(detailState.document)}
              onCloseReader={closeReader}
              onDelete={() => setDeleteTarget(detailState.document)}
              reader={readerContent}
            />
          )}
        </section>
      </section>

      <DocumentCreateDialog
        open={createDialogOpen}
        saving={asyncState.status === 'loading'}
        onClose={() => setCreateDialogOpen(false)}
        onSubmit={createDocument}
        onError={(message) => setAsyncState({ status: 'error', message })}
      />

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
