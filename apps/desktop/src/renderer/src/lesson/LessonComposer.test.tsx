// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LessonComposer } from './LessonComposer'

afterEach(() => cleanup())

type ComposerState = React.ComponentProps<typeof LessonComposer>['state']

const Harness = ({
  initial = '',
  state = { status: 'idle' },
  onSubmit = vi.fn(),
  onCancel = vi.fn(),
}: {
  initial?: string
  state?: ComposerState
  onSubmit?: () => void
  onCancel?: () => void
}) => {
  const [value, setValue] = useState(initial)
  return (
    <LessonComposer
      value={value}
      state={state}
      onChange={setValue}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  )
}

describe('LessonComposer', () => {
  it('rejects whitespace and announces a stable validation message', async () => {
    const submit = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial="   " onSubmit={submit} />)

    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(submit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('请输入回答。')
  })

  it('submits once with Enter while Shift+Enter inserts a newline', async () => {
    const submit = vi.fn()
    const user = userEvent.setup()
    render(<Harness initial="回答" onSubmit={submit} />)
    const editor = screen.getByRole('textbox', { name: '你的回答' }) as HTMLTextAreaElement

    await user.type(editor, '{Shift>}{Enter}{/Shift}补充')
    expect(submit).not.toHaveBeenCalled()
    expect(editor.value).toContain('\n补充')

    await user.type(editor, '{Enter}')
    expect(submit).toHaveBeenCalledOnce()
  })

  it('does not submit during Chinese input composition', () => {
    const submit = vi.fn()
    render(<Harness initial="回答" onSubmit={submit} />)
    const editor = screen.getByRole('textbox', { name: '你的回答' })

    fireEvent.keyDown(editor, { key: 'Enter', isComposing: true })
    expect(submit).not.toHaveBeenCalled()
  })

  it('disables sending, exposes cancellation and enforces the character limit', async () => {
    const cancel = vi.fn()
    const user = userEvent.setup()
    render(
      <Harness initial={'a'.repeat(1000)} state={{ status: 'submitting' }} onCancel={cancel} />,
    )
    const editor = screen.getByRole('textbox', { name: '你的回答' }) as HTMLTextAreaElement

    expect(editor.disabled).toBe(true)
    expect(editor.maxLength).toBe(1000)
    expect(screen.getByRole('button', { name: '发送中…' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '取消生成' }))
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('preserves a failed draft and clears it after success', () => {
    const { rerender } = render(
      <Harness initial="需要重试的回答" state={{ status: 'error', message: '发送失败。' }} />,
    )
    expect((screen.getByRole('textbox', { name: '你的回答' }) as HTMLTextAreaElement).value).toBe(
      '需要重试的回答',
    )
    expect(screen.getByRole('alert').textContent).toContain('发送失败。')

    rerender(
      <Harness key="sent" initial="" state={{ status: 'success', message: '回答已发送。' }} />,
    )
    expect((screen.getByRole('textbox', { name: '你的回答' }) as HTMLTextAreaElement).value).toBe(
      '',
    )
    expect(screen.getByRole('status').textContent).toContain('回答已发送。')
  })
})
