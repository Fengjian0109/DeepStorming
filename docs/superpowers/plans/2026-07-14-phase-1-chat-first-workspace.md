# Phase 1 Chat-First Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current tall, card-stacked Renderer with a compact document library and a chat-first classroom inside a hierarchical, collapsible, resizable double-sidebar shell, without changing existing Domain, Application, Infrastructure, IPC, or persisted business data.

**Architecture:** This is a Renderer-only vertical slice. Pure layout policy lives in a framework-free Renderer module; React components compose the global sidebar, contextual sidebar, document workspace, lesson conversation, composer, and information drawer. Existing explicit preload APIs remain the only data boundary. Existing lesson diagnostics, run metadata, evidence, and review data remain available, but move out of the primary conversation stream into an on-demand drawer.

**Tech Stack:** TypeScript 5.9, React 19, Electron 41, electron-vite 5, Vitest 4, Testing Library, Playwright 1.58, CSS Grid/Flexbox, pnpm 11.7.

**Approved design:** `docs/superpowers/specs/2026-07-14-ai-first-learning-workspace-redesign-design.md`

---

## Scope and guardrails

This plan delivers the stable interface foundation required by the later AI-first stages.

Included:

- top-aligned hierarchical primary and contextual sidebars;
- independent sidebar collapse plus one-click collapse/restore;
- pointer-resizable combined sidebar width, capped at 50% of the app viewport;
- persisted layout preferences with safe normalization;
- document import actions at the top of the library;
- compact document detail with no full-text body in the default view;
- explicit PDF/text reader opening and lazy page loading;
- lesson sessions grouped by document in the contextual sidebar;
- conversation-only classroom canvas with a fixed composer;
- evidence, progress, diagnosis, review, and technical data in an information drawer;
- loading, success, error, retry, and cancellation states preserved;
- component and Electron E2E coverage;
- project-status documentation.

Deferred to separately planned stages after this foundation lands:

- strict AI-only tutor orchestration and structured `TutorTurn`;
- mentor/provider/settings screens and avatar persistence;
- Markdown/LaTeX rendering and Claude-like typography;
- PDF figure extraction, matching, and citation cards;
- pace selection, end-class/review lifecycle, exports;
- automatic context compression and token accounting.

Do not:

- import Electron, Node, Application, Domain, Infrastructure, SQLite, or provider SDKs into Renderer;
- change contracts or IPC merely to reshape this UI;
- delete diagnostics, review, evidence, or model-run information;
- read or persist API keys in Renderer state;
- use a generic IPC invoke function;
- call `documents.getPages` when a document card is merely selected.

## Verification commands used throughout

Run focused tests after each red/green cycle:

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/app/workspace-layout.test.ts
```

Run the complete gates before phase completion:

```bash
pnpm check
pnpm test:e2e
```

---

### Task 1: Add a pure, persisted workspace layout policy

**Files:**

- Create: `apps/desktop/src/renderer/src/app/workspace-layout.ts`
- Test: `apps/desktop/src/renderer/src/app/workspace-layout.test.ts`

- [ ] **Step 1: Write failing tests for defaults, normalization, resizing, and collapse/restore**

Create `workspace-layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_WORKSPACE_LAYOUT,
  MAX_COMBINED_SIDEBAR_RATIO,
  fitWorkspaceLayoutToViewport,
  normalizeWorkspaceLayout,
  resizeWorkspaceLayout,
  toggleAllSidebars,
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
      1200 * MAX_COMBINED_SIDEBAR_RATIO,
    )
  })

  it('derives a capped display layout without overwriting wider saved preferences', () => {
    const preferred = { ...DEFAULT_WORKSPACE_LAYOUT, primaryWidth: 300, contextualWidth: 360 }
    const displayed = fitWorkspaceLayoutToViewport(preferred, 880)

    expect(displayed.primaryWidth + displayed.contextualWidth).toBeLessThanOrEqual(440)
    expect(preferred).toMatchObject({ primaryWidth: 300, contextualWidth: 360 })
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
})
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/app/workspace-layout.test.ts
```

Expected: failure because `workspace-layout.ts` does not exist.

- [ ] **Step 3: Implement the pure layout policy**

Create `workspace-layout.ts` with these public types and constants:

```ts
export const WORKSPACE_LAYOUT_STORAGE_KEY = 'deepstorming.workspace-layout.v1'
export const MAX_COMBINED_SIDEBAR_RATIO = 0.5
export const MIN_PRIMARY_WIDTH = 176
export const MIN_CONTEXTUAL_WIDTH = 220
export const COLLAPSED_RAIL_WIDTH = 56

