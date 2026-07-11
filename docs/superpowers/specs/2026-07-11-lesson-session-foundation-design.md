# Lesson Session Foundation Design

- Date: 2026-07-11
- Status: Approved for implementation
- Scope: Phase 5 entry slice for local lesson sessions

## Goal

Build the smallest usable lesson-session foundation: a user can start a local classroom session from a document or search result, persist the source context, reopen the session, and see it after app restart.

## Selected Approach

Use a local `LessonSession` skeleton before adding model calls. This keeps the classroom workflow deterministic and preserves the architecture rule from ADR-0005: application state owns lesson control, while AI generation can be added later as a separate use case.

## Domain

Add lesson concepts in `packages/domain`:

- `LessonSessionStatus = 'active' | 'archived'`
- `LessonSession`
- `LessonSourceAnchor`
- `LessonStartDraft`
- `normalizeLessonStartDraft`

The first source-anchor shape is text based:

- `documentId`
- `startOffset`
- `endOffset`
- `snippet`

Offsets are character offsets into the current text document version. PDF page, block, chunk, and bounding-box fields remain future work.

## Application

Add lesson ports and use cases in `packages/application`:

- `LessonRepositoryPort`
- `StartLessonFromDocument`
- `GetLessonSession`
- `ListLessonSessions`

`StartLessonFromDocument` validates the draft, verifies the document still exists through `DocumentRepositoryPort.findById`, and stores the session plus one source anchor. It does not call Provider APIs.

Stable lesson errors:

- `LESSON_VALIDATION_FAILED`
- `LESSON_DOCUMENT_NOT_FOUND`
- `LESSON_NOT_FOUND`
- `DATABASE_UNAVAILABLE`
- `INTERNAL_ERROR`

## Infrastructure

Add migration 3:

- `lesson_sessions`
- `lesson_source_anchors`

The SQLite repository stores sessions transactionally and lists newest sessions first. Source anchors cascade when a session is deleted in future work.

## Contracts And IPC

Expose explicit lesson APIs:

- `lessons:list`
- `lessons:start-from-document`
- `lessons:get`

Renderer receives session DTOs only; no provider secret, document full text, or SQLite internals are exposed.

## Renderer

Add a lightweight lesson workspace and document entry points:

- Sidebar enables `课堂`.
- Document detail has `开始课堂`.
- Search results have `用此片段开始课堂`.
- Starting a lesson shows loading/success/error and navigates to the lesson workspace.
- Lesson workspace lists local sessions and displays source snippets.

## Non-Goals

- No model call.
- No streaming.
- No TutorAction state machine.
- No message turns.
- No assessment or review scheduling.
- No PDF coordinates or visual highlight.

## Verification

- Unit tests for domain normalization and application error mapping.
- SQLite repository and migration tests.
- Contract, IPC, preload, and renderer tests.
- E2E: create/import/search a document, start a lesson from a source, restart, and confirm the lesson persists.
