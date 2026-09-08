# Nutrition rounding rules

Authoritative domain calculations use these rules consistently:

| Quantity | Rule |
|---|---|
| Calories (kcal) | Round half-up to nearest integer |
| Protein / carbs / fat (g) for recipe nutrition | Round half-up to 1 decimal place |
| Protein / fat / carbs (g) for `macro-policy-v1` display | Round half-up to nearest whole gram; persist full precision |
| Ingredient grams | Round half-up to nearest integer gram (portioning output) |

## Invariants

1. `recipeNutrition = sum(ingredientNutrition)` after per-ingredient rounding, then recipe-level macros are re-summed (not re-derived from calories).
2. Macro calorie reconciliation for targets: `protein*4 + carbs*4 + fat*9` must be within **±2%** of target calories (or ±30 kcal, whichever is larger) for acceptance tests of `nutrition-target-v1`. For `macro-policy-v1`, full-precision protein + fat + carb calories must equal the calorie target exactly before display rounding.
3. Daily plan tolerance (planner): calories within **±8%** of daily target; protein may not undershoot by more than **15%** (overshoot allowed in v1).
4. Meal portioning tolerance: calories within **±8%** of meal calorie target; protein may not undershoot by more than 12% (overshoot allowed in v1 for high-protein recipes).

Negative macros are never returned; invalid inputs yield controlled failures.