export type WorkspaceLayout = Readonly<{
  primaryWidth: number
  contextualWidth: number
  primaryCollapsed: boolean
  contextualCollapsed: boolean
  restorePrimaryCollapsed: boolean
  restoreContextualCollapsed: boolean
}>

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = {
  primaryWidth: 220,
  contextualWidth: 300,
  primaryCollapsed: false,
  contextualCollapsed: false,
  restorePrimaryCollapsed: false,
  restoreContextualCollapsed: false,
}
```

Implement these exported functions:

```ts
export const normalizeWorkspaceLayout = (value: unknown): WorkspaceLayout => {
  if (typeof value !== 'object' || value === null) return DEFAULT_WORKSPACE_LAYOUT
  const candidate = value as Partial<Record<keyof WorkspaceLayout, unknown>>
  const widthsAreValid =
    typeof candidate.primaryWidth === 'number' &&
    Number.isFinite(candidate.primaryWidth) &&
    candidate.primaryWidth >= MIN_PRIMARY_WIDTH &&
    typeof candidate.contextualWidth === 'number' &&
    Number.isFinite(candidate.contextualWidth) &&
    candidate.contextualWidth >= MIN_CONTEXTUAL_WIDTH
  const booleansAreValid = [
    candidate.primaryCollapsed,
    candidate.contextualCollapsed,
    candidate.restorePrimaryCollapsed,
    candidate.restoreContextualCollapsed,
  ].every((entry) => typeof entry === 'boolean')

  if (!widthsAreValid || !booleansAreValid) return DEFAULT_WORKSPACE_LAYOUT
  return candidate as WorkspaceLayout
}

export const resizeWorkspaceLayout = (
  current: WorkspaceLayout,
  input: Readonly<{
    boundary: 'primary' | 'contextual'
    deltaX: number
    viewportWidth: number
  }>,
): WorkspaceLayout => {
  const maxCombined = input.viewportWidth * MAX_COMBINED_SIDEBAR_RATIO

  if (input.boundary === 'primary') {
    const maxPrimary = maxCombined - MIN_CONTEXTUAL_WIDTH
    const primaryWidth = Math.min(
      Math.max(current.primaryWidth + input.deltaX, MIN_PRIMARY_WIDTH),
      maxPrimary,
    )
    return {
      ...current,
      primaryWidth,
      contextualWidth: Math.min(current.contextualWidth, maxCombined - primaryWidth),
    }
  }

  const maxContextual = maxCombined - MIN_PRIMARY_WIDTH
  const contextualWidth = Math.min(
    Math.max(current.contextualWidth + input.deltaX, MIN_CONTEXTUAL_WIDTH),
    maxContextual,
  )
  return {
    ...current,
    contextualWidth,
    primaryWidth: Math.min(current.primaryWidth, maxCombined - contextualWidth),
  }
}

export const fitWorkspaceLayoutToViewport = (
  preferred: WorkspaceLayout,
  viewportWidth: number,
): WorkspaceLayout => {
  const maxCombined = viewportWidth * MAX_COMBINED_SIDEBAR_RATIO
  if (preferred.primaryCollapsed && preferred.contextualCollapsed) return preferred
  if (preferred.primaryCollapsed) {
    return { ...preferred, contextualWidth: Math.min(preferred.contextualWidth, maxCombined) }
  }
  if (preferred.contextualCollapsed) {
    return { ...preferred, primaryWidth: Math.min(preferred.primaryWidth, maxCombined) }
  }
  return resizeWorkspaceLayout(preferred, {
    boundary: 'contextual',
    deltaX: 0,
    viewportWidth,
  })
}

export const toggleAllSidebars = (current: WorkspaceLayout): WorkspaceLayout => {
  const bothCollapsed = current.primaryCollapsed && current.contextualCollapsed
  if (bothCollapsed) {
    return {
      ...current,
      primaryCollapsed: current.restorePrimaryCollapsed,
      contextualCollapsed: current.restoreContextualCollapsed,
    }
  }

  return {
    ...current,
    restorePrimaryCollapsed: current.primaryCollapsed,
    restoreContextualCollapsed: current.contextualCollapsed,
    primaryCollapsed: true,
    contextualCollapsed: true,
  }
}
```

Also export `readWorkspaceLayout(storage: Pick<Storage, 'getItem'>)` and
`writeWorkspaceLayout(storage: Pick<Storage, 'setItem'>, value)`. Parsing failures must return
`DEFAULT_WORKSPACE_LAYOUT`; write failures must not crash the Renderer.

- [ ] **Step 4: Add storage round-trip and malformed-JSON tests**

Verify valid JSON round-trips and malformed JSON returns defaults. Stub `setItem` to throw and verify
`writeWorkspaceLayout` returns `false`.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/app/workspace-layout.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/app/workspace-layout.ts apps/desktop/src/renderer/src/app/workspace-layout.test.ts
git commit -m "feat: add workspace layout policy"
```

---

### Task 2: Build the shared hierarchical double-sidebar shell

**Files:**

- Create: `apps/desktop/src/renderer/src/app/WorkspaceShell.tsx`
- Create: `apps/desktop/src/renderer/src/app/WorkspaceShell.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Write the shell interaction tests**

The test must render a primary nav, contextual content, and main content. Assert:

- primary and contextual regions are top-aligned landmarks;
- each has its own collapse button;
- “收起全部侧栏” collapses both;
- invoking it again restores the previous independent state;
- pointer resizing writes a persisted width;
- `aria-valuemax` represents half the supplied viewport width;
- keyboard `ArrowLeft` / `ArrowRight` changes a separator by 16 px;
- the main content remains available after both sidebars collapse.

Use a controlled `viewportWidth={1200}` prop in tests so layout tests do not depend on JSDOM.

- [ ] **Step 2: Run the shell test and verify RED**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/app/WorkspaceShell.test.tsx
```

- [ ] **Step 3: Implement the component contract**

Create `WorkspaceShell.tsx` with this public API:

```tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  COLLAPSED_RAIL_WIDTH,
  DEFAULT_WORKSPACE_LAYOUT,
  fitWorkspaceLayoutToViewport,
  readWorkspaceLayout,
  resizeWorkspaceLayout,
  toggleAllSidebars,
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

const ContextualRootContext = createContext<HTMLElement | null>(null)

export const WorkspaceContextual = ({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactPortal | null => {
  const root = useContext(ContextualRootContext)
  return root === null ? null : createPortal(children, root)
}

export const WorkspaceShell = ({
  page,
  onNavigate,
  primaryHeader,
  contextualLabel,
  children,
  viewportWidth: controlledViewportWidth,
}: WorkspaceShellProps): React.JSX.Element => {
  const [layout, setLayout] = useState<WorkspaceLayout>(() =>
    readWorkspaceLayout(window.localStorage),
  )
  const [contextualRoot, setContextualRoot] = useState<HTMLDivElement | null>(null)
  const [measuredViewportWidth, setMeasuredViewportWidth] = useState(window.innerWidth)
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

  const columns = useMemo(() => {
    const displayed = fitWorkspaceLayoutToViewport(layout, viewportWidth)
    return {
      primary: displayed.primaryCollapsed ? COLLAPSED_RAIL_WIDTH : displayed.primaryWidth,
      contextual: displayed.contextualCollapsed ? 0 : displayed.contextualWidth,
    }
  }, [layout, viewportWidth])

  return (
    <ContextualRootContext.Provider value={contextualRoot}>
      <div
        className="workspace-shell"
        style={
          {
            '--primary-sidebar-width': columns.primary + 'px',
            '--contextual-sidebar-width': columns.contextual + 'px',
          } as React.CSSProperties
        }
      >
        <aside className="workspace-primary" aria-label="主侧栏">
          {primaryHeader}
          <nav aria-label="主导航">
            {(['documents', 'lessons', 'settings'] as const).map((target) => (
              <button
                key={target}
                type="button"
                aria-current={page === target ? 'page' : undefined}
                onClick={() => onNavigate(target)}
              >
                {{ documents: '文档库', lessons: '课堂', settings: '设置' }[target]}
              </button>
            ))}
          </nav>
          <button type="button" onClick={() => setLayout(toggleAllSidebars(layout))}>
            {layout.primaryCollapsed && layout.contextualCollapsed ? '恢复侧栏' : '收起全部侧栏'}
          </button>
        </aside>
        <div role="separator" aria-orientation="vertical" tabIndex={0} />
        <aside
          className="workspace-contextual"
          aria-label={contextualLabel}
          aria-hidden={layout.contextualCollapsed}
        >
          <div ref={setContextualRoot} />
        </aside>
        <div role="separator" aria-orientation="vertical" tabIndex={0} />
        <main className="workspace-main">{children}</main>
      </div>
    </ContextualRootContext.Provider>
  )
}
```

Add a local drag state containing `boundary`, `startX`, and `startLayout`. On separator
`pointerdown`, call `setPointerCapture(event.pointerId)` and store that state. On `pointermove`, set
layout with `resizeWorkspaceLayout(drag.startLayout, { boundary: drag.boundary, deltaX:
event.clientX - drag.startX, viewportWidth })`. On `pointerup` and `pointercancel`, clear the drag state.
For keyboard resizing, map `ArrowLeft` to -16 and `ArrowRight` to 16 and call the same pure function.
Do not duplicate clamping math in React. Use:

- `aside aria-label="主侧栏"`;
- `aside aria-label={contextualLabel}`;
- `role="separator"`, `aria-orientation="vertical"`, `tabIndex={0}`;
- buttons named `收起主侧栏`, `收起副侧栏`, and `收起全部侧栏`;
- collapsed buttons named `展开主侧栏`, `展开副侧栏`, and `恢复侧栏`;
- nav items `文档库`, `课堂`, and `设置`;
- CSS custom properties `--primary-sidebar-width` and `--contextual-sidebar-width`.

Do not place page-specific data fetching in this component.

- [ ] **Step 4: Add the shell CSS**

In `global.css`, introduce these structural classes:

```css
.workspace-shell {
  --primary-sidebar-width: 220px;
  --contextual-sidebar-width: 300px;
  display: grid;
  grid-template-columns:
    var(--primary-sidebar-width)
    6px
    var(--contextual-sidebar-width)
    6px
    minmax(0, 1fr);
  height: 100vh;
  min-height: 0;
  overflow: hidden;
}

.workspace-primary,
.workspace-contextual {
  min-height: 0;
  overflow: auto;
  align-self: stretch;
}

.workspace-primary {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.workspace-main {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.workspace-separator {
  cursor: col-resize;
  touch-action: none;
}

.workspace-separator:focus-visible,
.workspace-separator:hover {
  background: var(--color-accent);
}
```

Use existing color variables. Do not duplicate a second color system.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/app/WorkspaceShell.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/app/WorkspaceShell.tsx apps/desktop/src/renderer/src/app/WorkspaceShell.test.tsx apps/desktop/src/renderer/src/styles/global.css
git commit -m "feat: add hierarchical workspace shell"
```

---

### Task 3: Make App the composition point for global and contextual navigation

**Files:**

- Modify: `apps/desktop/src/renderer/src/app/App.tsx`
- Create: `apps/desktop/src/renderer/src/app/App.test.tsx`

- [ ] **Step 1: Write an App composition test**

Mock the three page components. Verify:

- the default page is `文档库`;
- the contextual region says `文档导航`;
- selecting `课堂` changes the contextual label to `课堂与课程记录`;
- selecting `设置` renders the existing `ProviderManager`;
- the runtime status remains visible in the primary sidebar;
- starting a lesson from the document page selects `课堂` and forwards the new lesson id.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/app/App.test.tsx
```

