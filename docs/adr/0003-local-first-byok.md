# ADR-0003: Use local-first storage and BYOK model access

- Status: Accepted
- Date: 2026-07-10

## Context

The MVP should not require an account service, central model proxy, or developer-funded inference.

## Decision

Store documents, indexes, lessons, and review data locally. Users configure their own provider API
key. Main Process calls the provider and sends only the evidence and context required for the task.

## Consequences

- No DeepStorming cloud backend is required for the MVP.
- Cloud use is not fully offline: selected excerpts and lesson context leave the device.
- Keys require operating-system-backed protection and must never enter Renderer state.
