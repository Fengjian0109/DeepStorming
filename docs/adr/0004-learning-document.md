# ADR-0004: Model sources as LearningDocument

- Status: Accepted
- Date: 2026-07-10

## Context

DeepStorming starts with textbooks and later adds academic papers. A Book-centric schema would
force a second ingestion and citation system.

## Decision

Use a generic LearningDocument aggregate for files, pages, layout blocks, assets, chunks, outlines,
and source anchors. Textbook and Paper modules add their own profiles and workflows.

## Consequences

- Parsing, indexing, reading, and citation are shared.
- Textbook and paper pedagogy remain separate and cannot be reduced to one prompt.
