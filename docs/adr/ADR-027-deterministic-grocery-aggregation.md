# ADR-027: Deterministic grocery aggregation

## Status

Accepted — 2026-09-18

## Context

After PLAN-011 finalizes a personalized weekly nutrition plan, the Grocery tab still
showed an empty shell. Ingredient demand must be an accounting consequence of the
finalized prescription and resolved recipes — never an LLM reinterpretation of meal
names.

## Decision

1. **Derivation timing:** Run PLAN-012 immediately after successful PLAN-011
   finalization inside `personalizeAndFinalizeGeneratedPlan`, and persist the
   resulting `GroceryList` on `ConsumerWeeklyPlan.groceryList`.
2. **Source of demand:** Finalized `personalServings` / atomic portion amounts.
3. **Source of ingredients:** Resolved recipes + CompleteMeal component definitions.
4. **Aggregation order:** Sum repeated recipe demand by stable recipe/component ID
   first, then expand ingredients once (prevents per-meal rounding inflation).
5. **Identity:** Prefer `canonicalFoodId` + measurement state; fall back to
   normalized name + state. Never aggregate by display name or culinary role alone.
6. **Units:** Merge only with trusted conversions (mass↔mass, volume↔volume
   equivalences, food-specific provider measures). Preserve incompatible lines.
7. **Ownership:** Nutrition ownership does not suppress grocery expansion. Parent-
   owned substructure is covered by the main recipe ingredients (no double expand).
8. **Checklist:** User "got it" / "already have" state is plan-scoped client state
   and must not mutate grocery demand or nutrition.
9. **Policy version:** `grocery-aggregation-policy-v1`.

## Consequences

- Grocery tab renders production data from the generated plan.
- Regenerating a plan creates a new grocery list version (new `generatedPlanId`).
- PLAN-013 meal-prep optimization can consume trustworthy weekly ingredient demand.
- No dedicated grocery table in MVP — list lives in `consumer_weekly_plans.plan_json`.
