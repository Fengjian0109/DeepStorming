# ADR-0002: Use a modular monolith with Ports and Adapters

- Status: Accepted
- Date: 2026-07-10

## Context

The product is a local single-user application, but PDF ingestion, tutoring, assessment, paper
analysis, and review need independent evolution and tests.

## Decision

Use workspace packages for Domain, Application, Contracts, Infrastructure, and Testkit. Main
Process composes adapters. Do not introduce microservices or an internal HTTP server for the MVP.

## Consequences

- Module boundaries are explicit without distributed-system overhead.
- Boundary lint rules and tests are required to prevent convenience imports from eroding the design.
