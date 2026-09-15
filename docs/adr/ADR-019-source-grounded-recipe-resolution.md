# ADR-019: Source-grounded recipe resolution

## Status

Accepted (PLAN-008)

## Context

PLAN-007 / 007.1 produce a practical weekly strategy of lunch+dinner culinary candidates. Those candidates are provenance-backed meal *ideas*, not cookable recipes. Downstream nutrition (USDA matching, portion solving) needs a structured culinary recipe per unique dish — without destroying identity via macro-driven mutation, and without resolving the same dish once per meal slot.

PLAN-003 already generates AI-original recipes from preferences. PLAN-008 is different: it resolves a **selected** PLAN-005 candidate into a structured Fitness Autopilot recipe, preserving source culinary identity.

## Decision

- Introduce provider-independent `RecipeResolver` in `packages/domain` with Gemini adapter `GeminiRecipeResolver` in `packages/llm`.
- Prompt version: `recipe-resolution-v1`.
- Resolve **unique** `candidateId`s only (concurrency default 3). Weekly slots reference the shared resolved recipe.
- Preserve PLAN-005 source provenance; use Google Search grounding to verify culinary identity (not to substitute dishes). Do not copy copyrighted source prose.
- Taste first: no calorie/macro optimization in the resolver prompt. No authoritative nutrition fields on `ResolvedRecipe`.
- Structured ingredients include role + scalingBehavior (+ optional scalingReferenceIngredientId) for a future portion solver.
- Meal components are separate from the main recipe ingredient list (`intrinsic` / `recommended_side` / `optional`).
- Prep modes reuse weekly `PrepIntent` values and include advance/finish tasks.
- Failures are typed per candidate; never silently substitute another dish.
- Deprecate `useDinnerPrepForNextLunch` as a user preference: stop collecting it in onboarding; planner always may use shared/piggyback prep when evidence supports it. Persist storage-compat values for the existing DB column; do not drop the column in this slice.

## Consequences

- Edge Function `resolve-recipes` + mobile/dev preview for unique-candidate resolution.
- PLAN-007 prompt bumped to `weekly-strategy-ranked-v1.2.0` (shared prep is automatic).
- Later stages (PLAN-009+) own USDA matching, portion solving, week nutrition validation, and prep-session optimization.