- [ ] **Step 3: Refactor App around WorkspaceShell**

Change the page union to:

```ts
type Page = 'documents' | 'lessons' | 'settings'
```

Compute the page-specific contextual label in App:

```tsx
const contextualLabel = {
  documents: '文档导航',
  lessons: '课堂与课程记录',
  settings: '设置分类',
}[page]
```

`WorkspaceShell` owns the contextual portal root. `DocumentLibrary` and `LessonWorkspace` render their
own contextual navigation through `WorkspaceContextual`, so their request/selection state is not lifted
into App. The settings page renders this exact contextual node:

```tsx
<WorkspaceContextual>
  <nav aria-label="设置分类">
    <span aria-current="page">模型与 Provider</span>
  </nav>
</WorkspaceContextual>
```

Keep all existing `onLessonStarted` and `onReturnToEvidence` behavior.

Rename user-facing `Provider` navigation to `设置`; the settings main panel may still render
`ProviderManager` during this phase.

- [ ] **Step 4: Run App and existing page tests**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/app/App.test.tsx apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src/app/App.tsx apps/desktop/src/renderer/src/app/App.test.tsx
git commit -m "refactor: compose pages in workspace shell"
```

---

### Task 4: Move all document creation actions into a top toolbar and dialog

**Files:**

- Create: `apps/desktop/src/renderer/src/document/DocumentCreateDialog.tsx`
- Create: `apps/desktop/src/renderer/src/document/DocumentCreateDialog.test.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentLibrary.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx`

- [ ] **Step 1: Write the dialog behavior tests**

Cover:

- `粘贴文本 / 导入 TXT、MD` opens the dialog;
- the existing `DocumentForm` is rendered inside it;
- successful save closes it;
- failed save keeps it open and exposes the supplied error;
- `取消` closes only when no save is running;
- Escape closes only when no save is running;
- focus returns to the toolbar trigger after close.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/document/DocumentCreateDialog.test.tsx
```

- [ ] **Step 3: Implement the dialog wrapper**

Use this contract:

```tsx
type DocumentCreateDialogProps = Readonly<{
  open: boolean
  saving: boolean
  onClose: () => void
  onSubmit: React.ComponentProps<typeof DocumentForm>['onSubmit']
  onError: (message: string) => void
}>
```

Render `role="dialog"`, `aria-modal="true"`, and heading `添加文本资料`. Reuse
`DocumentForm`; do not duplicate its file-reading or validation logic.

- [ ] **Step 4: Replace the tall left form with a toolbar**

At the top of `DocumentLibrary`, render:

```tsx
<div className="document-import-toolbar" role="toolbar" aria-label="添加学习资料">
  <button type="button" onClick={() => setCreateDialogOpen(true)}>
    粘贴文本 / 导入 TXT、MD
  </button>
  <label className="file-picker">
    <span>{asyncState.status === 'loading' ? '处理中…' : '导入可选择文字的 PDF'}</span>
    <input type="file" accept=".pdf,application/pdf" onChange={importPdf} />
  </label>
</div>
```

The PDF control must appear before the document list in DOM order. Its help text must explicitly say
`第一版仅支持带可选择文字层的 PDF，不支持扫描件`.

- [ ] **Step 5: Update DocumentLibrary tests**

Replace assertions tied to the old permanent form with assertions for the toolbar and modal. Preserve tests
for successful/failed text creation and PDF import.

- [ ] **Step 6: Run focused tests and commit**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/document/DocumentCreateDialog.test.tsx apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx
git add apps/desktop/src/renderer/src/document/DocumentCreateDialog.tsx apps/desktop/src/renderer/src/document/DocumentCreateDialog.test.tsx apps/desktop/src/renderer/src/document/DocumentLibrary.tsx apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx
git commit -m "feat: surface document import toolbar"
```

---

### Task 5: Replace full document text with compact details and a lazy reader

**Files:**

- Create: `apps/desktop/src/renderer/src/document/DocumentDetailPanel.tsx`
- Create: `apps/desktop/src/renderer/src/document/DocumentDetailPanel.test.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentLibrary.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentList.tsx`
- Import: `apps/desktop/src/renderer/src/app/WorkspaceShell.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Write compact-detail tests**

Given a 30,000-character document, verify the default panel:

- shows title, type, character count, and original file name;
- shows a preview capped at 320 characters;
- does not place the full body in the DOM;
- exposes `开始课堂`, `打开阅读器`, and `删除`;
- opens the reader only after `打开阅读器`;
- exposes a close-reader action.

