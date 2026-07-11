# ADR-0006: Use better-sqlite3 for local provider persistence

- Status: Accepted
- Date: 2026-07-11

## Context

Phase 2 needs a local authoritative store for Provider metadata, request idempotency records,
connection-test operation history, migration checksums, and future lesson data. The desktop app also
needs deterministic write transactions around Provider updates, activation, and test status
transitions.

Electron packaging makes native SQLite bindings more sensitive than ordinary Node dependencies:
the binding must be rebuilt for Electron ABI before desktop execution and restored for Node ABI
before Vitest and development scripts use it again.

## Decision

Use `better-sqlite3` `12.11.1` as the SQLite binding for Infrastructure and declare the same exact
runtime dependency from `@deepstorming/desktop` so the bundled Main process can resolve the native
external module in development and packaged builds.

The database is opened in Electron Main at `app.getPath('userData')/deepstorming.sqlite3`. On open,
DeepStorming sets:

- `journal_mode = WAL`
- `foreign_keys = ON`
- `synchronous = NORMAL`
- `busy_timeout = 5000`

Migrations are checksummed by name and SQL, recorded in `schema_migrations`, and applied in
transactions. Migration 1 is `provider_foundation`, creating `app_settings`, `ai_providers`,
`provider_write_requests`, and `provider_test_operations`.

## Rationale

`better-sqlite3` gives synchronous transaction semantics that match the Provider use cases: a write
operation can atomically validate current state, update Provider rows, store idempotent outcomes, and
return a stable result without an async callback boundary inside the transaction. This keeps
Application logic simple while preserving the architecture rule that Infrastructure implements
persistence details.

## Evidence

On macOS arm64, `pnpm package:dir` rebuilt native modules for Electron `43.1.0`, produced
`apps/desktop/release/mac-arm64/DeepStorming.app`, and then restored the Node ABI. The final packaged
persistence proof passed with:

```bash
pnpm exec playwright test tests/e2e/packaged-provider.spec.ts
```

The E2E script also rebuilds Electron ABI before Playwright and restores Node ABI in `finally`; a
unit test verifies restoration still runs if the Electron rebuild phase fails.

## Rejected alternatives

- `sqlite3`: async callback-style API makes transaction boundaries and deterministic idempotency
  outcomes harder to reason about.
- SQLite WASM in Renderer: violates the Renderer boundary, complicates file-system access, and
  would place persistence closer to UI state.
- Plain JSON files: insufficient for atomic Provider activation, idempotent write outcomes,
  migration checksums, and future relational lesson data.

## Consequences

- Electron upgrades require rebuilding native modules and rerunning `pnpm test:e2e`,
  `pnpm package:dir`, and the packaged persistence proof.
- Scripts that switch the native module to Electron ABI must restore Node ABI before handing control
  back to Vitest or ordinary Node development commands.
- Runtime SQLite access remains isolated to Infrastructure and Electron Main composition; Renderer
  never imports SQLite or `better-sqlite3`.
