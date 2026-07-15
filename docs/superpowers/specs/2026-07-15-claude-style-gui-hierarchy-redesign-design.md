# DeepStorming Claude-style GUI and Hierarchy Redesign

- Date: 2026-07-15
- Status: approved for implementation
- Scope: desktop Renderer information architecture, interaction state, visual tokens, controls, accessibility, and UI tests
- Visual references:
  - [Claude on Typewolf](https://www.typewolf.com/site-of-the-day/claude)
  - [Iconfont](https://www.iconfont.cn/) as an icon-discovery reference only

## 1. Problem statement

The current interface exposes too many controls and forms at once. Sidebar actions are duplicated at the bottom of both sidebars and again in the main content. Native file inputs, checkboxes, range controls, and mixed button sizes break visual consistency. Settings such as tutors and Providers combine collection, creation, and editing concerns on one screen. Long tutor fields can extend below the visible viewport without a reliable scroll path.

The redesign must make DeepStorming feel calm, direct, and readable without changing its AI, database, Provider-secret, document, or lesson business behavior.

## 2. Approved product principles

1. The primary sidebar is the parent; the contextual sidebar is its child.
2. One control toggles one state. The same icon button must expand and collapse a sidebar.
3. Interfaces reveal complexity progressively: category, collection, then detail.
4. Content is primary. Controls use restrained color, fixed dimensions, vector icons, and concise labels.
5. Long content scrolls inside an explicit container and is never clipped by viewport height.
6. Light and dark themes share the same component geometry and default to the macOS appearance.

## 3. Scope and non-goals

### In scope

- Primary and contextual sidebar state and responsive behavior.
- Sidebar resize handles and persisted Renderer preferences.
- Settings navigation, Provider collection/detail flow, tutor collection/detail flow, and singleton settings pages.
- Application-wide design tokens, light/dark themes, typography, buttons, vector icons, file pickers, toggles, selects, sliders, focus states, and scrollbars.
- Consistent collection-to-detail patterns for documents and lessons where existing pages currently expose unrelated concerns together.
- Component, pure-state, accessibility, and Electron E2E coverage for the redesigned behavior.

### Out of scope

- AI prompts, lesson generation, context compression, document processing, export content, database schema, IPC contracts, and Provider secret storage.
- macOS application icon, code signing, and notarization.
- Redistribution of Claude's commercial fonts or unlicensed third-party icons.

## 4. Sidebar hierarchy and state model

### 4.1 Default state

- A fresh workspace opens with the primary sidebar expanded and the contextual sidebar collapsed.
- The primary sidebar is top-aligned and contains brand identity, global navigation, and its toggle button.
- The contextual sidebar contains only children of the selected primary navigation item.
- Collapsing the primary sidebar always collapses the contextual sidebar in the same state transition.

### 4.2 Toggle behavior

- The primary sidebar has one 32-by-32-pixel outline SVG button in its upper-right corner.
- When expanded, the button's accessible name is `收起主侧栏`; when collapsed, the 48-pixel rail contains the same control with accessible name `展开主侧栏`.
- Expanding the primary sidebar restores only the primary sidebar. It never opens the contextual sidebar automatically.
- The contextual sidebar has one equivalent upper-right toggle button and no bottom collapse button.
- The main content has no global “collapse all” or “restore all” button.

### 4.3 Primary navigation behavior

For a primary target `T`:

- If the contextual sidebar is closed, clicking `T` selects `T` and opens its contextual sidebar.
- If `T` is already selected and the contextual sidebar is open, clicking `T` closes the contextual sidebar.
- If another target is selected and the contextual sidebar is open, clicking `T` switches both contextual content and main content while keeping the sidebar open.
- Collapsing the contextual sidebar does not clear the selected primary target or main content.

This makes every primary navigation action reversible: the same target moves from primary-only state A to primary-plus-context state B, then from B back to A.

### 4.4 Width and responsive rules

- The initial combined expanded width targets 40% of the viewport: approximately 15% for the primary sidebar and 25% for the contextual sidebar, subject to component minimums.
- Dragging can expand the combined width to at most 50% of the viewport.
- User-adjusted widths persist and are fitted back into the current viewport on restart.
- If the minimum usable sidebar widths cannot fit, the contextual sidebar collapses first.
- Resizing the window wider does not reopen a sidebar the user or responsive rule closed.
- The primary collapsed rail is 48 pixels wide.
- The layout preference storage version is incremented so obsolete collapse semantics do not override the new defaults.

### 4.5 Resize handles

- Resize handles remain keyboard-accessible separators.
- Their resting state is visually quiet with low opacity.
- Hover, keyboard focus, and active dragging increase opacity and accent contrast.
- Pointer and keyboard resizing enforce the same minimum and maximum constraints.

## 5. Progressive settings hierarchy

The settings contextual sidebar contains `AI Provider`, `导师 / 伙伴`, `个人资料`, `课堂设置`, and `外观`.

### 5.1 Provider flow

1. Selecting `AI Provider` opens a collection page.
2. The collection page lists saved Providers and presents one `新增 Provider` action.
3. Selecting a Provider or the new action pushes a full-width detail page into the main area.
4. The detail page owns editing, API-key replacement, connection testing, activation, and deletion.
5. Back navigation returns to the collection without duplicating the form beside the list.

### 5.2 Tutor flow

1. Selecting `导师 / 伙伴` opens a tutor collection page.
2. The page lists tutors and presents one `新增导师` action.
3. Selecting a tutor or the new action opens a dedicated scrollable detail page.
4. The detail page contains avatar, name, personality, tone, expertise, Socratic intensity, book strategy, paper strategy, and custom instructions.
5. Archiving is a secondary destructive action with confirmation and stable error feedback.

### 5.3 Singleton settings

`个人资料`, `课堂设置`, and `外观` open their detail forms directly because they have no collection to select first.

### 5.4 Navigation safety

- Detail pages display a back button and a breadcrumb such as `设置 / 导师与伙伴 / 苏格拉底导师`.
- Navigating away from a dirty form prompts the user to continue editing or discard changes.
- Loading, saving, success, error, cancellation, and retry states remain visible without shifting the whole layout.

## 6. Application-wide page hierarchy

- Documents follow collection, document detail, and explicit import/create flows.
- Lessons follow source document, lesson records, and conversation detail hierarchy.
- Temporary or interruptive operations may use dialogs or drawers: end-lesson confirmation, lesson information, export, and destructive confirmation.
- Collection, create form, edit form, diagnostic data, and history must not be simultaneously tiled into one main page.

## 7. Visual system

### 7.1 Theme direction

The approved direction is Claude-like warm neutrals with a restrained terracotta accent.

- Light theme: warm ivory canvas, white surfaces, charcoal text, warm-gray secondary text, and low-contrast warm-gray borders.
- Dark theme: near-black canvas, raised charcoal surfaces, warm-gray text, and subtle borders.
- Terracotta appears only in focus, selection, switches, progress, and high-value primary actions.
- Error red, warning amber, and success green remain semantic and low-saturation.
- Appearance preference values are `system`, `light`, and `dark`; `system` is the default and observes macOS changes.
- Renderer-only appearance state is stored under a versioned local-storage key and applied through a root `data-theme` attribute.

### 7.2 Typography and licensing

Typewolf identifies Galaxie Copernicus, Tiempos Text, and Styrene on Claude. These are commercial fonts and are not redistributed with DeepStorming.

- UI controls and body text use a system sans stack headed by SF Pro and PingFang SC.
- Brand display, welcome text, and selected page titles use a restrained reading stack headed by Georgia and Songti SC to approximate the rhythm of Copernicus/Tiempos.
- KaTeX continues to own mathematical typography.
- Heading sizes, line height, paragraph width, and font weight are tokenized; large headings do not rely on excessive boldness.

### 7.3 Vector icons

- A focused internal React SVG icon set provides sidebar panels, folders, files, back, chevron, plus, edit, archive, delete, settings, documents, lessons, Providers, tutors, user profile, appearance, and status icons.
- Default geometry is 18–20 pixels with rounded line caps, rounded joins, and approximately 1.75-pixel stroke.
- Emoji and text glyphs are not used as interface icons.
- Iconfont may be used to discover concepts, but an asset is imported only when its license and required attribution are recorded. The application never loads Iconfont at runtime.

## 8. Controls

- Icon buttons use fixed 32-by-32 or 36-by-36 geometry, tooltip text, `aria-label`, visible keyboard focus, and no wrapping.
- Text buttons share fixed heights, nowrap labels, stable horizontal padding, and role-based visual variants.
- Native file inputs are visually hidden. A folder SVG button opens the picker and adjacent text reports the selected filename or empty state.
- Boolean preferences use an accessible custom switch rather than the browser's large blue checkbox.
- Selects, range sliders, text inputs, textareas, scrollbars, and validation states use theme tokens.
- Destructive actions use a quiet danger variant and confirmation; they are never styled like routine primary actions.
- Button width does not change because a sidebar is resized. Labels truncate only where a fixed collection row explicitly allows it.

## 9. Scrolling and layout containment

- The workspace root, main column, sidebars, and nested flex/grid containers explicitly use `min-height: 0` where required.
- The contextual sidebar and main detail body scroll independently.
- Long tutor and Provider forms can always reach their final field and save action.
- Detail headers and breadcrumbs may remain sticky; the form body is the scrolling region.
- A sticky action bar is allowed when it does not obscure the final field and has a non-sticky fallback for reduced viewport height.
- No page relies on the outer Electron window body as its only scroll container.

## 10. Accessibility and motion

- All icon-only controls expose localized accessible names and tooltips.
- Toggle state uses `aria-expanded`, current navigation uses `aria-current`, and switches use the correct checked state.
- Focus is restored to the originating collection row after returning from a detail page.
- Resize handles remain operable with left and right arrow keys.
- Light and dark color combinations meet readable contrast targets.
- Theme and sidebar transitions respect `prefers-reduced-motion`.

## 11. Error handling and state preservation

- Renderer navigation and visual preferences never store API keys or Provider secrets.
- Failed settings loads show a stable inline error and retry action.
- Failed saves retain the user's draft.
- Cancelled file picking leaves the existing avatar or document selection unchanged.
- Responsive collapse does not overwrite the user's saved preferred width.
- Unexpected theme-storage failures fall back to `system` without blocking application startup.

## 12. Verification strategy

### Pure layout tests

- Fresh layout shows primary only.
- Collapsing primary forces contextual closed.
- Expanding primary does not open contextual.
- Clicking the selected primary target toggles contextual open/closed.
- Clicking another target changes context while remaining open.
- Default widths target 40%; drag constraints enforce the 50% maximum.
- Narrow viewports collapse contextual first.

### Component tests

- Sidebar buttons share one control per sidebar and expose correct labels/states.
- Settings collection pages push and pop Provider and tutor details.
- New and existing objects use the same detail component with distinct modes.
- Dirty detail navigation requires confirmation.
- File-picker buttons and custom switches are keyboard accessible.
- Theme selection and system changes update the root theme.

### Electron E2E

- Verify primary-only startup, contextual toggle, parent-forced collapse, 48-pixel rail, and persisted resizing.
- Navigate Provider collection to detail and back; repeat for tutor collection and long tutor detail.
- Scroll to paper strategy and custom instructions, save, restart, and verify persistence.
- Switch light/dark/system appearance and verify restart behavior.
- Confirm file folder icon triggers the real avatar picker flow without exposing a native file-input row.

### Release gate

- `pnpm check`
- `pnpm test:e2e`
- Manual inspection at common desktop widths in both themes, including keyboard-only navigation and reduced-motion mode.

## 13. Acceptance criteria

1. No bottom sidebar-collapse buttons or main-area global collapse button remain.
2. Primary and contextual sidebars obey the approved parent-child state model.
3. Initial combined width targets 40%, remains user-resizable, and never exceeds 50%.
4. Settings use collection-to-detail navigation instead of side-by-side collection and form layouts.
5. Tutor fields below paper strategy are reachable and savable at supported window sizes.
6. Native file input chrome and the large blue checkbox no longer appear.
7. Buttons keep stable dimensions and do not wrap during sidebar resizing.
8. Light and dark Claude-like themes are coherent across the workspace.
9. Interface icons are consistent, local, vector-based, accessible, and license-safe.
10. All existing AI, lesson, Provider security, document, export, and persistence behavior remains intact.
