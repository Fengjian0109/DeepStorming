import type { DocumentFigureDto } from '@deepstorming/contracts'
import React, { useEffect, useState } from 'react'

type FigureCardProps = Readonly<{
  documentId: string
  figureId: string
  rationale: string
  onReturnToSource?: ((figure: DocumentFigureDto) => void) | undefined
}>

type FigureState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error' }>
  | Readonly<{ status: 'success'; figure: DocumentFigureDto; dataUrl: string }>

export const FigureCard = ({
  documentId,
  figureId,
  rationale,
  onReturnToSource,
}: FigureCardProps): React.JSX.Element => {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<FigureState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    void window.deepstorming.documents
      .getFigureAsset(documentId, figureId)
      .then((result) => {
        if (!active) return
        if (!result.ok) {
          setState({ status: 'error' })
          return
        }
        setState({
          status: 'success',
          figure: result.data.figure,
          dataUrl: result.data.dataUrl,
        })
      })
      .catch(() => {
        if (active) setState({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [attempt, documentId, figureId])

  if (state.status === 'loading') {
    return <div className="figure-card figure-card-loading">正在加载图片…</div>
  }
  if (state.status === 'error') {
    return (
      <div className="figure-card figure-card-error" role="status">
        <p>图片暂时无法显示。</p>
        <button type="button" className="secondary-button" onClick={() => setAttempt((x) => x + 1)}>
          重试加载图片
        </button>
      </div>
    )
  }

  const { figure, dataUrl } = state
  return (
    <figure className="figure-card">
      <img
        src={dataUrl}
        alt={`${figure.label}：${figure.caption}`}
        width={figure.width}
        height={figure.height}
      />
      <figcaption>
        <header>
          <strong>{figure.label}</strong>
          <span>第 {figure.pageNumber} 页</span>
        </header>
        <p>{figure.caption}</p>
        <small>{rationale}</small>
        {onReturnToSource && (
          <button
            type="button"
            className="secondary-button citation-return-button"
            onClick={() => onReturnToSource(figure)}
          >
            回到图片来源
          </button>
        )}
      </figcaption>
    </figure>
  )
}
