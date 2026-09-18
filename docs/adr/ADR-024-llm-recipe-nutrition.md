# ADR-024: LLM-estimated recipe nutrition as planning source of truth

## Status

Accepted

## Context

PLAN-009 (USDA food resolution) and PLAN-010 (portion solving) required ingredient-level USDA resolution before a recipe could enter the weekly plan. Failures produced `partial` / `blocked` / `pending_portioning` states, and the UI hid macros. Separately, serving display multiplied `recipe_scale × baseServings`, producing incorrect labels such as “4.8 servings”.

## Decision

1. **Generated recipes must be nutritionally complete before weekly planning.**
   `ResolvedRecipe.nutrition` (`source: "llm_estimate"`) with `total` and `perServing` is the active macro source.
2. **USDA is not on the critical planning path.** Food-resolution infrastructure remains for future verification only.
3. **Macro sanity validation** rejects impossible LLM output (calorie vs 4-4-9 consistency, total vs perServing, lightweight ingredient plausibility).
4. **`personalServings`** means authored servings of the recipe (1.0 = one serving). Never `scale × baseServings`.
5. **Taste-first optimization** is encoded in a reusable prompt fragment; nutrition is estimated from the final ingredient list after optimization.

## Consequences

- Weekly personalization prefers `recipe.nutrition` over USDA `RecipeNutritionResult`.
- USDA `resolveRecipeNutrition` is optional and non-blocking.
- Recipe detail / meal UI distinguish batch recipe vs your portion using shared scaling helpers.
- Future verification architecture may reintroduce USDA as a comparison layer without restoring it as the planning blocker.
