import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_WORKSPACE_LAYOUT,
  fitWorkspaceLayoutToViewport,
  maximumCombinedSidebarWidth,
  normalizeWorkspaceLayout,
  readWorkspaceLayout,
  resizeWorkspaceLayout,
  toggleAllSidebars,
  toggleContextualSidebar,
  togglePrimarySidebar,
  writeWorkspaceLayout,
} from './workspace-layout'

describe('workspace layout policy', () => {
  it('normalizes missing and corrupt persisted values', () => {
    expect(normalizeWorkspaceLayout(undefined)).toEqual(DEFAULT_WORKSPACE_LAYOUT)
    expect(
      normalizeWorkspaceLayout({
        primaryWidth: -20,
        contextualWidth: Number.NaN,
        primaryCollapsed: 'yes',
      }),
    ).toEqual(DEFAULT_WORKSPACE_LAYOUT)
  })

  it('caps combined expanded width at one half of the viewport', () => {
    const resized = resizeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT, {
      boundary: 'contextual',
      deltaX: 1000,
      viewportWidth: 1200,
    })

    expect(resized.primaryWidth + resized.contextualWidth).toBeLessThanOrEqual(
      maximumCombinedSidebarWidth(1200),
    )
  })

  it('keeps both expanded sidebars usable at the minimum desktop width', () => {
    const resized = resizeWorkspaceLayout(DEFAULT_WORKSPACE_LAYOUT, {
      boundary: 'primary',
      deltaX: 1000,
      viewportWidth: 880,
    })

    expect(resized.primaryWidth + resized.contextualWidth).toBeLessThanOrEqual(428)
    expect(resized.primaryWidth).toBeGreaterThanOrEqual(176)
    expect(resized.contextualWidth).toBeGreaterThanOrEqual(220)
  })

  it('derives a capped display layout without overwriting wider saved preferences', () => {
    const preferred = { ...DEFAULT_WORKSPACE_LAYOUT, primaryWidth: 300, contextualWidth: 360 }
    const displayed = fitWorkspaceLayoutToViewport(preferred, 880)

    expect(displayed.primaryWidth + displayed.contextualWidth).toBeLessThanOrEqual(428)
    expect(preferred).toMatchObject({ primaryWidth: 300, contextualWidth: 360 })
  })

  it('uses only visible sidebar widths when one sidebar is collapsed', () => {
    const preferred = {
      ...DEFAULT_WORKSPACE_LAYOUT,
      primaryWidth: 600,
      contextualCollapsed: true,
    }
    const displayed = fitWorkspaceLayoutToViewport(preferred, 880)

    expect(displayed.primaryWidth).toBe(428)
    expect(displayed.contextualWidth).toBe(preferred.contextualWidth)
  })

  it('collapses both sidebars and restores their previous independent states', () => {
    const starting = {
      ...DEFAULT_WORKSPACE_LAYOUT,
      primaryCollapsed: false,
      contextualCollapsed: true,
    }

    const collapsed = toggleAllSidebars(starting)
    expect(collapsed.primaryCollapsed).toBe(true)
    expect(collapsed.contextualCollapsed).toBe(true)

    expect(toggleAllSidebars(collapsed)).toMatchObject({
      primaryCollapsed: false,
      contextualCollapsed: true,
    })
  })

  it('toggles primary and contextual sidebars independently', () => {
    expect(togglePrimarySidebar(DEFAULT_WORKSPACE_LAYOUT).primaryCollapsed).toBe(true)
    expect(toggleContextualSidebar(DEFAULT_WORKSPACE_LAYOUT).contextualCollapsed).toBe(true)
  })

  it('round trips valid storage and falls back for malformed JSON', () => {
    const value = { ...DEFAULT_WORKSPACE_LAYOUT, primaryWidth: 260 }
    const storage = new Map<string, string>()
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, serialized: string) => storage.set(key, serialized),
    }

    expect(writeWorkspaceLayout(adapter, value)).toBe(true)
    expect(readWorkspaceLayout(adapter)).toEqual(value)

    storage.set('deepstorming.workspace-layout.v1', '{bad json')
    expect(readWorkspaceLayout(adapter)).toEqual(DEFAULT_WORKSPACE_LAYOUT)
  })

  it('does not crash when layout preferences cannot be written', () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new Error('quota exceeded')
      }),
    }

    expect(writeWorkspaceLayout(storage, DEFAULT_WORKSPACE_LAYOUT)).toBe(false)
  })
})