Also verify selecting a PDF document does not call `documents.getPages` until the reader opens.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/document/DocumentDetailPanel.test.tsx apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx
```

- [ ] **Step 3: Implement the compact detail component**

Use this public contract:

```tsx
type DocumentDetailPanelProps = Readonly<{
  document: DocumentDetailDto
  busy: boolean
  readerOpen: boolean
  onStartLesson: () => void
  onOpenReader: () => void
  onCloseReader: () => void
  onDelete: () => void
  reader: React.ReactNode
}>
```

Preview helper:

```ts
const previewText = (plainText: string): string => {
  const normalized = plainText.replace(/\s+/gu, ' ').trim()
  return normalized.length <= 320 ? normalized : normalized.slice(0, 320) + '…'
}
```

Do not add a “show all inline” action. Full reading belongs to the explicit reader panel.

- [ ] **Step 4: Make page loading lazy and cancellable by request sequence**

In `DocumentLibrary.loadDetail`, remove all `getPages` and `getPageBlocks` calls. Add a separate
`openReader(documentId)` callback that:

1. increments `detailRequestSequence` or a new `readerRequestSequence`;
2. sets reader state to loading;
3. calls `documents.getPages`;
4. loads blocks in page order;
5. ignores stale results after selection/reader close;
6. exposes page-level failure through a stable inline error and retry button.

When `focusTarget` is received from a lesson, load the detail and automatically call `openReader`
because the user explicitly requested source evidence.

- [ ] **Step 5: Make DocumentList compact enough for the contextual sidebar**

Each list item must be a button-like row with title, source kind, character count, and selection state.
Move delete out of the row and into `DocumentDetailPanel`. Build the accessible selection name with
`'打开文档：' + document.title`.

Move the existing search form, search-result branches, list loading/error/empty branches, and
`DocumentList` inside `<WorkspaceContextual>`. Keep the import toolbar, operation status, and
`DocumentDetailPanel` inside `<section className="document-workspace-main">` in the normal return tree.
Do not duplicate state or API calls between the portal and main canvas.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/document/DocumentDetailPanel.test.tsx apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx apps/desktop/src/renderer/src/document/PdfReaderPanel.test.tsx
git add apps/desktop/src/renderer/src/document apps/desktop/src/renderer/src/styles/global.css
git commit -m "refactor: make document details compact"
```

---

### Task 6: Group lesson sessions beneath their source document

**Files:**

- Create: `apps/desktop/src/renderer/src/lesson/LessonSessionTree.tsx`
- Create: `apps/desktop/src/renderer/src/lesson/LessonSessionTree.test.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Import: `apps/desktop/src/renderer/src/app/WorkspaceShell.tsx`

- [ ] **Step 1: Write tree tests**

Use sessions from two documents and verify:

- one document heading per `documentId`;
- its sessions are sorted newest first by `updatedAt`;
- current selection uses `aria-current="page"`;
- active/archived status is announced;
- selecting a session calls `onSelect` once;
- empty, loading, and error states have retry affordances.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonSessionTree.test.tsx
```

- [ ] **Step 3: Implement deterministic grouping**

Export:

```ts
export type LessonSessionGroup = Readonly<{
  documentId: string
  documentTitle: string
  sessions: readonly LessonSessionDto[]
}>

export const groupLessonSessions = (
  sessions: readonly LessonSessionDto[],
): readonly LessonSessionGroup[] => {
  const groups = new Map<string, LessonSessionDto[]>()
  for (const session of sessions) {
    groups.set(session.documentId, [...(groups.get(session.documentId) ?? []), session])
  }

  return [...groups.entries()]
    .map(([documentId, entries]) => ({
      documentId,
      documentTitle: entries[0]?.documentTitle ?? '未命名文档',
      sessions: [...entries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    }))
    .sort((left, right) => left.documentTitle.localeCompare(right.documentTitle, 'zh-CN'))
}
```

Render a disclosure per document and session buttons beneath it. Default-expand the group containing the
selected lesson. Session labels should use the persisted lesson title; do not infer a new date from the
current clock.

- [ ] **Step 4: Replace the lesson list cards with LessonSessionTree**

Keep loading and retry ownership in `LessonWorkspace`; pass only ready sessions and selection actions
to the tree. Render all list states through the shared contextual portal:

```tsx
<WorkspaceContextual>
  <section className="lesson-contextual-navigation" aria-label="课堂与课程记录内容">
    {listState.status === 'loading' && <p>正在加载课堂…</p>}
    {listState.status === 'error' && (
      <div>
        <p role="alert">{listState.message}</p>
        <button type="button" onClick={() => void loadLessons()}>
          重试加载
        </button>
      </div>
    )}
    {listState.status === 'ready' && (
      <LessonSessionTree
        sessions={listState.sessions}
        selectedLessonId={detailState.status === 'ready' ? detailState.session.id : undefined}
        onSelect={(lessonId) => void openLesson(lessonId)}
      />
    )}
  </section>
</WorkspaceContextual>
```

- [ ] **Step 5: Run tests and commit**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonSessionTree.test.tsx apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx
git add apps/desktop/src/renderer/src/lesson/LessonSessionTree.tsx apps/desktop/src/renderer/src/lesson/LessonSessionTree.test.tsx apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx
git commit -m "feat: group lesson history by document"
```

---

### Task 7: Extract a conversation stream that contains messages only

**Files:**

- Create: `apps/desktop/src/renderer/src/lesson/LessonConversation.tsx`
- Create: `apps/desktop/src/renderer/src/lesson/LessonConversation.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Write conversation rendering tests**

Verify:

