# Claude-style GUI and Hierarchy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace DeepStorming's duplicated, flat desktop controls with a Claude-inspired light/dark visual system, parent-child sidebars, progressive settings pages, accessible SVG controls, and reliable nested scrolling.

**Architecture:** Keep all changes inside the Renderer boundary. Pure functions own sidebar and appearance policy; small UI primitives own icons, toggles, and file-picker presentation; workspace and settings components compose those primitives without changing IPC or business contracts. Provider and tutor managers retain their existing async operations but present them through collection and detail routes.

**Tech Stack:** React 19, TypeScript 6, CSS custom properties, Testing Library, Vitest, Electron, Playwright

---

## File map

- `app/workspace-layout.ts`: versioned sidebar state, width policy, parent-child transitions.
- `app/WorkspaceShell.tsx`: sidebar rendering, navigation toggles, resize behavior.
- `ui/UiIcon.tsx`: local outline SVG icon set.
- `ui/IconButton.tsx`: fixed icon-only button with tooltip and accessible name.
- `ui/FilePickerButton.tsx`: hidden native file input with a semantic vector button and filename state.
- `ui/Switch.tsx`: accessible custom boolean switch.
- `appearance/appearance.ts`: appearance persistence and theme resolution.
- `appearance/AppearanceProvider.tsx`: system-theme subscription and root attribute application.
- `settings/AppearanceEditor.tsx`: `system` / `light` / `dark` selection.
- `settings/SettingsPageHeader.tsx`: breadcrumb, back action, and fixed detail header.
- `settings/SettingsCenter.tsx`: setting-category navigation and dirty-navigation guard.
- `settings/settings-navigation.ts`: pure dirty-navigation decision policy.
- `provider/ProviderManager.tsx`: Provider collection/detail route while preserving async operations.
- `provider/ProviderList.tsx`: selectable Provider collection rows.
- `provider/ProviderForm.tsx`: detail form and dirty-state reporting.
- `settings/TutorProfileEditor.tsx`: tutor collection/detail route.
- `settings/TutorProfileDetail.tsx`: scrollable create/edit form.
- `styles/tokens.css`: Claude-inspired light/dark design tokens.
- `styles/controls.css`: shared button, input, switch, file-picker, focus, and scrollbar styles.
- `styles/global.css`: workspace/page layout using the shared tokens.
- Existing document, lesson, user-profile, and classroom components: adopt the shared primitives without changing business flows.

---

### Task 1: Replace sidebar policy with the approved parent-child state machine

**Files:**

- Modify: `apps/desktop/src/renderer/src/app/workspace-layout.ts`
- Modify: `apps/desktop/src/renderer/src/app/workspace-layout.test.ts`

- [ ] **Step 1: Write failing tests for fresh layout, 40% target, 50% cap, and parent-child transitions**

```ts
import {
  COLLAPSED_RAIL_WIDTH,
  createDefaultWorkspaceLayout,
  maximumCombinedSidebarWidth,
  navigatePrimarySidebar,
  resizeWorkspaceLayout,
  toggleContextualSidebar,
  togglePrimarySidebar,
} from './workspace-layout'

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
```

- [ ] **Step 2: Run the policy test and verify the new expectations fail**

Run:

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/app/workspace-layout.test.ts
```

Expected: FAIL because `createDefaultWorkspaceLayout` and `navigatePrimarySidebar` do not exist, the old rail is 56 pixels, and the old default opens the contextual sidebar.

- [ ] **Step 3: Implement the new state and width policy**

Replace the old restore-state fields and all `toggleAllSidebars` behavior with this public shape and transitions; retain the existing clamp/resize/storage error handling around the new fields:

```ts
export const WORKSPACE_LAYOUT_STORAGE_KEY = 'deepstorming.workspace-layout.v2'
export const DEFAULT_COMBINED_SIDEBAR_RATIO = 0.4
export const MAX_COMBINED_SIDEBAR_RATIO = 0.5
export const WORKSPACE_SEPARATOR_TOTAL_WIDTH = 12
export const MIN_PRIMARY_WIDTH = 176
export const MIN_CONTEXTUAL_WIDTH = 220
export const COLLAPSED_RAIL_WIDTH = 48

export type WorkspaceLayout = Readonly<{
  primaryWidth: number
  contextualWidth: number
  primaryCollapsed: boolean
  contextualCollapsed: boolean
}>

export const createDefaultWorkspaceLayout = (viewportWidth: number): WorkspaceLayout => {
  const target = viewportWidth * DEFAULT_COMBINED_SIDEBAR_RATIO
  const primaryWidth = Math.max(MIN_PRIMARY_WIDTH, Math.round(viewportWidth * 0.15))
  return {
    primaryWidth,
    contextualWidth: Math.max(MIN_CONTEXTUAL_WIDTH, Math.round(target - primaryWidth)),
    primaryCollapsed: false,
    contextualCollapsed: true,
  }
}

export const maximumCombinedSidebarWidth = (viewportWidth: number): number =>
  Math.max(0, viewportWidth * MAX_COMBINED_SIDEBAR_RATIO - WORKSPACE_SEPARATOR_TOTAL_WIDTH)

