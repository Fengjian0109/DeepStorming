# ADR-0001: Use Electron as the desktop runtime

- Status: Accepted
- Date: 2026-07-10

## Context

DeepStorming needs local files, PDF rendering, secure model credentials, SQLite, streaming AI, and
later Windows support. The previous Tauri implementation accumulated integration bugs and is not
being reused.

## Decision

Use Electron with React, TypeScript, and Vite. Keep Node.js disabled in Renderer, enable context
isolation and sandboxing, and expose a narrow Preload API.

## Consequences

- One TypeScript ecosystem and consistent Chromium behavior improve implementation predictability.
- Application size and memory use will be higher than a Tauri build.
- Security depends on keeping Main, Preload, and Renderer boundaries strict.