- tutor, learner, and system messages have distinct accessible role labels;
- messages remain in persisted order;
- no headings named `生成记录`, `学习诊断`, or `复习任务` appear;
- empty state is useful;
- a failed/cancelled model run maps to an inline retry card at the chronological end;
- retrying exposes `取消重试`;
- new messages trigger scrolling only when the user is already near the bottom;
- when the user has scrolled upward, a `有新消息` button appears instead.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonConversation.test.tsx
```

- [ ] **Step 3: Implement the component**

Use:

```tsx
type LessonConversationProps = Readonly<{
  session: LessonSessionDto
  retryingModelRunId?: string
  onRetryRun: (modelRunId: string) => void
  onCancelRetry: () => void
}>
```

Message rendering in this phase is plain text with `white-space: pre-wrap`. Do not introduce
`dangerouslySetInnerHTML`; Markdown/LaTeX arrives in a later planned stage.

Associate failed runs with their step/message when possible. When no direct timestamp association is
available in existing DTOs, render a single inline recovery card after the last message and label it with
the prompt manifest. Do not manufacture chat messages or modify persistence.

- [ ] **Step 4: Add chat-stream CSS**

The main conversation scroller must be the only vertically growing region:

```css
.lesson-chat {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 0;
}

.lesson-conversation {
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scroll-padding-block: 24px;
}

.lesson-message-bubble {
  max-width: min(780px, 82%);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.lesson-message-learner {
  margin-inline-start: auto;
}
```

- [ ] **Step 5: Run tests and commit**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonConversation.test.tsx
git add apps/desktop/src/renderer/src/lesson/LessonConversation.tsx apps/desktop/src/renderer/src/lesson/LessonConversation.test.tsx apps/desktop/src/renderer/src/styles/global.css
git commit -m "feat: add classroom conversation stream"
```

---

### Task 8: Extract a fixed composer with keyboard and cancellation behavior

**Files:**

- Create: `apps/desktop/src/renderer/src/lesson/LessonComposer.tsx`
- Create: `apps/desktop/src/renderer/src/lesson/LessonComposer.test.tsx`

- [ ] **Step 1: Write composer tests**

Verify:

- empty or whitespace-only input does not submit and announces `请输入回答。`;
- Enter submits once;
- Shift+Enter inserts a newline without submitting;
- composition events for Chinese input do not submit prematurely;
- sending disables the editor and changes the action to `发送中…`;
- cancellation is visible only during sending;
- a failed send preserves the draft for retry;
- a successful send clears the draft;
- the 1,000-character limit remains enforced.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonComposer.test.tsx
```

- [ ] **Step 3: Implement a controlled component**

Use:

```tsx
type LessonComposerProps = Readonly<{
  value: string
  state:
    | Readonly<{ status: 'idle' }>
    | Readonly<{ status: 'submitting' }>
    | Readonly<{ status: 'success'; message: string }>
    | Readonly<{ status: 'error'; message: string }>
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}>
```

The parent retains the existing operation id and API call. The component owns no IPC calls.

Use `onKeyDown`:

```ts
if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
  event.preventDefault()
  onSubmit()
}
```

- [ ] **Step 4: Run tests and commit**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonComposer.test.tsx
git add apps/desktop/src/renderer/src/lesson/LessonComposer.tsx apps/desktop/src/renderer/src/lesson/LessonComposer.test.tsx
git commit -m "feat: add fixed lesson composer"
```

---

### Task 9: Move supporting learning data into an on-demand information drawer

**Files:**

- Create: `apps/desktop/src/renderer/src/lesson/LessonInfoDrawer.tsx`
- Create: `apps/desktop/src/renderer/src/lesson/LessonInfoDrawer.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Write drawer tests**

Given a complete session DTO, verify:

- drawer is absent from the accessibility tree while closed;
- `课堂信息` opens it and focus moves to the drawer heading;
- Escape and `关闭课堂信息` close it and restore trigger focus;
- tabs are `证据`, `进度`, `诊断`, `复习`, `技术`;
- source anchors and `回到证据` appear only under evidence;
- paper stage/current state appear under progress;
- mastery evidence/misconceptions appear under diagnosis;
- review controls and save feedback appear under review;
- model name, run status, state transition, context chunks, and prompt manifest appear under technical;
- all existing retry/review callbacks remain reachable.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonInfoDrawer.test.tsx
```

- [ ] **Step 3: Implement the drawer API**

Use:

```tsx
type LessonInfoDrawerProps = Readonly<{
  open: boolean
  session: LessonSessionDto
  reviewResponses: Readonly<Record<string, string>>
  reviewSavingId: string | null
  reviewFeedback: string | null
  reviewError: string | null
  onClose: () => void
  onReturnToEvidence: (target: { documentId: string; pageNumber: number; blockId: string }) => void
  onReviewResponseChange: (reviewItemId: string, value: string) => void
  onRecordReview: (reviewItemId: string, rating: 'remembered' | 'forgot') => void
}>
```

Move the existing formatting maps/helpers from `LessonWorkspace.tsx` beside this component when used
only by the drawer. Keep retry controls in the conversation; technical data is diagnostic and read-only.

Use an aside dialog:

```tsx
<aside
  className="lesson-info-drawer"
  role="dialog"
  aria-modal="false"
  aria-labelledby="lesson-info-title"
>
```

- [ ] **Step 4: Add overlay behavior without changing the conversation width permanently**