export const togglePrimarySidebar = (current: WorkspaceLayout): WorkspaceLayout =>
  current.primaryCollapsed
    ? { ...current, primaryCollapsed: false, contextualCollapsed: true }
    : { ...current, primaryCollapsed: true, contextualCollapsed: true }

export const toggleContextualSidebar = (current: WorkspaceLayout): WorkspaceLayout =>
  current.primaryCollapsed
    ? current
    : { ...current, contextualCollapsed: !current.contextualCollapsed }

export const navigatePrimarySidebar = (
  current: WorkspaceLayout,
  sameTarget: boolean,
): WorkspaceLayout => ({
  ...current,
  primaryCollapsed: false,
  contextualCollapsed: sameTarget ? !current.contextualCollapsed : false,
})
```

Update `normalizeWorkspaceLayout`, `readWorkspaceLayout(storage, viewportWidth)`, `fitWorkspaceLayoutToViewport`, and `resizeWorkspaceLayout` to use `createDefaultWorkspaceLayout(viewportWidth)` as fallback. When `maximumCombinedSidebarWidth(viewportWidth)` is less than `MIN_PRIMARY_WIDTH + MIN_CONTEXTUAL_WIDTH`, return a state with the contextual sidebar collapsed without changing either stored width. Persist that collapsed boolean once in the shell so widening the window does not reopen a sidebar that responsive behavior closed.

- [ ] **Step 4: Run the policy test and confirm it passes**

Run:

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/app/workspace-layout.test.ts
```

Expected: all workspace policy tests PASS.

- [ ] **Step 5: Commit the pure sidebar policy**

```bash
git add apps/desktop/src/renderer/src/app/workspace-layout.ts apps/desktop/src/renderer/src/app/workspace-layout.test.ts
git commit -m "feat(renderer): enforce hierarchical sidebar state"
```

---

### Task 2: Add local SVG icons and accessible fixed-size control primitives

**Files:**

- Create: `apps/desktop/src/renderer/src/ui/UiIcon.tsx`
- Create: `apps/desktop/src/renderer/src/ui/IconButton.tsx`
- Create: `apps/desktop/src/renderer/src/ui/FilePickerButton.tsx`
- Create: `apps/desktop/src/renderer/src/ui/Switch.tsx`
- Create: `apps/desktop/src/renderer/src/ui/ui-primitives.test.tsx`

- [ ] **Step 1: Write failing accessibility and behavior tests**

```tsx
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
  const input = screen.getByLabelText('选择导师头像')
  expect(input.className).toContain('visually-hidden-file-input')
  const click = vi.spyOn(input, 'click')
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
```

- [ ] **Step 2: Run the primitive test and verify module-resolution failures**

Run:

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/ui/ui-primitives.test.tsx
```

Expected: FAIL because the four UI modules do not exist.

- [ ] **Step 3: Implement the icon set and primitives**

Use a local path map; no runtime network or font icon dependency:

```tsx
// UiIcon.tsx
import React from 'react'

export type UiIconName =
  | 'panel-left'
  | 'panel-right'
  | 'folder'
  | 'file'
  | 'arrow-left'
  | 'chevron-right'
  | 'plus'
  | 'pencil'
  | 'archive'
  | 'trash'
  | 'settings'
  | 'documents'
  | 'lessons'
  | 'provider'
  | 'tutor'
  | 'user'
  | 'appearance'

const paths: Readonly<Record<UiIconName, string>> = {
  'panel-left': 'M4 5h16v14H4zM9 5v14m4-9-3 2 3 2',
  'panel-right': 'M4 5h16v14H4zM15 5v14m-4-9 3 2-3 2',
  folder: 'M3 7h6l2 2h10v10H3z',
  file: 'M6 3h8l4 4v14H6zM14 3v5h5',
  'arrow-left': 'm14 6-6 6 6 6M8 12h10',
  'chevron-right': 'm9 6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  pencil: 'm4 16-.5 4.5L8 20 19 9l-4-4zM13 7l4 4',
  archive: 'M4 7h16v13H4zM3 3h18v4H3zm6 8h6',
  trash: 'M5 7h14m-9 4v6m4-6v6M8 7l1-3h6l1 3m1 0-1 14H8L7 7',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
  documents: 'M5 4h11l3 3v13H5zM8 10h8M8 14h8M8 18h5',
  lessons: 'M4 5h7a3 3 0 0 1 3 3v11H7a3 3 0 0 0-3 2zm16 0h-7a3 3 0 0 0-3 3v11h7a3 3 0 0 1 3 2z',
  provider:
    'M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0zm4-9v3m0 12v3M3 12h3m12 0h3M5.6 5.6 8 8m8 8 2.4 2.4M18.4 5.6 16 8M8 16l-2.4 2.4',
  tutor:
    'M8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 21v-3a5 5 0 0 1 10 0v3m1-1v-2a4 4 0 0 1 8 0v2',
  user: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM3 22a9 9 0 0 1 18 0',
  appearance: 'M12 3a9 9 0 1 0 9 9c-5 1-8-3-9-9z',
}

