// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WORKSPACE_LAYOUT_STORAGE_KEY } from './workspace-layout'
import { WorkspaceContextual, WorkspaceShell, type WorkspacePage } from './WorkspaceShell'

const renderShell = (viewportWidth = 1200, onNavigate = vi.fn()) =>
  render(
    <WorkspaceShell
      page="documents"
      onNavigate={onNavigate}
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
  it('starts with primary only and toggles context from the selected primary target', async () => {
    const user = userEvent.setup()
    renderShell(1600)

    expect(screen.queryByRole('complementary', { name: '文档导航' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '文档库' }))
    expect(await screen.findByRole('complementary', { name: '文档导航' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: '打开文档：Notes' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '文档库' }))
    expect(screen.queryByRole('complementary', { name: '文档导航' })).toBeNull()
  })

  it('collapsing primary forces context closed and leaves one rail restore button', async () => {
    const user = userEvent.setup()
    renderShell(1600)

    await user.click(screen.getByRole('button', { name: '文档库' }))
    await user.click(screen.getByRole('button', { name: '收起主侧栏' }))

    expect(screen.queryByRole('complementary', { name: '文档导航' })).toBeNull()
    expect(screen.getByRole('button', { name: '展开主侧栏' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '收起全部侧栏' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '展开主侧栏' }))
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeTruthy()
    expect(screen.queryByRole('complementary', { name: '文档导航' })).toBeNull()
  })

  it('switches page and keeps context open when another primary target is selected', async () => {
    const onNavigate = vi.fn<(page: WorkspacePage) => void>()
    const user = userEvent.setup()
    renderShell(1600, onNavigate)

    await user.click(screen.getByRole('button', { name: '文档库' }))
    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(onNavigate).toHaveBeenCalledWith('settings')
    expect(screen.getByRole('complementary', { name: '文档导航' })).toBeTruthy()
  })

  it('persists pointer resizing without exceeding half of the viewport', async () => {
    const user = userEvent.setup()
    renderShell()
    await user.click(screen.getByRole('button', { name: '文档库' }))
    const separator = screen.getByRole('separator', { name: '调整副侧栏宽度' })

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 480 })
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 1480 })
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 1480 })

    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY) ?? '{}',
      ) as { primaryWidth: number; contextualWidth: number }
      expect(saved.primaryWidth + saved.contextualWidth).toBeLessThanOrEqual(588)
    })
  })

  it('supports keyboard resizing in sixteen pixel steps', async () => {
    renderShell()
    const separator = screen.getByRole('separator', { name: '调整主侧栏宽度' })

    fireEvent.keyDown(separator, { key: 'ArrowRight' })

    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY) ?? '{}',
      ) as { primaryWidth: number }
      expect(saved.primaryWidth).toBe(196)
    })
  })

  it('collapses context once on a narrow viewport and does not expose a restore action', async () => {
    renderShell(760)

    expect(screen.queryByRole('complementary', { name: '文档导航' })).toBeNull()
    expect(screen.queryByRole('button', { name: '展开副侧栏' })).toBeNull()
    expect(
      globalThis.document.querySelector('[aria-label="调整副侧栏宽度"]')?.getAttribute('tabindex'),
    ).toBe('-1')
  })
})
