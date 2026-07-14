import type { LessonTutorCitationDto } from '@deepstorming/contracts'
import React from 'react'

type CitationCardProps = Readonly<{
  citation: LessonTutorCitationDto
  onReturnToSource?: (() => void) | undefined
}>

const pageLabel = (citation: LessonTutorCitationDto): string => {
  if (citation.pageNumberStart === undefined || citation.pageNumberEnd === undefined) {
    return '来源位置已验证'
  }
  return citation.pageNumberStart === citation.pageNumberEnd
    ? `第 ${citation.pageNumberStart} 页`
    : `第 ${citation.pageNumberStart}–${citation.pageNumberEnd} 页`
}

export const CitationCard = ({
  citation,
  onReturnToSource,
}: CitationCardProps): React.JSX.Element => (
  <aside className="citation-card" aria-label="引用内容">
    <div className="citation-card-header">
      <strong>引用内容</strong>
      <span>{pageLabel(citation)}</span>
    </div>
    <blockquote>“{citation.quote}”</blockquote>
    <p>{citation.rationale}</p>
    {onReturnToSource && (
      <button type="button" className="citation-return-button" onClick={onReturnToSource}>
        回到来源
      </button>
    )}
  </aside>
)