export const UiIcon = ({ name, size = 18 }: { name: UiIconName; size?: number }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={paths[name]} />
  </svg>
)
```

```tsx
// IconButton.tsx
import React from 'react'
import { UiIcon, type UiIconName } from './UiIcon'

export const IconButton = ({
  icon,
  label,
  className = '',
  ...button
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: UiIconName; label: string }) => (
  <button
    {...button}
    type="button"
    className={`icon-button ${className}`}
    aria-label={label}
    title={label}
  >
    <UiIcon name={icon} />
  </button>
)
```

```tsx
// Switch.tsx
import React from 'react'
export const Switch = ({
  label,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) => (
  <label className="switch-field">
    <span>{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="switch-control"
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  </label>
)
```

```tsx
// FilePickerButton.tsx
import React, { useId, useRef, useState } from 'react'
import { UiIcon } from './UiIcon'
export const FilePickerButton = ({
  label,
  accept,
  disabled = false,
  onFile,
}: {
  label: string
  accept: string
  disabled?: boolean
  onFile: (file: File) => void
}) => {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState('尚未选择')
  return (
    <div className="file-picker-control">
      <input
        ref={inputRef}
        id={id}
        className="visually-hidden-file-input"
        type="file"
        accept={accept}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (!file) return
          setFilename(file.name)
          onFile(file)
        }}
      />
      <button
        type="button"
        className="file-picker-trigger"
        title={label}
        aria-label={label}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <UiIcon name="folder" />
        <span>{label}</span>
      </button>
      <span className="file-picker-name" title={filename}>
        {filename}
      </span>
    </div>
  )
}
```

- [ ] **Step 4: Run the primitive test and confirm it passes**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/ui/ui-primitives.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the local vector control primitives**

```bash
git add apps/desktop/src/renderer/src/ui
git commit -m "feat(renderer): add accessible vector controls"
```

---

### Task 3: Add persisted system/light/dark appearance

**Files:**

- Create: `apps/desktop/src/renderer/src/appearance/appearance.ts`
- Create: `apps/desktop/src/renderer/src/appearance/AppearanceProvider.tsx`
- Create: `apps/desktop/src/renderer/src/appearance/AppearanceProvider.test.tsx`
- Create: `apps/desktop/src/renderer/src/settings/AppearanceEditor.tsx`
- Modify: `apps/desktop/src/renderer/src/main.tsx`

- [ ] **Step 1: Write failing tests for system resolution, persistence, and root theme updates**

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppearanceProvider, useAppearance } from './AppearanceProvider'

const Probe = () => {
  const appearance = useAppearance()
  return <button onClick={() => appearance.setPreference('dark')}>{appearance.preference}</button>
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  )
})

it('defaults to system and applies the resolved light theme', () => {
  render(
    <AppearanceProvider>
      <Probe />
    </AppearanceProvider>,
  )
  expect(screen.getByRole('button').textContent).toBe('system')
  expect(document.documentElement.dataset.theme).toBe('light')
})

it('persists an explicit dark preference', async () => {
  render(
    <AppearanceProvider>
      <Probe />
    </AppearanceProvider>,
  )
  await userEvent.setup().click(screen.getByRole('button'))
  expect(document.documentElement.dataset.theme).toBe('dark')
  expect(localStorage.getItem('deepstorming.appearance.v1')).toBe('dark')
})
```

