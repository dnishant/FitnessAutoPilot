# Meal portioning & weekly nutrition personalization v1 (PLAN-010)

## Role

Turn a **generated weekly plan** + authoritative **daily nutrition targets** into a
personalized executable weekly nutrition prescription.

```
Selected CompleteMeals + PLAN-009 trusted nutrition + daily targets
        ↓
★ PLAN-010 Weekly Nutrition Personalization
   allocate → portion → reconcile
        ↓
PersonalizedWeeklyNutritionPlan
        ↓
★ PLAN-011 Validation & Finalization
   validate → classify → finalize (bounded PLAN-010 repair)
        ↓
Finalized prescription → Consumer UI (Today / Plan / Meal / Recipe)
```

PLAN-010 answers: *Exactly how much of the meals generated for THIS USER should they eat?*

PLAN-011 answers: *Can we trust the resulting weekly prescription enough to make it active?*

It does **not** invent foods, call LLMs for portions, or own grocery/prep optimization.

## Architecture principle

A PLAN story is complete only when domain logic, production orchestration, persistence/API
projection, consumer UI, UI states, and an end-to-end consumer acceptance path all exist.
Dev previews are diagnostics — never the definition of done.

## Trust model

- Gemini/LLMs never choose grams, calories, macros, fiber, or optimization results.
- Nutrition coefficients are resolved **before** solving (PLAN-009 plate pass / structural estimates).
- Missing **main** calories/protein blocks solving — never treated as zero.
- Required companions without USDA may use versioned estimates (`discrete-staple-estimate-v1`,
  then `role-structural-estimate-v1`). Recommended companions without nutrition are skipped.
- Compound sides scale as culinary units (ratios fixed upstream).
- Meal definitions (CompleteMeal) are distinct from meal instances (day + mealType slots).

## Policy versions

| Policy | Version |
| --- | --- |
| Daily allocation (breakfast/snack reserve) | `nutrition-allocation-policy-v1` |
| Meal portion / culinary bounds | `meal-portion-policy-v1` |
| Solver algorithm | `meal-portion-solver-v1` |
| Weekly personalization orchestration | `weekly-nutrition-personalization-v1` |
| Discrete staple gap-fill | `discrete-staple-estimate-v1` |
| Role/structural gap-fill (required sides) | `role-structural-estimate-v1` |
| Fiber (upstream daily) | `fiber-policy-v1` |

## Allocation policy (`nutrition-allocation-policy-v1`)

Culinary intelligence currently plans **lunch + dinner only**.

Assumptions:

- No authoritative breakfast/snack structure exists on the profile yet.
- Reserve **35%** of daily calories/macros for breakfast + snacks / unplanned eating.
- Of the remaining **65%** planned budget: lunch **54%** (~35% of daily), dinner **46%** (~30% of daily).
- Meal intents are **starting budgets** — daily reconciliation may adjust within culinary bounds.

## Algorithm

1. `DailyBudgetAllocator` — produce reserved + lunch/dinner intents
2. `PortionVariableBuilder` — role policy → recipe_scale / food_grams / count / fixed
3. `MealPortionSolver` — coarse-to-fine deterministic search + practical rounding + post-round nutrition
4. `DailyRebalancer` — evaluate lunch + dinner + reserved vs daily target; re-solve if improved
5. *(moved to PLAN-011)* `validateWeeklyNutritionPlan` / `finalizeWeeklyNutritionPlan` — integrity + nutrition quality gate before activation

## Status

| Status | Meaning |
| --- | --- |
| `solved` | Within calorie tolerance and protein undershoot rules |
| `best_feasible` | Best culinary-feasible plate; expected for many meals |
| `blocked` | Missing yield/nutrition, invalid intent/bounds, or hard infeasibility |

## Production path

```
Generate My Plan
  → discovery → rank → concepts (top-K pools) → weekly strategy
  → selected recipe resolution
  → selected CompleteMeal resolution
  → resolveCompleteMealNutrition (plate USDA when FoodResolver present)
  → PLAN-009 main-recipe nutrition (when available)
  → PLAN-010 personalizeWeeklyNutritionPlan
  → PLAN-011 finalizeWeeklyNutritionPlan
  → persist ConsumerWeeklyPlan (+ personalizedWeeklyPlan + validationReport)
  → Today / Plan / Meal Detail / Recipe
```

Token-preserving Generate My Plan knobs (behavior-preserving): discovery target 12 / pool 10,
composition neighbor-name cap 5, discovery grounding attempts 2, compact strategy complexity retry.

## Developer preview

- Mobile: `/meal-portion-preview` (fixtures + diagnostics)
- Fixtures allowed in tests/dev only — **never** as production fallbacks

## Non-goals

Grocery aggregation, prep scheduling, food logging, meal replacement, LLM portioning.
