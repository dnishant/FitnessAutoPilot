# ADR-016: Provider-independent recipe discovery

## Status

Accepted

## Context

Unconstrained LLM weekly strategy generation repeatedly falls back to generic
dishes. Fitness Autopilot needs a way to retrieve real-world recipe candidates
from external sources before planning, without coupling domain logic to a
specific vendor response shape.

## Decision

- Define `RecipeDiscoveryProvider` in `packages/domain` with normalized
  request/result types in `packages/contracts`.
- Implement Edamam Recipe Search API v2 as the first server-only adapter in
  `packages/llm` (alongside other credentialed server adapters).
- Expose discovery via Edge Function `recipe-discovery-search`.
- Keep credentials server-side (`EDAMAM_APP_ID` / `EDAMAM_APP_KEY`).
- Preserve attribution and source URLs; do not scrape instructions.
- Treat provider nutrition as non-authoritative metadata.
- Do **not** wire discovery into PLAN-004 weekly strategy yet.

## Consequences

- Domain code can swap providers without Edamam types leaking upward.
- Unsupported dietary constraints and dislikes are explicitly reported.
- External call volume is capped (≤ 4 searches per request).
- Planner still uses Gemini directly until a later PLAN integrates discovery.
