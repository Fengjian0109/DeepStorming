# AI-First Workspace Stages 2–5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining AI-first workspace stages: strict AI tutoring and profiles, rich cited chat with PDF figures, complete lesson lifecycle/export, and automatic context compression.

**Architecture:** Add each feature as a vertical slice through Domain, Application ports/use cases, Infrastructure persistence/adapters, explicit Main/Preload IPC, and Contracts-only Renderer UI. External AI and file work remains behind Application ports; SQLite stores auditable state but never secrets, while managed assets live under application data.

**Tech Stack:** TypeScript 6, Zod, SQLite/better-sqlite3, Electron 43, React 19, Vitest, Testing Library, Playwright, unified/remark/rehype, KaTeX, pdf-lib.

---

## Stage 2 — Strict AI tutor and settings

### Task 1: Tutor profiles, user profile, and classroom preferences domain

**Files:**

- Create: `packages/domain/src/learning-settings.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/learning-settings.test.ts`

- [ ] Write failing tests for profile normalization, at-least-one active tutor, pace values, prompt versioning, 30% compression default, and immutable lesson profile snapshots.
- [ ] Run `pnpm vitest run packages/domain/src/learning-settings.test.ts` and verify the missing module failure.
- [ ] Implement `TutorProfile`, `UserProfile`, `ClassroomPreferences`, `LessonTutorSnapshot`, and their draft normalization functions without platform imports.
- [ ] Re-run the focused test and commit `feat(domain): add learning profile settings`.

### Task 2: Settings contracts, use cases, and ports

**Files:**

- Create: `packages/contracts/src/learning-settings.ts`
- Create: `packages/application/src/learning-settings-ports.ts`
- Create: `packages/application/src/learning-settings-use-cases.ts`
- Modify: `packages/contracts/src/app-info.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/application/src/index.ts`
- Test: `packages/contracts/src/learning-settings.test.ts`
- Test: `packages/application/src/learning-settings-use-cases.test.ts`

- [ ] Write failing schema tests for strict profile/settings DTOs and stable error results.
- [ ] Write failing use-case tests for bootstrap default tutor, CRUD/archive semantics, avatar asset IDs, default tutor references, and optimistic revisions.
- [ ] Implement repository/avatar-store ports plus `GetLearningSettings`, `SaveUserProfile`, `CreateTutorProfile`, `UpdateTutorProfile`, `ArchiveTutorProfile`, and `SaveClassroomPreferences`.
- [ ] Run focused Contracts/Application tests and commit `feat(application): add learning settings use cases`.

### Task 3: Persist settings and managed avatars

**Files:**

- Modify: `packages/infrastructure/src/database/migrations.ts`
- Create: `packages/infrastructure/src/database/sqlite-learning-settings-repository.ts`
- Create: `packages/infrastructure/src/assets/local-avatar-store.ts`
- Modify: `packages/infrastructure/src/index.ts`
- Test: `packages/infrastructure/src/database/migrations.test.ts`
- Test: `packages/infrastructure/src/database/sqlite-learning-settings-repository.test.ts`
- Test: `packages/infrastructure/src/assets/local-avatar-store.test.ts`

- [ ] Add failing migration/repository tests for `user_profile`, `tutor_profiles`, `classroom_preferences`, and immutable profile revision history.
- [ ] Add failing asset tests for controlled image extensions, size limits, atomic copies, traversal rejection, and idempotent deletion.
- [ ] Implement migration 16, SQLite CAS repository, and managed avatar store.
- [ ] Run focused Infrastructure tests and commit `feat(infrastructure): persist learning settings`.

### Task 4: Explicit settings IPC and settings center UI

**Files:**

- Create: `apps/desktop/src/main/ipc/learning-settings-handlers.ts`
- Modify: `apps/desktop/src/main/ipc/register-ipc.ts`
- Modify: `apps/desktop/src/main/composition-root.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/src/settings/SettingsCenter.tsx`
- Create: `apps/desktop/src/renderer/src/settings/TutorProfileEditor.tsx`
- Create: `apps/desktop/src/renderer/src/settings/UserProfileEditor.tsx`
- Create: `apps/desktop/src/renderer/src/settings/ClassroomPreferencesEditor.tsx`
- Modify: `apps/desktop/src/renderer/src/app/App.tsx`
- Test: corresponding `*.test.ts(x)` files in the same directories

