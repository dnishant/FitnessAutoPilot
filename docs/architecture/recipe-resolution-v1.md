# Recipe resolution v1 (PLAN-008)

## Role

Turn each unique culinary candidate from a weekly strategy into a precise, delicious, structured recipe.

```
PLAN-005 Discovery → PLAN-006 Ranking → PLAN-007/007.1 Strategy → PLAN-008 Resolution → PLAN-009 USDA…
```

## Trust model

- Gemini produces culinary structure only.
- Server stamps `candidateId`, source provenance, and `resolutionMetadata`.
- Authoritative calories/macros are never accepted from the model.
- Source articles inform identity; they are not copied verbatim.

## Deduplication

14 weekly lunch+dinner slots with a compact repertoire (e.g. 6 unique dishes) produce **6** resolver calls, not 14.

Default concurrency: `3` (`DEFAULT_RECIPE_RESOLUTION_CONCURRENCY`).

## Key types

- `ResolvedRecipe` — ingredients, instructions, prep modes, meal components, flavor/experience profiles
- `RecipeResolver.resolve(request)` — provider-independent
- `resolveWeeklyStrategyRecipes` / `resolveUniqueCandidates` — orchestration

## Prompt

`recipe-resolution-v1` — centralized in `packages/domain/src/recipes/recipe-resolution.ts`.

## Edge / preview

- Edge Function: `resolve-recipes`
- Dev CLI: `pnpm resolve:recipes:dev`
- Mobile preview: `/recipe-resolution-preview`

## Cooking preference change

`useDinnerPrepForNextLunch` is deprecated as a user-facing preference. Shared prep reuse is planner-owned. The DB column remains for compatibility; planning ignores the flag.
