# Lesson Session Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local `LessonSession` foundation that can be started from a document/source snippet and reopened after restart.

**Architecture:** Follow existing DeepStorming boundaries: Domain defines lesson rules, Application owns use cases and ports, Infrastructure persists SQLite data, Main/Preload expose explicit IPC, and Renderer imports only Contracts/UI. The slice intentionally avoids model calls so lesson persistence and source anchoring are reliable before AI orchestration.

**Tech Stack:** TypeScript, React, Electron IPC, Zod contracts, better-sqlite3, Vitest, Playwright.

---

## File Structure

- `packages/domain/src/lesson.ts` / `.test.ts`: lesson types and draft normalization.
- `packages/application/src/lesson-ports.ts`: repository port and storage types.
- `packages/application/src/lesson-use-cases.ts` / `.test.ts`: start/list/get use cases and stable errors.
- `packages/contracts/src/lesson.ts` / `.test.ts`: IPC channels, DTOs, request/result schemas.
- `packages/infrastructure/src/database/migrations.ts` / `.test.ts`: migration 3 lesson tables.
- `packages/infrastructure/src/database/sqlite-lesson-repository.ts` / `.test.ts`: SQLite adapter.
- `apps/desktop/src/main/ipc/lesson-handlers.ts` / `.test.ts`: lesson IPC handlers.
- `apps/desktop/src/main/ipc/register-ipc.ts`, `apps/desktop/src/main/composition-root.ts`: composition root wiring.
- `apps/desktop/src/preload/index.ts` / `.test.ts`: explicit `window.deepstorming.lessons` API.
- `apps/desktop/src/renderer/src/lesson/LessonWorkspace.tsx` / `.test.tsx`: local session list/detail.
- `apps/desktop/src/renderer/src/document/DocumentLibrary.tsx` / `.test.tsx`: start-lesson entry points.
- `apps/desktop/src/renderer/src/app/App.tsx`: enable classroom navigation.
- `tests/e2e/app.spec.ts`: start lesson and restart persistence coverage.
- `docs/planning/current-status.md`, `docs/planning/phase-5-lesson-session-progress.md`: progress notes.

## Tasks

- [x] Task 1: Add Domain and Application lesson use cases with failing tests first.
- [x] Task 2: Add Contracts, IPC handlers, Preload API, and focused tests.
- [x] Task 3: Add SQLite migration/repository and persistence tests.
- [x] Task 4: Add Renderer classroom entry/workspace and focused UI tests.
- [x] Task 5: Add E2E persistence coverage, update docs, run `pnpm check` and `pnpm test:e2e`.
