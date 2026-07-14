// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DocumentCreateDialog } from './DocumentCreateDialog'

afterEach(cleanup)

describe('DocumentCreateDialog', () => {
  it('submits through DocumentForm and closes after a successful save', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSubmit = vi.fn().mockResolvedValue(true)
    render(
      <DocumentCreateDialog
        open
        saving={false}
        onClose={onClose}
        onSubmit={onSubmit}
        onError={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('标题'), 'Notes')
    await user.type(screen.getByLabelText('正文'), 'body')
    await user.click(screen.getByRole('button', { name: '保存文档' }))

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Notes',
      plainText: 'body',
      sourceKind: 'pasted_text',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps the dialog open when saving fails', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <DocumentCreateDialog
        open
        saving={false}
        onClose={onClose}
        onSubmit={vi.fn().mockResolvedValue(false)}
        onError={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('标题'), 'Notes')
    await user.type(screen.getByLabelText('正文'), 'body')
    await user.click(screen.getByRole('button', { name: '保存文档' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '添加文本资料' })).toBeTruthy()
    expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toBe('body')
  })

  it('supports cancel and Escape only while no save is running', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(
      <DocumentCreateDialog
        open
        saving={false}
        onClose={onClose}
        onSubmit={vi.fn().mockResolvedValue(false)}
        onError={vi.fn()}
      />,
    )

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    onClose.mockClear()
    rerender(
      <DocumentCreateDialog
        open
        saving
        onClose={onClose}
        onSubmit={vi.fn().mockResolvedValue(false)}
        onError={vi.fn()}
      />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: '取消' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('restores focus to the trigger after closing', async () => {
    const user = userEvent.setup()
    const Harness = () => {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            添加资料
          </button>
          <DocumentCreateDialog
            open={open}
            saving={false}
            onClose={() => setOpen(false)}
            onSubmit={vi.fn().mockResolvedValue(false)}
            onError={vi.fn()}
          />
        </>
      )
    }
    render(<Harness />)

    const trigger = screen.getByRole('button', { name: '添加资料' })
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(document.activeElement).toBe(trigger)
  })
})
