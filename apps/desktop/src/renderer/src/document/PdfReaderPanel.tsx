import type { DocumentPageDto, DocumentTextBlockDto } from '@deepstorming/contracts'
import React, { useMemo, useState } from 'react'

export type PdfReaderPage = Readonly<{
  page: DocumentPageDto
  blocks: readonly DocumentTextBlockDto[]
}>

type PdfReaderPanelProps = Readonly<{
  documentId: string
  pages: readonly PdfReaderPage[]
  selectedTarget?: Readonly<{ pageNumber: number; blockId: string }> | undefined
  onSelectTarget?: (target: Readonly<{ pageNumber: number; blockId: string }>) => void
  onStartLesson: (input: {
    documentId: string
    pageNumber: number
    blockId: string
    blockIndex: number
    startOffset: number
    endOffset: number
    snippet: string
  }) => void
}>

const normalize = (value: string): string => value.trim().toLocaleLowerCase()

export const PdfReaderPanel = ({
  documentId,
  pages,
  selectedTarget,
  onSelectTarget,
  onStartLesson,
}: PdfReaderPanelProps): React.JSX.Element => {
  const [query, setQuery] = useState('')
  const [localTarget, setLocalTarget] = useState<{ pageNumber: number; blockId: string }>()
  const activeTarget = selectedTarget ?? localTarget
  const offsets = useMemo(() => {
    let pageOffset = 0
    const result = new Map<string, { startOffset: number; endOffset: number }>()
    for (const { page, blocks } of pages) {
      for (const block of blocks) {
        const withinPage = page.text.indexOf(block.text)
        if (withinPage >= 0) {
          const startOffset = pageOffset + withinPage
          result.set(block.id, { startOffset, endOffset: startOffset + block.text.length })
        }
      }
      pageOffset += page.text.length + 2
    }
    return result
  }, [pages])
  const normalizedQuery = normalize(query)

  const select = (pageNumber: number, blockId: string) => {
    const target = { pageNumber, blockId }
    setLocalTarget(target)
    onSelectTarget?.(target)
  }

  return (
    <section className="pdf-reader-panel" aria-label="PDF 内嵌阅读器">
      <div className="panel-header">
        <div>
          <h3>PDF 阅读器</h3>
          <p className="field-help">按页浏览文本层，并从选中的 block 开始课堂。</p>
        </div>
        <label>
          <span>搜索 PDF 文本块</span>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        </label>
      </div>
      {pages.length === 0 && <p className="muted-state">暂无可读的 PDF 页面。</p>}
      <div className="pdf-reader-pages">
        {pages.map(({ page, blocks }) => {
          const visibleBlocks = blocks.filter(
            (block) => normalizedQuery.length === 0 || normalize(block.text).includes(normalizedQuery),
          )
          return (
            <article key={page.id} className="pdf-page-card">
              <h4>PDF 页面 {page.pageNumber}</h4>
              <p className="field-help">{Math.round(page.width)} × {Math.round(page.height)}</p>
              {visibleBlocks.length === 0 ? (
                <p className="muted-state">没有匹配的文本块。</p>
              ) : (
                <ul>
                  {visibleBlocks.map((block) => {
                    const isSelected =
                      activeTarget?.pageNumber === page.pageNumber && activeTarget.blockId === block.id
                    const range = offsets.get(block.id)
                    return (
                      <li key={block.id} className={isSelected ? 'pdf-block-active' : undefined}>
                        <button type="button" onClick={() => select(page.pageNumber, block.id)}>
                          选择 Block {block.blockIndex + 1}
                        </button>
                        <span>Block {block.blockIndex + 1} · {block.text}</span>
                        {isSelected && (
                          <div>
                            <p className="field-help">
                              {range === undefined ? '证据文本不可定位' : `字符 ${range.startOffset}–${range.endOffset}`}
                            </p>
                            <button
                              type="button"
                              disabled={range === undefined}
                              onClick={() => {
                                if (range === undefined) return
                                onStartLesson({
                                  documentId,
                                  pageNumber: page.pageNumber,
                                  blockId: block.id,
                                  blockIndex: block.blockIndex,
                                  ...range,
                                  snippet: block.text.trim().slice(0, 280),
                                })
                              }}
                            >
                              用此 block 开始课堂
                            </button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
