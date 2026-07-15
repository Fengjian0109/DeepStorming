import { describe, expect, it, vi } from 'vitest'

import {
  COLLAPSED_RAIL_WIDTH,
  createDefaultWorkspaceLayout,
  fitWorkspaceLayoutToViewport,
  maximumCombinedSidebarWidth,
  navigatePrimarySidebar,
  normalizeWorkspaceLayout,
  readWorkspaceLayout,
  resizeWorkspaceLayout,
  toggleContextualSidebar,
  togglePrimarySidebar,
  writeWorkspaceLayout,
} from './workspace-layout'

describe('workspace layout policy', () => {
  it('starts primary-only and targets forty percent when context opens', () => {
    const layout = createDefaultWorkspaceLayout(1600)

    expect(layout).toMatchObject({ primaryCollapsed: false, contextualCollapsed: true })
    expect(layout.primaryWidth + layout.contextualWidth).toBeCloseTo(640, 0)
    expect(COLLAPSED_RAIL_WIDTH).toBe(48)
  })

  it('forces the contextual child closed when primary collapses', () => {
    const open = { ...createDefaultWorkspaceLayout(1600), contextualCollapsed: false }

    expect(togglePrimarySidebar(open)).toMatchObject({
      primaryCollapsed: true,
      contextualCollapsed: true,
    })
    expect(togglePrimarySidebar(togglePrimarySidebar(open))).toMatchObject({
      primaryCollapsed: false,
      contextualCollapsed: true,
    })
  })

  it('uses the selected primary item as a reversible contextual toggle', () => {
    const closed = createDefaultWorkspaceLayout(1600)
    const opened = navigatePrimarySidebar(closed, true)

    expect(opened.contextualCollapsed).toBe(false)
    expect(navigatePrimarySidebar(opened, true).contextualCollapsed).toBe(true)
    expect(navigatePrimarySidebar(opened, false).contextualCollapsed).toBe(false)
  })

  it('never lets expanded sidebars exceed half of the viewport', () => {
    const resized = resizeWorkspaceLayout(
      { ...createDefaultWorkspaceLayout(1600), contextualCollapsed: false },
      { boundary: 'contextual', deltaX: 5000, viewportWidth: 1600 },
    )

    expect(resized.primaryWidth + resized.contextualWidth).toBeLessThanOrEqual(
      maximumCombinedSidebarWidth(1600),
    )
  })

  it('does not open a contextual child while primary is collapsed', () => {
    const collapsed = togglePrimarySidebar(createDefaultWorkspaceLayout(1600))

    expect(toggleContextualSidebar(collapsed)).toEqual(collapsed)
  })

  it('collapses context first when both minimum widths cannot fit', () => {
    const preferred = {
      ...createDefaultWorkspaceLayout(1600),
      primaryWidth: 300,
      contextualWidth: 360,
      contextualCollapsed: false,
    }
    const displayed = fitWorkspaceLayoutToViewport(preferred, 760)

    expect(displayed.contextualCollapsed).toBe(true)
    expect(displayed.contextualWidth).toBe(360)
  })

  it('normalizes corrupt persisted values against the current viewport default', () => {
    expect(normalizeWorkspaceLayout(undefined, 1600)).toEqual(createDefaultWorkspaceLayout(1600))
    expect(
      normalizeWorkspaceLayout(
        {
          primaryWidth: -20,
          contextualWidth: Number.NaN,
          primaryCollapsed: 'yes',
        },
        1600,
      ),
    ).toEqual(createDefaultWorkspaceLayout(1600))
  })

  it('round trips valid storage and falls back for malformed JSON', () => {
    const value = { ...createDefaultWorkspaceLayout(1600), primaryWidth: 260 }
    const storage = new Map<string, string>()
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, serialized: string) => storage.set(key, serialized),
    }

    expect(writeWorkspaceLayout(adapter, value)).toBe(true)
    expect(readWorkspaceLayout(adapter, 1600)).toEqual(value)

    storage.set('deepstorming.workspace-layout.v2', '{bad json')
    expect(readWorkspaceLayout(adapter, 1600)).toEqual(createDefaultWorkspaceLayout(1600))
  })

  it('does not crash when layout preferences cannot be written', () => {
    const storage = {
      setItem: vi.fn(() => {
        throw new Error('quota exceeded')
      }),
    }

    expect(writeWorkspaceLayout(storage, createDefaultWorkspaceLayout(1600))).toBe(false)
  })
})
