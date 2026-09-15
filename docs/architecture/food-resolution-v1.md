# Food resolution v1 (PLAN-009)

## Role

Turn PLAN-008 structured recipe ingredients into **canonical foods** and **deterministic base-recipe nutrition**.

```
PLAN-008 Resolution → PLAN-009 Food resolution + nutrition → PLAN-010 Portion solver
```

PLAN-009 answers: *What food is this, and what nutrition does this quantity contribute?*  
It does **not** answer: *How much should this user eat?*

## Trust model

- USDA FoodData Central is the first `FoodDataProvider` implementation.
- Provider responses are mapped into a provider-independent `CanonicalFood`.
- Calories/macros are never calculated by Gemini.
- Optional Gemini disambiguation may only choose among supplied provider candidate IDs (`food-disambiguation-v1`).

## Policy versions

| Policy | Version |
| --- | --- |
| Food resolution | `food-resolution-v1` |
| Nutrition calculation | `nutrition-calculation-v1` |
| Quantity normalization | `quantity-normalization-v1` |
| Semantic disambiguation prompt | `food-disambiguation-v1` |

## Key types

- `CanonicalFood` — per-100g nutrients + provenance + optional measures
- `FoodDataProvider` — `searchFoods` / `getFood`
- `FoodResolver.resolve(ingredient)` → resolved | ambiguous | not_found
- `QuantityNormalizer.toGrams` — mass direct; household via provider measures only
- `RecipeNutritionResult` — ingredient breakdown + totals + completeness quality

## Completeness

- `complete` — all quantity-bearing ingredients resolved and converted
- `partial` — main ingredients ok; recommended/optional components lack quantities
- `blocked` — required ingredient ambiguous/not found/unconvertible

Recommended sides without quantities stay `pending_portioning` (no invented grams).

## Edge / preview

- Edge Function: `resolve-recipe-nutrition` (server-side `USDA_API_KEY`)
- Dev CLI: `pnpm resolve:recipe-nutrition:dev`
- Mobile preview: `/food-resolution-preview`

## Concurrency

Default provider concurrency: `4` (`DEFAULT_FOOD_RESOLUTION_CONCURRENCY`). Request-level ingredient key dedupe + mapping/food caches reduce USDA calls.
