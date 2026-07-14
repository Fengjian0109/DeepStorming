import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  COLLAPSED_RAIL_WIDTH,
  MAX_COMBINED_SIDEBAR_RATIO,
  MIN_CONTEXTUAL_WIDTH,
  MIN_PRIMARY_WIDTH,
  WORKSPACE_LAYOUT_STORAGE_KEY,
  fitWorkspaceLayoutToViewport,
  readWorkspaceLayout,
  resizeWorkspaceLayout,
  toggleAllSidebars,
  toggleContextualSidebar,
  togglePrimarySidebar,
  writeWorkspaceLayout,
  type WorkspaceLayout,
} from './workspace-layout'

export type WorkspacePage = 'documents' | 'lessons' | 'settings'

type WorkspaceShellProps = Readonly<{
  page: WorkspacePage
  onNavigate: (page: WorkspacePage) => void
  primaryHeader: React.ReactNode
  contextualLabel: string
  children: React.ReactNode
  viewportWidth?: number
}>

type DragState = Readonly<{
  boundary: 'primary' | 'contextual'
  pointerId: number
  startX: number
  startLayout: WorkspaceLayout
}>

const ContextualRootContext = createContext<HTMLElement | null | undefined>(undefined)

export const WorkspaceContextual = ({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactPortal | React.JSX.Element | null => {
  const root = useContext(ContextualRootContext)
  if (root === undefined) return <>{children}</>
  return root === null ? null : createPortal(children, root)
}

const navigationLabels: Readonly<Record<WorkspacePage, string>> = {
  documents: '文档库',
  lessons: '课堂',
  settings: '设置',
}

const COMPACT_WORKSPACE_WIDTH = 900

const readInitialLayout = (viewportWidth: number): WorkspaceLayout => {
  const stored = readWorkspaceLayout(window.localStorage)
  try {
    if (window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY) !== null) return stored
  } catch {
    return stored
  }
  return viewportWidth < COMPACT_WORKSPACE_WIDTH ? { ...stored, contextualCollapsed: true } : stored
}

export const WorkspaceShell = ({
  page,
  onNavigate,
  primaryHeader,
  contextualLabel,
  children,
  viewportWidth: controlledViewportWidth,
}: WorkspaceShellProps): React.JSX.Element => {
  const initialViewportWidth = controlledViewportWidth ?? window.innerWidth
  const [layout, setLayout] = useState<WorkspaceLayout>(() =>
    readInitialLayout(initialViewportWidth),
  )
  const [contextualRoot, setContextualRoot] = useState<HTMLDivElement | null>(null)
  const [measuredViewportWidth, setMeasuredViewportWidth] = useState(window.innerWidth)
  const [dragState, setDragState] = useState<DragState>()
  const viewportWidth = controlledViewportWidth ?? measuredViewportWidth

  useEffect(() => {
    if (controlledViewportWidth !== undefined) return

    const measure = () => setMeasuredViewportWidth(window.innerWidth)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [controlledViewportWidth])

  useEffect(() => {
    writeWorkspaceLayout(window.localStorage, layout)
  }, [layout])

  const displayedLayout = useMemo(
    () => fitWorkspaceLayoutToViewport(layout, viewportWidth),
    [layout, viewportWidth],
  )
  const primaryColumnWidth = displayedLayout.primaryCollapsed
    ? COLLAPSED_RAIL_WIDTH
    : displayedLayout.primaryWidth
  const contextualColumnWidth = displayedLayout.contextualCollapsed
    ? 0
    : displayedLayout.contextualWidth
  const bothCollapsed = layout.primaryCollapsed && layout.contextualCollapsed
  const maximumCombinedWidth = viewportWidth * MAX_COMBINED_SIDEBAR_RATIO

  const resizeBy = (boundary: 'primary' | 'contextual', deltaX: number) => {
    setLayout((current) =>
      resizeWorkspaceLayout(fitWorkspaceLayoutToViewport(current, viewportWidth), {
        boundary,
        deltaX,
        viewportWidth,
      }),
    )
  }

  const startDrag = (
    boundary: 'primary' | 'contextual',
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    setDragState({
      boundary,
      pointerId: event.pointerId,
      startX: event.clientX,
      startLayout: displayedLayout,
    })
  }

  const continueDrag = (
    boundary: 'primary' | 'contextual',
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (
      dragState === undefined ||
      dragState.boundary !== boundary ||
      dragState.pointerId !== event.pointerId
    ) {
      return
    }

    setLayout(
      resizeWorkspaceLayout(dragState.startLayout, {
        boundary,
        deltaX: event.clientX - dragState.startX,
        viewportWidth,
      }),
    )
  }

  const stopDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState?.pointerId !== event.pointerId) return
    if (typeof event.currentTarget.releasePointerCapture === 'function') {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragState(undefined)
  }

  const resizeWithKeyboard = (
    boundary: 'primary' | 'contextual',
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    resizeBy(boundary, event.key === 'ArrowLeft' ? -16 : 16)
  }

  return (
    <ContextualRootContext.Provider value={contextualRoot}>
      <div
        className="workspace-shell"
        style={
          {
            '--primary-sidebar-width': primaryColumnWidth + 'px',
            '--contextual-sidebar-width': contextualColumnWidth + 'px',
          } as React.CSSProperties
        }
      >
        <aside
          className={`workspace-primary ${layout.primaryCollapsed ? 'workspace-primary-collapsed' : ''}`}
          aria-label="主侧栏"
        >
          {layout.primaryCollapsed ? (
            <button
              type="button"
              className="workspace-rail-button"
              aria-label="展开主侧栏"
              onClick={() => setLayout((current) => togglePrimarySidebar(current))}
            >
              DS
            </button>
          ) : (
            <>
              <div className="workspace-primary-header">{primaryHeader}</div>
              <nav aria-label="主导航" className="workspace-navigation">
                {(Object.keys(navigationLabels) as WorkspacePage[]).map((target) => (
                  <button
                    key={target}
                    type="button"
                    className={`nav-item ${page === target ? 'nav-item-active' : ''}`}
                    aria-current={page === target ? 'page' : undefined}
                    onClick={() => onNavigate(target)}
                  >
                    {navigationLabels[target]}
                  </button>
                ))}
              </nav>
              <button
                type="button"
                className="workspace-collapse-button"
                onClick={() => setLayout((current) => togglePrimarySidebar(current))}
              >
                收起主侧栏
              </button>
            </>
          )}
        </aside>

        <div
          className="workspace-separator"
          role="separator"
          aria-label="调整主侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_PRIMARY_WIDTH}
          aria-valuemax={Math.floor(maximumCombinedWidth - MIN_CONTEXTUAL_WIDTH)}
          aria-valuenow={Math.round(displayedLayout.primaryWidth)}
          aria-hidden={layout.primaryCollapsed}
          tabIndex={layout.primaryCollapsed ? -1 : 0}
          onPointerDown={(event) => startDrag('primary', event)}
          onPointerMove={(event) => continueDrag('primary', event)}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onKeyDown={(event) => resizeWithKeyboard('primary', event)}
        />

        <aside
          className={`workspace-contextual ${layout.contextualCollapsed ? 'workspace-contextual-collapsed' : ''}`}
          aria-label={contextualLabel}
          aria-hidden={layout.contextualCollapsed}
        >
          {!layout.contextualCollapsed && (
            <>
              <div className="workspace-contextual-content" ref={setContextualRoot} />
              <button
                type="button"
                className="workspace-collapse-button"
                onClick={() => setLayout((current) => toggleContextualSidebar(current))}
              >
                收起副侧栏
              </button>
            </>
          )}
        </aside>

        <div
          className="workspace-separator"
          role="separator"
          aria-label="调整副侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_CONTEXTUAL_WIDTH}
          aria-valuemax={Math.floor(maximumCombinedWidth - MIN_PRIMARY_WIDTH)}
          aria-valuenow={Math.round(displayedLayout.contextualWidth)}
          aria-hidden={layout.contextualCollapsed}
          tabIndex={layout.contextualCollapsed ? -1 : 0}
          onPointerDown={(event) => startDrag('contextual', event)}
          onPointerMove={(event) => continueDrag('contextual', event)}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
          onKeyDown={(event) => resizeWithKeyboard('contextual', event)}
        />

        <main className="workspace-main">
          <div className="workspace-sidebar-controls" aria-label="侧栏控制">
            {layout.contextualCollapsed && !bothCollapsed && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setLayout((current) => toggleContextualSidebar(current))}
              >
                展开副侧栏
              </button>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={() => setLayout((current) => toggleAllSidebars(current))}
            >
              {bothCollapsed ? '恢复侧栏' : '收起全部侧栏'}
            </button>
          </div>
          <div className="workspace-main-content">{children}</div>
        </main>
      </div>
    </ContextualRootContext.Provider>
  )
}
