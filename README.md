# DeepStorming

DeepStorming is a local-first desktop application for Socratic learning, Feynman
understanding, and deep academic paper reading.

## Status

The project is being rebuilt from an empty repository. Phase 0–1 establishes the Electron
security boundary, modular workspace, typed IPC, tests, and packaging baseline. PDF import,
AI providers, and lesson workflows are intentionally not implemented in this phase.

## Prerequisites

- Node.js 24.14.0
- pnpm 11.7.0
- macOS for the primary desktop acceptance run

## Commands

```bash
pnpm install
pnpm dev
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm package:dir
```

## Architecture

```text
Renderer → IPC Contracts → Application → Domain
Main composes Application with Infrastructure adapters
```

The Renderer cannot import Electron, Node.js, SQLite, or infrastructure packages. The Domain
cannot import framework or platform modules.

See the documents under `docs/` for the product specification, architecture, database model,
and development gates.
