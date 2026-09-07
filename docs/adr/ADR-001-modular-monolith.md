# ADR-001: Modular Monolith

## Status

Accepted

## Context

Fitness Autopilot needs clean boundaries between UI, domain logic, and infrastructure without the operational cost of distributed systems.

## Decision

Use a TypeScript modular monolith in a pnpm monorepo:

- `apps/mobile` — presentation
- `packages/domain` — pure business logic
- `packages/contracts` / `packages/validation` — shared schemas and results
- `supabase` — Postgres, RLS, Edge Functions

Dependency direction: UI → application services → domain → infrastructure.

## Consequences

- Shared deterministic logic can be unit-tested without a database.
- Edge Functions and (future) other clients reuse the same domain modules.
- We deliberately avoid microservices, Kafka, Redis, GraphQL, CQRS, and event sourcing until there is a measured need.
