# Meal portion solver v1 (PLAN-010)

## Role

Turn a **complete meal** + explicit **meal nutrition intent** into personalized component quantities using deterministic math.

```
CompleteMeal + PLAN-009 trusted nutrition
        ↓
★ PLAN-010 Deterministic portion solver
        ↓
Personalized complete meals
        ↓
future PLAN-011 day/week balancing
```

PLAN-010 answers: *How much of each plate component should this user eat?*  
It does **not** decide how daily targets are split across breakfast/lunch/dinner/snacks (PLAN-011).

## Trust model

- Gemini/LLMs never choose grams, calories, macros, fiber, or optimization results.
- Nutrition coefficients are resolved/cached **before** solving (PLAN-009).
- Missing required calories/protein blocks solving — never treated as zero.
- Compound sides (Kachumber, Rice & Peas, Slaw, Chutney) scale as culinary units.
- Main recipes scale coherently (v1 does not independently optimize marinade ingredients).

## Policy version

| Policy | Version |
| --- | --- |
| Meal portion / culinary bounds | `meal-portion-policy-v1` |
| Solver algorithm | `meal-portion-solver-v1` |
| Fiber (upstream daily) | `fiber-policy-v1` |

## Algorithm

Coarse-to-fine deterministic search over 2–5 portion variables:

1. Build `PortionVariable`s from role policy + trusted nutrition coefficients
2. Coarse Cartesian product when ≤ ~12k candidates; else coordinate descent
3. Fine local refine
4. Practical rounding (grams / discrete counts)
5. **Recalculate** authoritative nutrition from rounded quantities

## Status

| Status | Meaning |
| --- | --- |
| `solved` | Within calorie tolerance and protein undershoot rules |
| `best_feasible` | Best culinary-feasible plate; expected for many meals |
| `blocked` | Missing yield/nutrition, invalid intent/bounds, or hard infeasibility |

## Developer preview

- Mobile: `/meal-portion-preview` (local, no network)
- Fixtures: Chicken Tikka, Jerk Chicken, Thai Green Curry, Shrimp Tacos
- Manual `MealNutritionIntent` is labeled developer/test — not production allocation

## Consumer UI (UI-001 integration)

Authoritative PLAN-010 results flow into the existing consumer plan:

```
Generate Plan → applyPersonalizedPortionsToMeals → ConsumerMealSlot
  → MealCard / Today (kcal · protein)
  → Meal Detail (Your plate + nutrition)
  → Recipe (optional Your portion when opened from a meal)
```

- Portions/nutrition are flattened onto `ConsumerMealSlot` for display — React never solves.
- Compound culinary units stay whole on Meal Detail (e.g. Kachumber), not ingredientized.
- `best_feasible` renders as a normal consumer meal; diagnostics stay in developer preview.
- `blocked` sets `portionStatus` with no invented quantities.
- Production intents today are **developer-test shares** of daily targets
  (`developerTestMealIntentFromDaily`). Legitimate meal-level allocation is **PLAN-011**.
- Without trusted coefficients for a candidate, the meal concept still shows; no fake macros.

## Non-goals

Daily allocation, grocery aggregation, prep scheduling, meal replacement, LLM portioning.