- [ ] Write failing IPC/Preload tests proving every operation uses an explicit channel and avatar import never exposes arbitrary file reads.
- [ ] Write failing UI tests for settings navigation, loading/error/success/cancel states, tutor CRUD, avatars, preferences, and embedded Provider management.
- [ ] Wire the use cases at the Main composition root and implement the settings center.
- [ ] Run focused desktop tests and commit `feat(desktop): add tutor and classroom settings`.

### Task 5: Bind lesson snapshots and remove local teaching fallbacks

**Files:**

- Modify: `packages/domain/src/lesson.ts`
- Modify: `packages/contracts/src/lesson.ts`
- Modify: `packages/application/src/lesson-ports.ts`
- Modify: `packages/application/src/lesson-use-cases.ts`
- Modify: `packages/infrastructure/src/database/migrations.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.ts`
- Modify: `apps/desktop/src/main/composition-root.ts`
- Modify: `apps/desktop/src/renderer/src/document/DocumentDetailPanel.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Test: matching Domain/Contracts/Application/Infrastructure/Renderer tests

- [ ] Write failing tests that block lesson start without an active configured Provider and active tutor profile.
- [ ] Write failing tests proving lesson snapshots preserve tutor name/personality/prompt/avatar/pace after later settings edits.
- [ ] Delete `localTutorFirstQuestion`, `localTutorReply`, and generator fallback branches; map unavailable AI to stable `AI_PROVIDER_REQUIRED` / `AI_GENERATION_FAILED` errors.
- [ ] Add migration 17 for lesson tutor snapshot and pace, update start preparation UI, run focused tests, and commit `feat(lessons): enforce ai-only tutor sessions`.

## Stage 3 — Rich chat, citations, and PDF figures

### Task 6: Structured TutorTurn and one repair attempt

**Files:**

- Create: `packages/domain/src/tutor-turn.ts`
- Create: `packages/application/src/tutor-turn-validation.ts`
- Modify: `packages/application/src/provider-ports.ts`
- Modify: `packages/application/src/lesson-use-cases.ts`
- Modify: `packages/infrastructure/src/providers/openai-compatible-gateway.ts`
- Modify: `packages/infrastructure/src/providers/mock-provider-gateway.ts`
- Modify: `packages/infrastructure/src/database/migrations.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.ts`
- Test: focused tests beside each file

- [ ] Write failing tests for `TutorTurn` parsing, narration/response separation, citation/figure ownership, and invalid output rejection.
- [ ] Write failing tests proving exactly one same-provider repair request occurs and no tutor message/diagnosis is fabricated after a second failure.
- [ ] Implement structured JSON generation, validation, repair prompt, safe failure summaries, and migration 18 persisted turn metadata.
- [ ] Run focused tests and commit `feat(lessons): add structured tutor turns`.

### Task 7: Safe Markdown and LaTeX message renderer

**Files:**

- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/desktop/src/renderer/src/lesson/RichMessage.tsx`
- Create: `apps/desktop/src/renderer/src/lesson/rich-message-schema.ts`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonConversation.tsx`
- Modify: `apps/desktop/src/renderer/src/styles/global.css`
- Test: `apps/desktop/src/renderer/src/lesson/RichMessage.test.tsx`
- Test: `apps/desktop/src/renderer/src/lesson/LessonConversation.test.tsx`

- [ ] Add exact versions of `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, and `rehype-sanitize`.
- [ ] Write failing tests for inline/display math, tables, code, links, HTML/script stripping, user formulas, tutor narration italics, and normal response text.
- [ ] Implement a single safe Renderer-only Markdown pipeline and Claude-style readable typography.
- [ ] Run focused tests and commit `feat(renderer): render safe markdown and latex`.

### Task 8: Citation cards and evidence navigation

**Files:**

