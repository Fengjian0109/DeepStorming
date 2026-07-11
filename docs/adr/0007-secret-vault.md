# ADR-0007: Store Provider secrets in an encrypted file vault

- Status: Accepted
- Date: 2026-07-11

## Context

Phase 2 introduces user-configured Provider credentials. API keys must not be stored in Renderer
state, SQLite plaintext, logs, fixtures, snapshots, or IPC responses. Provider metadata still needs
to reference whether a credential exists and support create, update, delete, idempotent replay, and
crash recovery.

## Decision

Store Provider credentials in an encrypted file vault under Electron `userData`, using Electron
`safeStorage` as the encryption boundary. SQLite stores only an opaque random `secret_ref`; public
Provider projections expose only `hasApiKey: boolean`.

Vault references are random UUID-like filenames ending in `.secret`. The vault validates references
before access, writes encrypted bytes to a temporary file, links/publishes them into place, applies
private file mode, and removes temporary or orphaned files during reconciliation. Successful secret
files use owner-only permissions where the platform supports it.

Application use cases order writes so that new secrets are written before database references are
committed. Old secrets are removed after committed update/delete operations. Cleanup failures are
reported through a non-throwing cleanup reporter with only stable references and error codes.

## Crash windows and reconciliation

Startup reconciliation compares database-referenced `secret_ref` values with vault-managed files and
removes encrypted files that are no longer referenced. This covers:

- a new encrypted secret written before the database transaction fails;
- an updated database row whose previous secret deletion failed;
- an interrupted vault publication that left a temporary or duplicate filesystem entry.

The reconciler only touches files matching the vault reference format and does not scan arbitrary
userData files.

## Renderer and IPC boundary

Renderer code never receives raw credentials, encrypted bytes, `secret_ref`, Authorization headers,
or provider SDK objects. Preload exposes explicit Provider APIs only. IPC handlers validate strict
contracts, call one use case, and map failures to stable error codes and safe messages.

## Rejected alternatives

- Store plaintext or masked API keys in SQLite: masked values are still user secrets for lifecycle
  purposes and are easy to confuse with real credentials on update.
- Store secrets in Renderer state or localStorage: violates the desktop security boundary.
- Store raw credentials in logs, fixtures, or snapshots for testing: creates avoidable leakage risk;
  tests use fake values and assert serialized output excludes secret fields.
- Put encrypted blobs directly in Provider rows: makes cleanup and crash-window reconciliation
  harder than opaque file references.

## Consequences

- Secret Vault code must stay in Infrastructure/Main boundaries; Renderer may only know whether a
  Provider has a key.
- Provider type or credential changes clear stale test status because a previous success no longer
  proves the current secret/configuration works.
- Deletion retry and startup reconciliation are part of normal reliability, not a best-effort
  maintenance task.
