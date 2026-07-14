import 'katex/dist/katex.min.css'

import React from 'react'
import Markdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

import { richMessageSchema } from './rich-message-schema'

type RichMessageProps = Readonly<{
  role: 'system' | 'tutor' | 'learner'
  markdown: string
  narration?: string | null | undefined
}>

const components: Components = {
  a: ({ node: _node, ...properties }) => (
    <a {...properties} target="_blank" rel="noopener noreferrer" />
  ),
}

export const RichMessage = ({ role, markdown, narration }: RichMessageProps): React.JSX.Element => (
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
  </div>
)
