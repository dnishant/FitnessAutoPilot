# ADR-002: Deterministic Nutrition

## Status

Accepted

## Context

Nutrition targets and meal macros must be trustworthy, auditable, and reproducible. AI may later help choose recipes, but must never invent authoritative nutrition values.

## Decision

- All authoritative nutrition math lives in pure TypeScript domain functions.
- Algorithms are versioned from day one (e.g. `nutrition-target-v1`).
- Inputs are snapshotted when targets/prescriptions are persisted.
- Rounding rules are explicit and documented.
- Mobile UI must not be the source of truth for calorie/macro totals.
- Server-side code re-runs domain logic before persisting prescriptions.

## Consequences

- Same inputs always produce the same outputs.
- Historical analysis remains possible even if algorithms change later.
- Unit tests are mandatory for every nutrition engine.
