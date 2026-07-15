// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { expect, it, vi } from 'vitest'

import { FilePickerButton } from './FilePickerButton'
import { IconButton } from './IconButton'
import { Switch } from './Switch'

it('exposes a fixed icon button by its localized label', async () => {
  const onClick = vi.fn()
  render(<IconButton icon="panel-left" label="收起主侧栏" onClick={onClick} />)

  await userEvent.setup().click(screen.getByRole('button', { name: '收起主侧栏' }))

  expect(onClick).toHaveBeenCalledOnce()
})

it('opens a hidden image input from a semantic button and reports the selected filename', async () => {
  const onFile = vi.fn()
  render(<FilePickerButton label="选择导师头像" accept="image/png" onFile={onFile} />)
  const input = screen.getByLabelText('选择导师头像 文件输入')
  const click = vi.spyOn(input, 'click')

  expect(input.className).toContain('visually-hidden-file-input')
  await userEvent.setup().click(screen.getByRole('button', { name: '选择导师头像' }))
  expect(click).toHaveBeenCalledOnce()

  const file = new File(['image'], 'mentor.png', { type: 'image/png' })
  fireEvent.change(input, { target: { files: [file] } })

  expect(onFile).toHaveBeenCalledWith(file)
  expect(screen.getByText('mentor.png')).toBeTruthy()
})

it('renders an accessible boolean switch without native checkbox chrome', async () => {
  const onCheckedChange = vi.fn()
  render(<Switch label="自动滚动到新消息" checked onCheckedChange={onCheckedChange} />)
  const control = screen.getByRole('switch', { name: '自动滚动到新消息' })

  expect(control.getAttribute('aria-checked')).toBe('true')
  await userEvent.setup().click(control)

  expect(onCheckedChange).toHaveBeenCalledWith(false)
})
