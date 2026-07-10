# ADR-0005: Keep lesson control in a deterministic state machine

- Status: Accepted
- Date: 2026-07-10

## Context

An LLM-only tutoring loop is difficult to reproduce, can ask endlessly, and cannot guarantee safe
retries or consistent persistence.

## Decision

The application owns lesson state, legal transitions, hint limits, idempotency, and completion.
Models produce structured candidate actions and assessments that the Domain validates.

## Consequences

- Pedagogy rules can be unit tested with a Mock Provider.
- Prompt design remains important but is no longer the only control layer.
- Model proposals may be rejected or repaired before they affect persistent lesson state.