At widths above 1,000 px, drawer may overlay from the right at 420 px. Below 1,000 px, use
`width: min(100%, 420px)`. The conversation remains mounted and retains scroll state.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonInfoDrawer.test.tsx
git add apps/desktop/src/renderer/src/lesson/LessonInfoDrawer.tsx apps/desktop/src/renderer/src/lesson/LessonInfoDrawer.test.tsx apps/desktop/src/renderer/src/styles/global.css
git commit -m "refactor: move lesson metadata to drawer"
```

---

### Task 10: Recompose LessonWorkspace as a chat-first page

**Files:**

- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Rewrite acceptance-level component tests before production code**

Keep API mocks from the current test and assert:

- the ready main canvas shows lesson title, current state summary, conversation, and composer;
- it does not show the stacked headings `生成记录`, `学习诊断`, or `复习任务`;
- `课堂信息` reveals all three in drawer tabs;
- selected lesson id from App opens the intended session;
- reply success appends returned data and clears the composer;
- reply failure preserves the typed answer;
- cancel and retry still invoke explicit preload APIs;
- review recording still updates the returned session;
- source evidence navigation still invokes `onReturnToEvidence`;
- list/detail load failures expose retry controls;
- no-provider and provider-call failures remain visible as errors, never as local tutor output.

- [ ] **Step 2: Run and verify RED**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx
```

- [ ] **Step 3: Compose the extracted components**

The ready branch must have this shape:

```tsx
<section className="lesson-chat" aria-label="课堂对话">
  <header className="lesson-chat-header">
    <div>
      <p>{detailState.session.documentTitle}</p>
      <h1>{detailState.session.title}</h1>
    </div>
    <button type="button" onClick={() => setInfoDrawerOpen(true)}>
      课堂信息
    </button>
  </header>

  <LessonConversation
    session={detailState.session}
    retryingModelRunId={runRetryState.status === 'retrying' ? runRetryState.modelRunId : undefined}
    onRetryRun={(modelRunId) => void retryRun(modelRunId)}
    onCancelRetry={() => void cancelRetry()}
  />

  <LessonComposer
    value={replyText}
    state={composerState}
    onChange={setReplyText}
    onSubmit={() => void submitReply()}
    onCancel={() => void cancelReply()}
  />

  <LessonInfoDrawer
    open={infoDrawerOpen}
    session={detailState.session}
    reviewResponses={reviewResponses}
    reviewSavingId={reviewSavingId}
    reviewFeedback={reviewFeedback}
    reviewError={reviewError}
    onClose={() => setInfoDrawerOpen(false)}
    onReturnToEvidence={(target) => onReturnToEvidence?.(target)}
    onReviewResponseChange={(reviewItemId, value) =>
      setReviewResponses((current) => ({ ...current, [reviewItemId]: value }))
    }
    onRecordReview={(reviewItemId, rating) => void recordReview(reviewItemId, rating)}
  />
</section>
```

Refactor `submitReply` from form-event input to a zero-argument callback. Preserve operation sequence,
cancellation, stale-request protection, and all stable error messages.

- [ ] **Step 4: Remove obsolete stacked-layout markup and styles**

Delete only CSS selectors no longer referenced after an `rg` check. Keep shared card/status/form styles
used by documents or providers.

```bash
rg "lesson-layout|lesson-run-list|lesson-mastery-diagnosis|lesson-reply-form" apps/desktop/src/renderer/src
```

Expected after cleanup: no component references; only intentionally retained migration notes, if any.

- [ ] **Step 5: Run all Renderer tests**

```bash
pnpm exec vitest run
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/lesson apps/desktop/src/renderer/src/styles/global.css
git commit -m "refactor: make classroom chat first"
```

---

### Task 11: Complete responsive, focus, and overflow behavior

**Files:**

- Modify: `apps/desktop/src/renderer/src/styles/global.css`
- Modify: `apps/desktop/src/renderer/src/app/WorkspaceShell.test.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`

- [ ] **Step 1: Add regression tests for the reported overflow failures**

Verify via DOM/class contracts:

- primary navigation starts at the top, not vertically centered;
- document detail has its own bounded scroller;
- full document text is not mounted by default;
- lesson conversation has one dedicated scroller;
- composer remains outside that scroller;
- collapsed contextual sidebar is removed from tab order;
- modal and drawer focus restoration works.

- [ ] **Step 2: Add minimum-window responsive rules**

At widths below 900 px, default the contextual sidebar to collapsed for sessions without a stored preference.
Never automatically overwrite the saved preference. Keep the one-click restore affordance visible.

Cap the main-shell columns with `minmax(0, 1fr)`, and add `min-width: 0` to every grid child that may
contain long PDF titles, formulas, URLs, or Chinese text.

- [ ] **Step 3: Add reduced-motion and visible-focus behavior**

