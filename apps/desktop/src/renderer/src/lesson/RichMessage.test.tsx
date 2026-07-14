// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { RichMessage } from './RichMessage'

afterEach(() => cleanup())

describe('RichMessage', () => {
  it('renders inline and display LaTeX in tutor and learner messages', () => {
    const { container, rerender } = render(
      <RichMessage
        role="tutor"
        markdown={'行内公式 $a=\\sum_{i=1}^{N}i^2$。\n\n$$\n\\int_0^1 x^2 dx\n$$'}
      />,
    )

    expect(container.querySelectorAll('.katex')).toHaveLength(2)
    expect(container.querySelector('.katex-display')).toBeTruthy()

    rerender(<RichMessage role="learner" markdown={'我的推导是 $y=x^2$。'} />)
    expect(container.querySelector('.katex')).toBeTruthy()
  })

  it('renders GFM tables, code, and safe external links', () => {
    const { container } = render(
      <RichMessage
        role="tutor"
        markdown={
          '| 概念 | 含义 |\n| --- | --- |\n| 映射 | 对应关系 |\n\n`const x = 1`\n\n[资料](https://example.com)'
        }
      />,
    )

    expect(screen.getByRole('table').textContent).toContain('映射')
    expect(container.querySelector('code')?.textContent).toBe('const x = 1')
    expect(screen.getByRole('link', { name: '资料' }).getAttribute('href')).toBe(
      'https://example.com',
    )
    expect(screen.getByRole('link', { name: '资料' }).getAttribute('rel')).toContain('noopener')
  })

  it('drops raw HTML, scripts, event handlers, and unsafe URLs', () => {
    const { container } = render(
      <RichMessage
        role="learner"
        markdown={
          '安全正文<script>alert(1)</script><img src=x onerror="alert(2)"> [危险](javascript:alert(3))'
        }
      />,
    )

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.innerHTML).not.toContain('onerror')
    expect(container.innerHTML).not.toContain('javascript:')
    expect(container.textContent).toContain('安全正文')
  })

  it('separates tutor narration as muted italics from normal response Markdown', () => {
    const { container } = render(
      <RichMessage
        role="tutor"
        narration="她在原文旁画了一条线。"
        markdown="这个 **判断** 的依据是什么？"
      />,
    )

    const narration = container.querySelector('.rich-message-narration')
    expect(narration?.querySelector('em')?.textContent).toBe('她在原文旁画了一条线。')
    expect(screen.getByText('判断').tagName).toBe('STRONG')
    expect(container.querySelector('.rich-message-body')?.textContent).toContain(
      '这个 判断 的依据是什么？',
    )
  })
})