- Modify: `packages/contracts/src/lesson.ts`
- Create: `apps/desktop/src/renderer/src/lesson/CitationCard.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/RichMessage.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Test: matching Contracts/Renderer tests

- [ ] Write failing tests for compact emphasized citation cards containing quote, page/section, rationale, and “回到来源”.
- [ ] Implement verified citation DTO mapping and lazy reader focus without changing chat scroll anchors.
- [ ] Run focused tests and commit `feat(renderer): add cited evidence cards`.

### Task 9: PDF page and figure asset pipeline

**Files:**

- Create: `packages/domain/src/document-figure.ts`
- Modify: `packages/application/src/document-ports.ts`
- Modify: `packages/application/src/document-use-cases.ts`
- Modify: `packages/infrastructure/src/database/migrations.ts`
- Create: `packages/infrastructure/src/documents/pdf-figure-extractor.ts`
- Create: `packages/infrastructure/src/documents/local-document-asset-store.ts`
- Modify: `packages/infrastructure/src/database/sqlite-document-import-repository.ts`
- Modify: `apps/desktop/src/main/composition-root.ts`
- Test: focused tests and PDF fixtures under `packages/infrastructure/src/documents/fixtures/`

- [ ] Write failing tests for figure-caption matching (`Figure`, `Fig.`, `图`), page crop fallback, controlled asset IDs, cancellation, resume, and idempotent retry.
- [ ] Add migration 19 for page render and `document_figures` metadata, then implement page rendering/cropping behind ports.
- [ ] Ensure textual PDFs without figures still import successfully and scanned PDFs retain the existing stable rejection.
- [ ] Run focused tests and commit `feat(documents): extract pdf figure assets`.

### Task 10: Figure cards in chat

**Files:**

- Modify: `packages/contracts/src/document.ts`
- Modify: `packages/contracts/src/app-info.ts`
- Create: `apps/desktop/src/main/ipc/document-asset-handlers.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/src/lesson/FigureCard.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/RichMessage.tsx`
- Test: matching IPC/Preload/Renderer tests

- [ ] Write failing tests proving only current-document figure IDs resolve and unknown/cross-document assets fail safely.
- [ ] Expose an explicit controlled asset URL API and render figure, caption, page, and evidence navigation after the citing reply.
- [ ] Run focused tests and commit `feat(renderer): display verified pdf figures`.

## Stage 4 — Lesson lifecycle and export

### Task 11: Lesson lifecycle, pace, memory, and review gate

**Files:**

- Modify: `packages/domain/src/lesson.ts`
- Modify: `packages/contracts/src/lesson.ts`
- Modify: `packages/application/src/lesson-use-cases.ts`
- Modify: `packages/application/src/lesson-ports.ts`
- Modify: `packages/infrastructure/src/database/migrations.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.ts`
- Test: matching layer tests

- [ ] Write failing tests for `preparing/active/summarizing/pending_review/reviewing/completed/paused/error` transitions.
- [ ] Write failing tests for slow/standard/fast prompt constraints, AI-only end summary, cumulative document memory, immediate-review/rest choice, and completion only after saved review.
- [ ] Add migration 20 for lifecycle, summaries, memories, and operation idempotency; implement `EndLesson`, `ChoosePostLessonAction`, and `CompleteLessonReview`.
- [ ] Run focused tests and commit `feat(lessons): complete lesson lifecycle`.

### Task 12: Lifecycle controls and hierarchical history UI

**Files:**

- Modify: `apps/desktop/src/main/ipc/lesson-handlers.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonSessionTree.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Create: `apps/desktop/src/renderer/src/lesson/LessonPreparationDialog.tsx`
- Create: `apps/desktop/src/renderer/src/lesson/LessonEndDialog.tsx`
- Test: matching files

- [ ] Write failing tests for pace/tutor preparation, ending cancellation/retry, immediate review, rest, resumed pending review, and completed session labels.
- [ ] Implement explicit lifecycle IPC and UI states; retain many sessions per document ordered newest first.
- [ ] Run focused tests and commit `feat(desktop): add lesson preparation and completion`.

### Task 13: Markdown and PDF exports

**Files:**

