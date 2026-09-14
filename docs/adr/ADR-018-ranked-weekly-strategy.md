# ADR-018: Ranked-candidate weekly meal strategy (PLAN-007)

## Status

Accepted

## Context

PLAN-004 can generate a structurally valid week of meal *concepts*, but Gemini invents dishes from memory. PLAN-005 discovers source-backed culinary candidates. PLAN-006 ranks, deduplicates, and diversifies those candidates.

PLAN-007 must compose a 7-day lunch + dinner strategy by **selecting and scheduling candidate IDs** from those ranked pools — not by inventing an unconstrained week.

## Decision

- Evolve the existing PLAN-004 `WeeklyStrategyGenerator` / `GeminiWeeklyStrategyGenerator` / `generate-weekly-strategy` Edge Function rather than creating a parallel weekly-planning stack.
- Add `RankedWeeklyStrategyGenerator.generateRankedWeeklyStrategy` on the same Gemini adapter.
- Version the prompt as `weekly-strategy-ranked-v1`.
- Use **one** Gemini structured-output call for the whole week (never 14 calls).
- Candidate IDs are authoritative. Hydrate names from the supplied pool. Do not provide an `original_concept` escape hatch.
- Insufficient pools, unknown IDs, cross-pool references, leftover-policy violations, piggyback when disabled, and obvious finish-time incompatibilities return typed failures. Do not silently repair arbitrary model output.
- Reuse PLAN-006 `computeCandidateSimilarity` for adjacent-meal quality diagnostics.
- Direct leftovers are a planner default, not a PLAN-002 setting: `MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK = 1`.
- PLAN-004 unconstrained generation remains available when the request has no candidate pools, so existing PLAN-004 tests and the previous request shape stay valid.
- The PLAN-004.5 preview (`/weekly-strategy-preview`) is evolved to load ranked lunch/dinner pools and generate the PLAN-007 week.

## Consequences

- Discovery finds food, ranking filters food, weekly strategy selects food.
- Recipe resolution, USDA nutrition, portions, and grocery optimization remain later stories (PLAN-009+).
- Domain/contracts stay free of Gemini SDK types.
