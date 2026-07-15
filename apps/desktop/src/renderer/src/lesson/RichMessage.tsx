import 'katex/dist/katex.min.css'

import type { DocumentFigureDto, LessonTutorCitationDto } from '@deepstorming/contracts'
import React from 'react'
import Markdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { richMessageSchema } from './rich-message-schema'
import { CitationCard } from './CitationCard'
import { FigureCard } from './FigureCard'

type RichMessageProps = Readonly<{
  role: 'system' | 'tutor' | 'learner'
  markdown: string
  narration?: string | null | undefined
  citations?: readonly LessonTutorCitationDto[] | undefined
  onReturnToCitation?: ((citation: LessonTutorCitationDto) => void) | undefined
  documentId?: string | undefined
  figureReferences?: readonly Readonly<{ figureId: string; rationale: string }>[] | undefined
  onReturnToFigure?: ((figure: DocumentFigureDto) => void) | undefined
}>

const components: Components = {
  a: ({ node: _node, ...properties }) => (
    <a {...properties} target="_blank" rel="noopener noreferrer" />
  ),
}

export const RichMessage = ({
  role,
  markdown,
  narration,
  citations = [],
  onReturnToCitation,
  documentId,
  figureReferences = [],
  onReturnToFigure,
}: RichMessageProps): React.JSX.Element => (
  <div className={`rich-message rich-message-${role}`}>
    {narration && (
      <p className="rich-message-narration">
        <em>{narration}</em>
      </p>
    )}
    <div className="rich-message-body">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeSanitize, richMessageSchema],
          [rehypeKatex, { throwOnError: false }],
        ]}
        components={components}
      >
        {markdown}
      </Markdown>
    </div>
    {citations.length > 0 && (
      <div className="rich-message-citations">
        {citations.map((citation) => (
          <CitationCard
            key={citation.chunkId}
            citation={citation}
            onReturnToSource={onReturnToCitation ? () => onReturnToCitation(citation) : undefined}
          />
        ))}
      </div>
    )}
    {documentId !== undefined && figureReferences.length > 0 && (
      <div className="rich-message-figures">
        {figureReferences.map((reference) => (
          <FigureCard
            key={reference.figureId}
            documentId={documentId}
            figureId={reference.figureId}
            rationale={reference.rationale}
            {...(onReturnToFigure === undefined ? {} : { onReturnToSource: onReturnToFigure })}
          />
        ))}
      </div>
    )}
  </div>
)
