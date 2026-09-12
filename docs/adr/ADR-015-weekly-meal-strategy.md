# ADR-015: Provider-independent weekly meal strategy (PLAN-004)

## Status

Accepted

## Context

PLAN-003 generates one detailed `RecipeCandidate` per call. Weekly planning needs a higher orchestration layer that designs seven days of meal *concepts* from nutrition targets plus PLAN-001/002 preferences, before any detailed recipe resolution.

The mobile client must never call an LLM or hold provider credentials. The model must not invent authoritative nutrition. Variety preferences must influence planning qualitatively without rigid recipe-count quotas.

## Decision

- Introduce a provider-independent `WeeklyStrategyGenerator` interface in `packages/domain`.
- Implement `GeminiWeeklyStrategyGenerator` in `packages/llm`, reusing the existing Gemini content client and server-only LLM config from PLAN-003.
- Return structured meal concepts (`WeeklyMealStrategy`) with explicit `conceptId` / `repeatOfConceptId` repetition, not detailed recipes.
- Version prompts as `weekly-strategy-v1`.
- Validate structure deterministically (exactly seven unique days, prep intents, concept references) and calculate `uniqueConceptCount` + `WeeklyStrategyStats` in code.
- Expose generation via Supabase Edge Function `generate-weekly-strategy` (`POST`).
- Do not call `RecipeGenerator` from PLAN-004.

## Consequences

- Domain/contracts stay free of Gemini SDK types.
- Future recipe resolution can extract unique concepts from `WeeklyMealStrategy` and reuse PLAN-003 as a worker.
- USDA verification, portion solving, grocery aggregation, and weekly UI remain later stories.