- [ ] **Step 2: Run the appearance test and verify it fails**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/appearance/AppearanceProvider.test.tsx
```

Expected: FAIL because the appearance modules do not exist.

- [ ] **Step 3: Implement appearance policy and context**

```ts
// appearance.ts
export type AppearancePreference = 'system' | 'light' | 'dark'
export type ResolvedAppearance = 'light' | 'dark'
export const APPEARANCE_STORAGE_KEY = 'deepstorming.appearance.v1'
export const readAppearance = (storage: Pick<Storage, 'getItem'>): AppearancePreference => {
  try {
    const value = storage.getItem(APPEARANCE_STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}
export const writeAppearance = (storage: Pick<Storage, 'setItem'>, value: AppearancePreference) => {
  try {
    storage.setItem(APPEARANCE_STORAGE_KEY, value)
    return true
  } catch {
    return false
  }
}
export const resolveAppearance = (
  preference: AppearancePreference,
  systemDark: boolean,
): ResolvedAppearance => (preference === 'system' ? (systemDark ? 'dark' : 'light') : preference)
```

`AppearanceProvider.tsx` must create a context with `{ preference, resolved, setPreference }`, subscribe to `matchMedia('(prefers-color-scheme: dark)')`, write the versioned preference, and set `document.documentElement.dataset.theme = resolved` in an effect. Throw a clear error from `useAppearance` when called outside the provider.

`AppearanceEditor.tsx` must render one radio group named `外观主题` with `跟随系统`, `浅色`, and `深色`, calling `setPreference` immediately. Wrap `<App />` with `<AppearanceProvider>` inside `main.tsx`, below the error boundary.

- [ ] **Step 4: Run appearance and Renderer type tests**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/appearance/AppearanceProvider.test.tsx
pnpm --filter @deepstorming/desktop typecheck
```

Expected: appearance tests and desktop typecheck PASS.

- [ ] **Step 5: Commit the appearance state**

```bash
git add apps/desktop/src/renderer/src/appearance apps/desktop/src/renderer/src/settings/AppearanceEditor.tsx apps/desktop/src/renderer/src/main.tsx
git commit -m "feat(renderer): add system-aware appearance settings"
```

---

### Task 4: Rebuild the workspace shell around one toggle per sidebar

**Files:**

- Modify: `apps/desktop/src/renderer/src/app/WorkspaceShell.tsx`
- Modify: `apps/desktop/src/renderer/src/app/WorkspaceShell.test.tsx`
- Modify: `apps/desktop/src/renderer/src/app/App.tsx`

- [ ] **Step 1: Replace old shell tests with the approved navigation behavior**

```tsx
it('starts with primary only and opens context by clicking the selected primary target', async () => {
  const user = userEvent.setup()
  renderShell(1600)
  expect(screen.queryByRole('complementary', { name: '文档导航' })).toBeNull()
  await user.click(screen.getByRole('button', { name: '文档库' }))
  expect(await screen.findByRole('complementary', { name: '文档导航' })).toBeTruthy()
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
  const onNavigate = vi.fn()
  renderShell(1600, onNavigate)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '文档库' }))
  await user.click(screen.getByRole('button', { name: '设置' }))
  expect(onNavigate).toHaveBeenCalledWith('settings')
})
```

Update the local test helper to accept `onNavigate` and remove all assertions for `toggleAllSidebars`, bottom collapse buttons, and main-area sidebar controls.

- [ ] **Step 2: Run shell tests and verify the old controls fail the new contract**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/app/WorkspaceShell.test.tsx
```

Expected: FAIL because context currently opens by default and duplicated collapse controls remain.

- [ ] **Step 3: Implement the new shell composition**

Use `displayedLayout` consistently for rendered visibility. Add `handlePrimaryNavigation(target)`:

```tsx
const handlePrimaryNavigation = (target: WorkspacePage) => {
  setLayout((current) => navigatePrimarySidebar(current, page === target))
  if (target !== page) onNavigate(target)
}
```

Inside expanded primary, render a header row with the supplied brand header and:

```tsx
<IconButton
  icon="panel-left"
  label="收起主侧栏"
  onClick={() => setLayout((current) => togglePrimarySidebar(current))}
/>
```

Render each primary navigation button with a `UiIcon` (`documents`, `lessons`, `settings`) and a nowrap text label. The collapsed 48-pixel rail renders only an `IconButton` named `展开主侧栏`. The contextual sidebar renders a sticky header row containing its label and `IconButton icon="panel-right" label="收起副侧栏"`. Delete `.workspace-sidebar-controls`, both bottom collapse buttons, `toggleAllSidebars`, and the `bothCollapsed` branch.

When the viewport can no longer fit both minimum widths, update state once to `contextualCollapsed: true` while preserving the stored widths. `App.tsx` keeps the selected page and main content unchanged when context closes.

- [ ] **Step 4: Run shell, layout, and App tests**

```bash
pnpm exec vitest run \
  apps/desktop/src/renderer/src/app/workspace-layout.test.ts \
  apps/desktop/src/renderer/src/app/WorkspaceShell.test.tsx \
  apps/desktop/src/renderer/src/app/App.test.tsx
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit the workspace shell**

```bash
git add apps/desktop/src/renderer/src/app
git commit -m "feat(renderer): simplify hierarchical workspace shell"
```

---

### Task 5: Add Claude-inspired theme tokens and shared control geometry

**Files:**

- Create: `apps/desktop/src/renderer/src/styles/tokens.css`
- Create: `apps/desktop/src/renderer/src/styles/controls.css`
- Create: `apps/desktop/src/renderer/src/styles/theme-contract.test.ts`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Write a failing raw-CSS theme contract test**

Use Vite's raw import so the test stays inside the Renderer toolchain without importing Node APIs:

```ts
import { expect, it } from 'vitest'
import controls from './controls.css?raw'
import tokens from './tokens.css?raw'

it('defines both themes and fixed no-wrap control geometry', () => {
  expect(tokens).toContain(":root[data-theme='dark']")
  expect(tokens).toContain('--color-accent: #c96545')
  expect(controls).toContain('width: 32px')
  expect(controls).toContain('white-space: nowrap')
  expect(controls).toContain("[aria-checked='true']")
})
```

- [ ] **Step 2: Run the theme contract and verify missing-module failure**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/styles/theme-contract.test.ts
```

Expected: FAIL because `tokens.css` and `controls.css` do not exist.

- [ ] **Step 3: Create exact light/dark tokens and control rules**

`tokens.css` must define:

```css
:root,
:root[data-theme='light'] {
  color-scheme: light;
  --font-ui:
    -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Segoe UI', sans-serif;
  --font-display: Georgia, 'Songti SC', 'STSong', serif;
  --color-canvas: #f7f5f0;
  --color-surface: #fffdfa;
  --color-surface-raised: #ffffff;
  --color-sidebar: #25241f;
  --color-sidebar-raised: #34332e;
  --color-text: #2b2925;
  --color-text-muted: #747068;
  --color-text-on-dark: #e7e3da;
  --color-border: #ded9d0;
  --color-border-strong: #c9c2b8;
  --color-accent: #c96545;
  --color-accent-soft: #f3dfd6;
  --color-danger: #a44d3d;
  --color-success: #537a63;
  --shadow-soft: 0 12px 34px rgb(43 41 37 / 8%);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --control-height: 38px;
}

:root[data-theme='dark'] {
  color-scheme: dark;
  --color-canvas: #1d1c19;
  --color-surface: #252420;
  --color-surface-raised: #2d2c28;
  --color-sidebar: #171714;
  --color-sidebar-raised: #2b2a26;
  --color-text: #e5e1d8;
  --color-text-muted: #a39f96;
  --color-text-on-dark: #e9e5dc;
  --color-border: #403e38;
  --color-border-strong: #57544c;
  --color-accent: #df7d5d;
  --color-accent-soft: #4a3027;
  --color-danger: #d27b69;
  --color-success: #81aa8d;
  --shadow-soft: 0 14px 38px rgb(0 0 0 / 22%);
}
```

`controls.css` must set `.icon-button` to fixed 32-by-32 geometry; `.button`, global buttons, `.file-picker-trigger`, inputs, selects, textareas, `.switch-control`, `.switch-thumb`, focus rings, disabled states, danger variants, and themed scrollbars. Every text button uses `white-space: nowrap`; file input chrome stays in `.visually-hidden-file-input`; the switch uses `[aria-checked='true']` for accent and thumb translation.

At the top of `global.css`, import both files, replace hard-coded green/cream colors in workspace, settings, document, lesson, dialog, operation, and card selectors with tokens, and retain semantic success/error distinctions. Add `@media (prefers-reduced-motion: reduce)` to disable nonessential transitions.

- [ ] **Step 4: Run format, Renderer tests, and build**

```bash
pnpm format:check
pnpm exec vitest run apps/desktop/src/renderer/src/ui apps/desktop/src/renderer/src/appearance
pnpm --filter @deepstorming/desktop build
```

Expected: formatting, selected tests, and production Renderer build PASS.

- [ ] **Step 5: Commit the visual foundation**

```bash
git add apps/desktop/src/renderer/src/styles
git commit -m "style(renderer): add claude-inspired theme tokens"
```

---

### Task 6: Add setting-category navigation and dirty-detail protection

**Files:**

- Create: `apps/desktop/src/renderer/src/settings/SettingsPageHeader.tsx`
- Create: `apps/desktop/src/renderer/src/settings/SettingsPageHeader.test.tsx`
- Create: `apps/desktop/src/renderer/src/settings/settings-navigation.ts`
- Create: `apps/desktop/src/renderer/src/settings/settings-navigation.test.ts`
- Modify: `apps/desktop/src/renderer/src/settings/SettingsCenter.tsx`
- Modify: `apps/desktop/src/renderer/src/settings/SettingsCenter.test.tsx`

- [ ] **Step 1: Write failing settings-navigation tests**

```tsx
it('exposes Provider, tutor, profile, classroom, and appearance categories', async () => {
  render(<SettingsCenter />)
  const nav = await screen.findByRole('navigation', { name: '设置分类' })
  for (const name of ['AI Provider', '导师 / 伙伴', '个人资料', '课堂设置', '外观']) {
    expect(within(nav).getByRole('button', { name })).toBeTruthy()
  }
})

it('blocks navigation when a dirty detail is not discarded', () => {
  const confirmDiscard = vi.fn().mockReturnValue(false)
  expect(canLeaveSettings(true, confirmDiscard)).toBe(false)
  expect(confirmDiscard).toHaveBeenCalledWith('当前修改尚未保存。要放弃修改吗？')
})
```

Import `within` from Testing Library in `SettingsCenter.test.tsx`, and import `canLeaveSettings` in `settings-navigation.test.ts`.

- [ ] **Step 2: Run the settings test and verify failure**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/settings/SettingsCenter.test.tsx
```

Expected: FAIL because appearance and the pure dirty-navigation policy do not exist.

- [ ] **Step 3: Implement category navigation and shared detail header**

Add `appearance` to `Section` and the contextual navigation with `UiIcon` names. Implement `canLeaveSettings(dirty, confirmDiscard)` as a pure policy. `SettingsCenter` owns `dirty` state and uses:

```ts
const requestSection = (next: Section) => {
  if (!canLeaveSettings(dirty, window.confirm)) return
  setDirty(false)
  setSection(next)
}
```

Render `<AppearanceEditor />` for the appearance section. Keep `setDirty` local and connect it incrementally as Provider, tutor, profile, and classroom editors gain optional `onDirtyChange` callbacks in Tasks 7–9. Reset dirty when navigation is confirmed and after each successful save.

`SettingsPageHeader` accepts `{ title, description, breadcrumb, onBack, action }`, renders a sticky header, uses `IconButton icon="arrow-left"` for back when supplied, and exposes the breadcrumb as a navigation landmark.

- [ ] **Step 4: Run settings tests and desktop typecheck**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/settings/SettingsCenter.test.tsx apps/desktop/src/renderer/src/settings/SettingsPageHeader.test.tsx apps/desktop/src/renderer/src/settings/settings-navigation.test.ts
pnpm --filter @deepstorming/desktop typecheck
```

Expected: selected tests and typecheck PASS.

- [ ] **Step 5: Commit the settings navigation shell**

```bash
git add apps/desktop/src/renderer/src/settings
git commit -m "feat(settings): add progressive settings navigation"
```

---

### Task 7: Convert Provider management to collection and detail routes

**Files:**

- Modify: `apps/desktop/src/renderer/src/provider/ProviderManager.tsx`
- Modify: `apps/desktop/src/renderer/src/provider/ProviderList.tsx`
- Modify: `apps/desktop/src/renderer/src/provider/ProviderForm.tsx`
- Modify: `apps/desktop/src/renderer/src/provider/ProviderManager.test.tsx`

- [ ] **Step 1: Write failing collection/detail tests**

```tsx
it('starts on the Provider collection and opens a selected Provider detail', async () => {
  render(<ProviderManager onDirtyChange={vi.fn()} />)
  expect(await screen.findByRole('heading', { name: 'AI Provider' })).toBeTruthy()
  expect(screen.queryByLabelText('显示名称')).toBeNull()
  await userEvent.setup().click(screen.getByRole('button', { name: '打开 Main Provider' }))
  expect(screen.getByRole('heading', { name: '编辑 Provider' })).toBeTruthy()
  expect(screen.getByLabelText('显示名称')).toHaveValue('Main Provider')
})

it('opens a clean create detail and returns to the collection after save', async () => {
  render(<ProviderManager onDirtyChange={vi.fn()} />)
  await userEvent.setup().click(await screen.findByRole('button', { name: '新增 Provider' }))
  expect(screen.getByRole('heading', { name: '新增 Provider' })).toBeTruthy()
  await userEvent.setup().type(screen.getByLabelText('显示名称'), 'DeepSeek')
  await userEvent.setup().click(screen.getByRole('button', { name: '添加 Provider' }))
  expect(await screen.findByRole('heading', { name: 'AI Provider' })).toBeTruthy()
})
```

- [ ] **Step 2: Run Provider tests and verify the flat grid fails**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/provider/ProviderManager.test.tsx
```

Expected: FAIL because the form is visible beside the list on initial render and collection rows do not expose `打开 <name>`.

- [ ] **Step 3: Implement Provider view routes without changing async operations**

Use:

```ts
type ProviderView =
  | Readonly<{ kind: 'collection' }>
  | Readonly<{ kind: 'detail'; mode: 'create' }>
  | Readonly<{ kind: 'detail'; mode: 'edit'; provider: ProviderProfileDto }>
```

Keep `loadProviders`, save, activate, test, cancel, delete, operation tokens, and stable messages unchanged. Initial view is `collection`. `ProviderList` renders each card as a selectable row with one chevron and `onOpen(provider)`; it no longer displays edit/test/activate/delete buttons. The detail page renders `SettingsPageHeader`, `ProviderForm`, and a secondary action bar containing connection test, activate, and delete actions for edit mode. After create or update succeeds, return to collection, reload, clear dirty, and restore focus to the selected row. Back uses the shared dirty confirmation before leaving. Add optional `onDirtyChange` to `ProviderManager` and connect it from `SettingsCenter` in this task.

Extend `ProviderForm` with `onDirtyChange`; compare current field values against its mode-specific initial values in an effect and report only a boolean—never API-key content—to the parent.

- [ ] **Step 4: Run Provider and settings tests**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/provider/ProviderManager.test.tsx apps/desktop/src/renderer/src/settings/SettingsCenter.test.tsx
```

Expected: all Provider and settings tests PASS, including existing connection cancellation and secret-field clearing coverage.

- [ ] **Step 5: Commit the Provider hierarchy**

```bash
git add apps/desktop/src/renderer/src/provider
git commit -m "feat(settings): add provider collection detail flow"
```

---

### Task 8: Convert tutors to collection/detail and repair long-form scrolling

**Files:**

- Create: `apps/desktop/src/renderer/src/settings/TutorProfileDetail.tsx`
- Create: `apps/desktop/src/renderer/src/settings/TutorProfileEditor.test.tsx`
- Modify: `apps/desktop/src/renderer/src/settings/TutorProfileEditor.tsx`
- Modify: `apps/desktop/src/renderer/src/settings/SettingsCenter.test.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`

- [ ] **Step 1: Write failing tutor hierarchy and reachability tests**

```tsx
it('shows the tutor collection before any form', () => {
  render(<TutorProfileEditor tutors={[tutor]} onChanged={vi.fn()} onDirtyChange={vi.fn()} />)
  expect(screen.getByRole('heading', { name: '选择导师' })).toBeTruthy()
  expect(screen.queryByLabelText('论文教学策略')).toBeNull()
  expect(screen.getByRole('button', { name: '编辑 苏格拉底导师' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '新增导师' })).toBeTruthy()
})

it('opens a dedicated scrollable detail containing every strategy field', async () => {
  render(<TutorProfileEditor tutors={[tutor]} onChanged={vi.fn()} onDirtyChange={vi.fn()} />)
  await userEvent.setup().click(screen.getByRole('button', { name: '编辑 苏格拉底导师' }))
  const detail = screen.getByTestId('settings-detail-scroll')
  expect(detail.className).toContain('settings-detail-scroll')
  expect(screen.getByLabelText('书籍教学策略')).toBeTruthy()
  expect(screen.getByLabelText('论文教学策略')).toBeTruthy()
  expect(screen.getByLabelText('自定义要求')).toBeTruthy()
  expect(screen.getByRole('button', { name: '保存导师' })).toBeTruthy()
})

it('uses the vector file picker instead of visible native file chrome', async () => {
  render(<TutorProfileEditor tutors={[tutor]} onChanged={vi.fn()} onDirtyChange={vi.fn()} />)
  await userEvent.setup().click(screen.getByRole('button', { name: '编辑 苏格拉底导师' }))
  expect(screen.getByText('选择导师头像')).toBeTruthy()
  expect(screen.getByLabelText('选择导师头像').className).toContain('visually-hidden-file-input')
})
```

- [ ] **Step 2: Run tutor tests and verify the flat grid fails**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/settings/TutorProfileEditor.test.tsx
```

Expected: FAIL because list and form currently render together and no explicit scroll container exists.

- [ ] **Step 3: Implement tutor collection/detail composition**

`TutorProfileEditor` owns:

```ts
type TutorView =
  | Readonly<{ kind: 'collection' }>
  | Readonly<{ kind: 'detail'; mode: 'create' }>
  | Readonly<{ kind: 'detail'; mode: 'edit'; tutor: TutorProfileDto }>
```

The collection renders one full-width row per tutor with avatar/name/expertise/status and `UiIcon chevron-right`, plus a stable `新增导师` action. `TutorProfileDetail` receives `{ mode, tutor, onSaved, onArchived, onBack, onDirtyChange }`, owns the existing draft/import/save/archive async states, and renders all fields inside:

```tsx
<section className="settings-detail-page">
  <SettingsPageHeader ... />
  <div className="settings-detail-scroll" data-testid="settings-detail-scroll">
    <form className="settings-form" onSubmit={...}>...</form>
  </div>
</section>
```

Use `FilePickerButton` for the avatar. Put save/archive actions in `.settings-action-bar`. Set `.settings-detail-page { height: 100%; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); }` and `.settings-detail-scroll { min-height: 0; overflow: auto; padding: 0 clamp(20px, 4vw, 56px) 48px; }`. Report dirty state by comparing the complete draft to the initial normalized draft. Add optional `onDirtyChange` to `TutorProfileEditor`, connect it from `SettingsCenter`, and add the integration assertion that a rejected confirmation keeps the tutor detail open. Successful save clears dirty and returns to collection.

- [ ] **Step 4: Run tutor and settings tests**

```bash
pnpm exec vitest run apps/desktop/src/renderer/src/settings/TutorProfileEditor.test.tsx apps/desktop/src/renderer/src/settings/SettingsCenter.test.tsx
```

Expected: collection/detail, avatar, long-field, and existing revision tests PASS.

- [ ] **Step 5: Commit the tutor hierarchy and scroll repair**

```bash
git add apps/desktop/src/renderer/src/settings apps/desktop/src/renderer/src/styles/global.css
git commit -m "feat(settings): add scrollable tutor detail flow"
```

---

### Task 9: Apply primitives to singleton settings, documents, and lesson controls

**Files:**

- Modify: `apps/desktop/src/renderer/src/settings/UserProfileEditor.tsx`
- Modify: `apps/desktop/src/renderer/src/settings/ClassroomPreferencesEditor.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentForm.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentLibrary.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentCreateDialog.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentDetailPanel.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonInfoDrawer.tsx`
- Modify: corresponding `*.test.tsx` files

- [ ] **Step 1: Add failing assertions for custom file and boolean controls**

In `SettingsCenter.test.tsx`, after opening personal profile, assert `选择个人头像` maps to a hidden input and a visible folder trigger. After opening classroom settings, assert:

```tsx
const autoScroll = screen.getByRole('switch', { name: '自动滚动到新消息' })
expect(autoScroll.getAttribute('aria-checked')).toBe('true')
expect(screen.queryByRole('checkbox', { name: '自动滚动到新消息' })).toBeNull()
```

In `DocumentLibrary.test.tsx`, assert the PDF import input is visually hidden and its visible trigger contains the label `导入 PDF`. Add icon-label assertions to lesson information and document detail controls without changing their existing actions.

- [ ] **Step 2: Run the selected tests and verify native controls fail**

```bash
pnpm exec vitest run \
  apps/desktop/src/renderer/src/settings/SettingsCenter.test.tsx \
  apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx \
  apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx
```

Expected: FAIL because native file inputs and checkbox controls are still visible.

- [ ] **Step 3: Replace native presentation and normalize action styling**

- `UserProfileEditor`: use `FilePickerButton label="选择个人头像"`; add `onDirtyChange`; keep the secure avatar IPC unchanged.
- `ClassroomPreferencesEditor`: replace only `autoScroll` checkbox with `Switch`; add `onDirtyChange`; preserve preference validation and save payload.
- `DocumentForm` and PDF import toolbar: use `FilePickerButton` with exact existing `accept` values and callbacks; do not change parsing or import cancellation.
- Document and lesson icon-worthy actions: prepend `UiIcon` while retaining visible labels for primary operations; use `IconButton` only when the action is unambiguous and has a localized tooltip.
- Replace text arrows, glyph chevrons, and checkmark characters used as controls with `UiIcon`. Preserve prose emoji or source-document content.
- Add `.nowrap-action`, fixed control heights, ellipsis collection metadata, and responsive action rows to `controls.css`/`global.css`.
- Audit the existing document collection/detail and lesson tree/dialog routes against the approved hierarchy. Preserve them because they already separate selection from detail; this task changes their presentation and controls, not their business navigation.

- [ ] **Step 4: Audit remaining native file/checkbox chrome and run tests**

```bash
rg -n 'type="file"|type="checkbox"' apps/desktop/src/renderer/src
pnpm exec vitest run apps/desktop/src/renderer/src
```

Expected: every remaining file input belongs to `FilePickerButton` and every remaining checkbox is intentionally hidden or replaced; all Renderer tests PASS.

- [ ] **Step 5: Commit the application-wide control pass**

```bash
git add apps/desktop/src/renderer/src
git commit -m "style(renderer): unify document lesson and settings controls"
```

---

### Task 10: Update E2E, documentation, and final release gates

**Files:**

- Modify: `tests/e2e/app.spec.ts`
- Modify: `tests/e2e/ai-first-stages.spec.ts`
- Modify: `docs/testing/ai-first-workspace-manual-test.md`
- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`
- Modify: `docs/superpowers/plans/2026-07-15-claude-style-gui-hierarchy-redesign.md`

- [ ] **Step 1: Update E2E expectations before implementation verification**

Add one E2E block that verifies:

```ts
await expect(page.getByRole('complementary', { name: '设置分类' })).toHaveCount(0)
await page.getByRole('button', { name: '设置' }).click()
await expect(page.getByRole('complementary', { name: '设置分类' })).toBeVisible()
await page.getByRole('button', { name: '设置' }).click()
await expect(page.getByRole('complementary', { name: '设置分类' })).toHaveCount(0)
await page.getByRole('button', { name: '设置' }).click()
await page.getByRole('button', { name: '导师 / 伙伴' }).click()
await page.getByRole('button', { name: /编辑 苏格拉底导师/ }).click()
await expect(page.getByLabel('论文教学策略')).toBeVisible()
await page.getByTestId('settings-detail-scroll').evaluate((node) => {
  node.scrollTop = node.scrollHeight
})
await expect(page.getByLabel('自定义要求')).toBeVisible()
await page.getByRole('button', { name: '外观' }).click()
await page.getByLabel('深色').check()
await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
```

Also verify collapsing primary hides contextual, leaves `展开主侧栏`, and removes all text buttons named `收起全部侧栏`, `收起主侧栏` at the bottom, and `收起副侧栏` at the bottom. Existing Provider and AI-first journeys must navigate through collection/detail rather than assuming the form is initially visible.

- [ ] **Step 2: Run the updated E2E and observe any stale selector failures**

```bash
pnpm test:e2e
```

Expected before final selector repair: failures identify old flat-page assumptions; no database or IPC failures should appear.

- [ ] **Step 3: Finish selector/accessibility repairs and update user documentation**

Keep accessible names stable and repair only selectors proven stale by Step 2. Update the manual guide with:

- parent-child sidebar toggle behavior;
- 40% default and 50% maximum width;
- Provider/tutor list-to-detail navigation;
- appearance setting and macOS system behavior;
- vector file picker and custom switch checks;
- long tutor form scrolling verification.

Update current status and roadmap with the redesign completion and exact final test evidence. Mark each completed checkbox in this plan only after its command passes.

- [ ] **Step 4: Run full verification from a Node ABI state**

```bash
pnpm check
pnpm test:e2e
pnpm package:dir
pnpm exec playwright test tests/e2e/packaged-provider.spec.ts --reporter=line
pnpm check
```

Expected:

- lint and Prettier clean;
- all workspace typechecks pass;
- all unit/component tests pass;
- production Electron build succeeds;
- development Electron journeys pass;
- macOS directory package succeeds with the already documented unsigned/default-icon warnings;
- packaged persistence test passes;
- final `pnpm check` confirms Node ABI restoration.

- [ ] **Step 5: Perform the final requirement audit**

```bash
rg -n '收起全部侧栏|workspace-collapse-button|type="checkbox"' apps/desktop/src/renderer/src
rg -n '#173b2c|#23533d|#fffdf7' apps/desktop/src/renderer/src/styles
git diff --check
git status --short
```

Expected: no obsolete sidebar control selectors; no visible native checkbox; old green palette removed except documented semantic content if any; no whitespace errors; only intentional files changed.

- [ ] **Step 6: Commit and push the verified redesign**

```bash
git add apps/desktop/src/renderer/src tests/e2e docs
git commit -m "feat(desktop): complete claude-style gui redesign"
git push
```
