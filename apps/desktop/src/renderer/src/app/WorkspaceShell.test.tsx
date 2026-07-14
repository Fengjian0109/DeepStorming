// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WORKSPACE_LAYOUT_STORAGE_KEY } from './workspace-layout'
import { WorkspaceContextual, WorkspaceShell } from './WorkspaceShell'

const renderShell = (viewportWidth = 1200) =>
  render(
    <WorkspaceShell
      page="documents"
      onNavigate={vi.fn()}
      primaryHeader={<span>DeepStorming</span>}
      contextualLabel="文档导航"
      viewportWidth={viewportWidth}
    >
      <WorkspaceContextual>
        <button type="button">打开文档：Notes</button>
      </WorkspaceContextual>
      <p>主内容</p>
    </WorkspaceShell>,
  )

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('WorkspaceShell', () => {
  it('renders top-level and contextual navigation with the main content', async () => {
    renderShell()

    expect(screen.getByRole('complementary', { name: '主侧栏' })).toBeTruthy()
    expect(await screen.findByRole('complementary', { name: '文档导航' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeTruthy()
    expect(screen.getByText('主内容')).toBeTruthy()
    expect(await screen.findByRole('button', { name: '打开文档：Notes' })).toBeTruthy()
  })

  it('collapses sidebars independently and restores previous states after collapse all', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(screen.getByRole('button', { name: '收起副侧栏' }))
    expect(screen.queryByRole('complementary', { name: '文档导航' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '收起全部侧栏' }))
    expect(screen.getByRole('button', { name: '恢复侧栏' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '恢复侧栏' }))
    expect(screen.getByRole('complementary', { name: '主侧栏' })).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: '文档导航' })).toBeNull()
    expect(screen.getByRole('button', { name: '展开副侧栏' })).toBeTruthy()
  })

  it('persists pointer resizing without exceeding half of the viewport', async () => {
    renderShell()
    const separator = screen.getByRole('separator', { name: '调整副侧栏宽度' })

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 520 })
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 1520 })
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 1520 })

    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY) ?? '{}',
      ) as { primaryWidth: number; contextualWidth: number }
      expect(saved.primaryWidth + saved.contextualWidth).toBeLessThanOrEqual(600)
    })
    expect(separator.getAttribute('aria-valuemax')).toBe('424')
  })

  it('supports keyboard resizing in sixteen pixel steps', async () => {
    renderShell()
    const separator = screen.getByRole('separator', { name: '调整主侧栏宽度' })

    fireEvent.keyDown(separator, { key: 'ArrowRight' })

    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY) ?? '{}',
      ) as { primaryWidth: number }
      expect(saved.primaryWidth).toBe(236)
    })
  })

  it('keeps main content available when both sidebars are collapsed', async () => {
    const user = userEvent.setup()
    renderShell()

    await user.click(screen.getByRole('button', { name: '收起全部侧栏' }))

    expect(screen.getByText('主内容')).toBeTruthy()
    expect(screen.getByRole('button', { name: '恢复侧栏' })).toBeTruthy()
  })
})
