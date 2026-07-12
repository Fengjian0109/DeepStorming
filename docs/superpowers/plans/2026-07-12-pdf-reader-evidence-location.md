# PDF Reader Evidence Location Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable selecting a parsed PDF block in the document detail reader, starting a lesson from it, and returning from the lesson to the highlighted evidence.

**Architecture:** Preserve text offsets/snippets for compatibility and add a discriminated `LessonSourceTarget`. The application validates PDF block ownership through a port; SQLite stores nullable JSON metadata. The renderer adds a focused reader panel and carries a document/block focus callback through the existing app shell.

**Tech Stack:** TypeScript, Zod, React, SQLite migrations, Vitest, Playwright, pnpm monorepo.

---

### Task 1: Add the domain and contract target model

**Files:**

- Modify: `packages/domain/src/lesson.ts`
- Test: `packages/domain/src/lesson.test.ts`
- Modify: `packages/contracts/src/lesson.ts`
- Test: `packages/contracts/src/lesson.test.ts`

- [x] **Step 1: Write failing domain tests** for default text targets, valid PDF block targets, and rejection of page `0` or blank block ids.
- [x] **Step 2: Run `pnpm vitest packages/domain/src/lesson.test.ts packages/contracts/src/lesson.test.ts` and verify the new cases fail.**
- [x] **Step 3: Implement `LessonSourceTarget`, add `target` to lesson source types, normalize missing targets to `{ kind: 'text_range' }`, and add strict Zod schemas with backward-compatible optional target input.**
- [x] **Step 4: Run the focused tests and then `pnpm typecheck`; expect all focused tests and typecheck to pass.**
- [x] **Step 5: Commit `feat: add lesson pdf source targets`.**

### Task 2: Validate block ownership in application and persist target metadata

**Files:**

- Modify: `packages/application/src/lesson-ports.ts`
- Modify: `packages/application/src/lesson-use-cases.ts`
- Test: `packages/application/src/lesson-use-cases.test.ts`
- Modify: `packages/infrastructure/src/database/migrations.ts`
- Test: `packages/infrastructure/src/database/migrations.test.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.ts`
- Test: `packages/infrastructure/src/database/sqlite-lesson-repository.test.ts`
- Modify: `packages/infrastructure/src/database/sqlite-document-import-repository.ts`

- [x] **Step 1: Add failing application tests** where a matching `{ documentId, pageNumber, blockId }` is accepted and a missing/cross-document block returns `LESSON_SOURCE_NOT_FOUND` without inserting a lesson.
- [x] **Step 2: Run the focused application tests and verify the new assertions fail.**
- [x] **Step 3: Add a `DocumentSourceLocatorPort` returning the page/block identity and text; inject it into `StartLessonFromDocument` and validate PDF targets before repository writes.**
- [x] **Step 4: Add migration v9 with nullable `lesson_source_anchors.target_json`; map NULL to text range and serialize/parse the discriminated target in the SQLite lesson repository.**
- [x] **Step 5: Add migration/repository round-trip tests, including an old NULL row, then run infrastructure and application focused tests.**
- [x] **Step 6: Commit `feat: persist and validate pdf lesson sources`.**

### Task 3: Wire the source locator through main/preload contracts

**Files:**

- Modify: `apps/desktop/src/main/*` files that compose document/lesson use cases and IPC handlers
- Modify: `apps/desktop/src/preload/*` explicit lesson/document API declarations
- Test: existing main/preload IPC contract tests identified with `rg "start-from-document|lessons:start" apps/desktop`

- [x] **Step 1: Write a failing IPC test** proving a PDF target request reaches the use case and an invalid target is mapped to `LESSON_SOURCE_NOT_FOUND`.
- [x] **Step 2: Run the focused IPC test and verify it fails before wiring.**
- [x] **Step 3: Pass the document locator implementation from the composition root, keep handlers limited to schema validation/use-case invocation/error mapping, and update preload TypeScript declarations without exposing generic IPC.**
- [x] **Step 4: Run the IPC/preload tests and `pnpm typecheck`.**
- [x] **Step 5: Commit `feat: wire pdf source validation through ipc`.**

### Task 4: Build the embedded PDF reader panel

**Files:**

- Create: `apps/desktop/src/renderer/src/document/PdfReaderPanel.tsx`
- Test: `apps/desktop/src/renderer/src/document/PdfReaderPanel.test.tsx`
- Modify: `apps/desktop/src/renderer/src/document/DocumentLibrary.tsx`
- Test: `apps/desktop/src/renderer/src/document/DocumentLibrary.test.tsx`

- [x] **Step 1: Write failing renderer tests** for page navigation, case-insensitive block search, active block highlighting, and disabling “开始课堂” when text cannot be mapped.
- [x] **Step 2: Run the focused renderer tests and verify failure.**
- [x] **Step 3: Implement `PdfReaderPanel` with props `{ pages, selectedTarget, onSelectTarget, onStartLesson }`; compute document offsets using page text joined by `\n\n`, and render loading/error/retry states.**
- [x] **Step 4: Integrate the panel in `DocumentLibrary` detail view and send `target` plus offsets/snippet to the existing start-lesson callback.**
- [x] **Step 5: Run renderer tests and `pnpm lint`; commit `feat: add embedded pdf evidence reader`.**

### Task 5: Show provenance and support return-to-evidence

**Files:**

- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Test: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Test: `apps/desktop/src/renderer/src/App.test.tsx` if present, otherwise extend the existing app integration test
- Modify: `docs/planning/current-status.md`

- [x] **Step 1: Write failing tests** for rendering “第 N 页 · Block M” and invoking a return callback with `{ documentId, pageNumber, blockId }`.
- [x] **Step 2: Run focused tests and verify failure.**
- [x] **Step 3: Add provenance UI and thread an app-level pending evidence focus into `DocumentLibrary`; returning from a lesson opens the document and selects the target block.**
- [x] **Step 4: Run renderer tests and update current-status with D3 progress and remaining scope.**
- [x] **Step 5: Commit `feat: return from lesson to pdf evidence`.**

### Task 6: Add end-to-end coverage and verify the phase

**Files:**

- Modify/Create: `apps/desktop/e2e/*.spec.ts` using the existing PDF fixture and test helpers
- Modify: `docs/planning/software-design-completion-roadmap.md`

- [x] **Step 1: Add an E2E test** covering import PDF → open detail → select block → start lesson → provenance display → return to evidence/highlight.
- [x] **Step 2: Run `pnpm test:e2e` and fix only failures caused by this feature.**
- [x] **Step 3: Run `pnpm format && pnpm check`; expect the full unit/type/build suite to pass.**
- [x] **Step 4: Update the roadmap to mark D3 complete and list deferred canvas/OCR/bbox work.**
- [x] **Step 5: Commit `test: cover pdf evidence lesson flow`, push `main`, and report the verification output.**

## Self-review

Every spec section maps to Tasks 1–6: target compatibility (1–2), ownership/security (2–3), reader UX (4), provenance navigation (5), error/loading behavior (4–5), and automated acceptance (6). No task introduces a renderer dependency on Application/Domain/Infrastructure. The plan uses the exact target field names consistently and has no placeholder implementation steps.