```css
@media (prefers-reduced-motion: reduce) {
  .workspace-shell,
  .lesson-info-drawer {
    transition: none;
  }
}

.workspace-shell :focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Run the Renderer suite and type checking**

```bash
pnpm exec vitest run
pnpm --filter @deepstorming/desktop typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src
git commit -m "fix: harden workspace responsive behavior"
```

---

### Task 12: Rewrite Electron E2E around the new user journey

**Files:**

- Modify: `tests/e2e/app.spec.ts`
- Inspect only: `tests/e2e/packaged-provider.spec.ts`

- [ ] **Step 1: Replace old three-column and stacked-detail assertions**

The Electron test must cover this sequence:

1. application launches and runtime status appears;
2. document page shows the PDF and text import toolbar above the library;
3. create a text document through the dialog;
4. select it and verify its full body is absent;
5. open and close the explicit reader;
6. start a lesson;
7. verify the new lesson appears below its document group;
8. submit one learner reply through the fixed composer;
9. open the information drawer and inspect evidence/technical data;
10. return to source evidence;
11. independently collapse the contextual sidebar;
12. collapse all sidebars and restore them;
13. resize combined sidebars and assert their right edge is no farther than half the window.

Use accessible names and roles, not CSS implementation selectors, except for a single bounding-box assertion
on the shell separator.

- [ ] **Step 2: Preserve provider-path coverage**

Do not weaken `packaged-provider.spec.ts`. The page formerly named Provider now sits under Settings; update
only navigation labels needed to reach the same provider controls.

- [ ] **Step 3: Run the desktop E2E suite**

```bash
pnpm test:e2e
```

If Electron cannot launch because the environment has no desktop/display capability, record the exact
command and failure in the status document; do not claim the gate passed. On the current macOS desktop
environment, the expected result is a real run.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/app.spec.ts tests/e2e/packaged-provider.spec.ts
git commit -m "test: cover chat-first workspace journey"
```

---

### Task 13: Update project status and run release-quality verification

**Files:**

- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`
- Reference: `docs/superpowers/specs/2026-07-14-ai-first-learning-workspace-redesign-design.md`
- Reference: this plan

- [ ] **Step 1: Update current status with factual implementation state**

Record:

- phase name: `AI-first workspace redesign — Stage 1 interface foundation`;
- completed components and their test files;
- no Domain/Application/Infrastructure/IPC/schema changes;
- PDF v1 remains selectable-text only;
- full-text default view removed; reader is explicit and lazy;
- classroom primary canvas is conversation-only;
- diagnostics/review/model runs remain available in the information drawer;
- layout preferences are local UI preferences, not secret or business data;
- later AI-first stages remain pending.

Do not mark strict AI-only tutoring, figure extraction, rich Markdown/LaTeX, lesson completion, export, or
context compression as complete.

- [ ] **Step 2: Update the roadmap stage table**

Mark only Stage 1 as complete after all checks pass. Link to this plan and the approved design. Keep later
stages pending in this order:

1. AI-only tutor contract and mentor/settings;
2. rich chat rendering and citation/figure pipeline;
3. lesson lifecycle, pace, review transition, and export;
4. context compression, token accounting, and hardening.

- [ ] **Step 3: Run formatting/lint/type/unit/build gates**

```bash
pnpm check
```

Expected: exit code 0. Capture the command output in the implementation handoff.

- [ ] **Step 4: Run Electron E2E**

```bash
pnpm test:e2e
```

Expected: exit code 0 on a desktop-capable environment.

- [ ] **Step 5: Inspect the final diff and secret safety**

```bash
git diff --check
git status --short
git diff --stat
rg -n "sk-[A-Za-z0-9]|Bearer [A-Za-z0-9]|api[_-]?key\\s*[:=]\\s*['\\"][^'\\"]+" apps packages tests docs \
  --glob '!**/node_modules/**' \
  --glob '!**/*.snap'
```

Expected:

- `git diff --check` has no output;
- only intended files appear;
- secret scan has no real credential matches.

Do not open or copy `/Users/hezhendong/Desktop/deepseek_api.txt` for this phase.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/planning/current-status.md docs/planning/software-design-completion-roadmap.md
git commit -m "docs: record chat-first workspace foundation"
```

- [ ] **Step 7: Final handoff**

Report:

- exact commits created;
- exact test commands and exit codes;
- any E2E environment limitation;
- manual smoke-test path;
- the next plan to write: AI-only tutor contract and mentor/settings.

## Manual smoke-test checklist

After automated gates pass:

1. Run `pnpm dev`.
2. Confirm both sidebars start at the top.
3. Drag each sidebar separator; verify the combined width never exceeds half the window.
4. Collapse primary, collapse contextual, then use one-click collapse/restore.
5. Restart the app and confirm layout preferences return.
6. Open 文档库 and confirm PDF import is visible without scrolling.
7. Select a long document and confirm the complete body is not in the default detail.
8. Open the reader and confirm the full document/PDF pages are available there.
9. Start a lesson and confirm it appears under the same document in the session tree.
10. Confirm the classroom center shows only messages plus the fixed composer.
11. Open 课堂信息 and inspect evidence, progress, diagnosis, review, and technical tabs.
12. Submit a message, cancel a generation, retry a failed generation, and return to PDF evidence.
13. Navigate to 设置 and confirm existing provider management still works.

## Plan self-review checklist

Before execution begins, verify:

- [x] every new business-free layout rule has a unit test;
- [x] every user-triggered asynchronous flow still has loading/error/success and cancellation where meaningful;
- [x] no Renderer import crosses the architecture boundary;
- [x] no current persisted lesson data becomes inaccessible;
- [x] PDF pages load only after an explicit reader/evidence action;
- [x] sidebar max-width enforcement is tested in the pure policy and E2E;
- [x] no unfilled implementation markers remain;
- [x] all file paths and commands match the repository;
- [x] Stage 1 documentation does not claim later AI functionality is complete.
