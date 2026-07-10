# DeepStorming engineering rules

These rules apply to the entire repository.

## Architecture boundaries

- `packages/domain` must remain framework- and platform-independent.
- `packages/application` may depend on Domain and declare Ports, but must not import Electron,
  React, SQLite, file-system, or provider SDKs.
- `packages/infrastructure` implements Application Ports.
- Renderer code may import Contracts and UI modules only. It must not import Electron, Node.js,
  Application, Domain, Infrastructure, SQLite, or AI provider SDKs.
- Main Process is the composition root. IPC handlers validate input, call one use case, and map
  errors; they do not contain business logic.
- Preload exposes explicit APIs. Never expose a generic IPC `invoke` function.

## Reliability rules

- Every user-triggered asynchronous flow must expose loading, success, error, and cancellation
  behavior where cancellation is meaningful.
- Never add an empty `catch`. Convert failures to stable error codes and safe user messages.
- Persist long-running job state before starting external work.
- Make retryable writes idempotent.
- Do not store API keys, authorization headers, or raw secrets in Renderer state, SQLite plaintext,
  logs, fixtures, or snapshots.

## Development workflow

- Use exact dependency versions.
- Add or update tests with every business rule.
- Run `pnpm check` before marking an implementation phase complete.
- Run `pnpm test:e2e` on a desktop-capable environment before release.
- Update the relevant document under `docs/` when a product or architecture decision changes.