- Create: `packages/application/src/lesson-export-ports.ts`
- Create: `packages/application/src/lesson-export-use-cases.ts`
- Create: `packages/infrastructure/src/export/markdown-lesson-exporter.ts`
- Create: `packages/infrastructure/src/export/pdf-lesson-exporter.ts`
- Create: `apps/desktop/src/main/ipc/lesson-export-handlers.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Test: focused unit/integration/Renderer tests

- [ ] Write failing tests for complete message order, tutor/user labels, LaTeX source, citation/figure assets, UTF-8 Chinese, and secret/debug-prompt exclusion.
- [ ] Write failing tests for save-dialog cancellation, persisted job state, idempotent retry, and safe errors.
- [ ] Implement explicit save dialogs, Markdown resource directory, rendered PDF, progress/cancel UI, and commit `feat(export): add lesson markdown and pdf export`.

## Stage 5 — Context compression and hardening

### Task 14: Token budget and context snapshot model

**Files:**

- Create: `packages/domain/src/context-snapshot.ts`
- Create: `packages/application/src/context-budget.ts`
- Modify: `packages/application/src/lesson-ports.ts`
- Modify: `packages/infrastructure/src/database/migrations.ts`
- Modify: `packages/infrastructure/src/database/sqlite-lesson-repository.ts`
- Test: focused Domain/Application/Infrastructure tests

- [ ] Write failing tests for model-aware estimates, default remaining-30% trigger, configurable 10–50% bounds, recent-turn preservation, and full raw-history retention.
- [ ] Add migration 21 for immutable `context_snapshots` and active snapshot pointers.
- [ ] Implement deterministic budget calculations and auditable snapshot persistence.
- [ ] Run focused tests and commit `feat(context): add token budgets and snapshots`.

### Task 15: AI rolling compression and recovery

**Files:**

- Modify: `packages/application/src/provider-ports.ts`
- Modify: `packages/application/src/lesson-use-cases.ts`
- Modify: `packages/infrastructure/src/providers/openai-compatible-gateway.ts`
- Modify: `packages/infrastructure/src/providers/mock-provider-gateway.ts`
- Test: focused tests

- [ ] Write failing tests that trigger compression before the next tutor request and preserve facts, mastery, misconceptions, unresolved questions, citations, figures, tutor/pace, and recent turns.
- [ ] Write failing tests for persisted `started/succeeded/failed/cancelled`, retry without duplicate snapshots, and continuing with the previous valid snapshot after compression failure.
- [ ] Implement AI structured compression behind the provider port with no local semantic summary fallback.
- [ ] Run focused tests and commit `feat(context): add automatic ai compression`.

### Task 16: Context controls and diagnostics UI

**Files:**

- Modify: `apps/desktop/src/renderer/src/settings/ClassroomPreferencesEditor.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonInfoDrawer.tsx`
- Modify: `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx`
- Test: matching Renderer tests

- [ ] Write failing tests for threshold settings, context usage display, compression status, cancel/retry, and unobtrusive failure messaging.
- [ ] Implement controls and diagnostics without placing technical records in the normal chat stream.
- [ ] Run focused tests and commit `feat(renderer): add context compression controls`.

## Final acceptance

### Task 17: End-to-end journeys, documentation, and release gates

**Files:**

- Modify: `tests/e2e/app.spec.ts`
- Create: `tests/e2e/ai-first-stages.spec.ts`
- Modify: `docs/planning/current-status.md`
- Modify: `docs/planning/software-design-completion-roadmap.md`
- Modify: `docs/planning/provider-cloud-release-acceptance.md`
- Create: `docs/testing/ai-first-workspace-manual-test.md`

- [ ] Add E2E for settings/profile/avatar, AI-only start, rich LaTeX/citation/figure chat, multi-session lesson completion, restart recovery, both exports, and forced context compression.
- [ ] Add a real-DeepSeek opt-in acceptance path that reads the key only through the existing secure UI/Vault path and redacts all artifacts.
- [ ] Run `pnpm check`, `pnpm test:e2e`, `pnpm package:dir`, and packaged persistence E2E; repair only evidence-backed failures.
- [ ] Perform requirement-by-requirement audit against the design acceptance criteria, update planning docs, request code review, and integrate only after all gates pass.
