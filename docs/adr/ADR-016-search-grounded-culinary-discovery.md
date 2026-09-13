# ADR-016: Search-grounded culinary discovery (PLAN-005)

## Status

Accepted

## Context

Weekly strategy generation (PLAN-004) can produce structurally sound seven-day plans, but Gemini repeatedly converges on high-probability generic dishes (tikka-family Indian meals, fajita/taco bowls, marinara staples). Changing protein is not meaningful culinary variety.

Hypothesis: Gemini will produce substantially better culinary variety if its role shifts from inventing recipes from memory to searching the live web for source-backed dishes.

The previous PLAN-005 attempt used Edamam Recipe Search and was reverted. This ADR covers the replacement: Gemini + Google Search grounding.

## Decision

- Introduce a provider-independent `CulinaryDiscoveryProvider` in `packages/domain`.
- Implement `GeminiGroundedCulinaryDiscoveryProvider` in `packages/llm` using `@google/genai` with the `googleSearch` tool (not legacy `googleSearchRetrieval`). Because Gemini 3.x currently suppresses grounding metadata when `responseJsonSchema` / JSON mime type are combined with Search, discovery uses search-first prompt JSON (fenced) and validates with Zod/domain schemas instead of Gemini structured-output mode.
- Version prompts as `culinary-discovery-v1`.
- Preserve safe grounding metadata (search queries, chunks, supports) without fabricating URLs or shipping search-widget HTML.
- Validate candidates deterministically (schema, unique IDs/names, hard constraints, provenance).
- Expose discovery via Edge Function `culinary-discovery` and a development preview screen.
- Do **not** integrate with `WeeklyStrategyGenerator`, detailed recipe generation, USDA, or portion solving in this slice.

## Consequences

- Discovery can be judged independently before weekly planning consumes candidates.
- Domain/contracts remain free of Gemini SDK types.
- Grounding relies on Gemini 3 series `googleSearch` support; JSON is extracted from the model reply and validated locally. Failures surface as typed `DISCOVERY_NOT_GROUNDED` / provider errors.
- Permanent meal-history persistence and ranking engines remain later work (request-level recent concepts only for now).
