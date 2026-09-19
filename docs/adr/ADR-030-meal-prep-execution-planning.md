# ADR-030: Deterministic meal-prep execution planning (PLAN-013)

## Status

Accepted — 2026-09-19

## Context

After PLAN-011 finalizes a personalized weekly nutrition plan and PLAN-012 derives
grocery demand, consumers still lack a coordinated kitchen session. Concatenating
four recipe instruction lists does not answer “what do I prep now?”

## Decision

1. **Derivation timing:** Run PLAN-013 immediately after successful PLAN-012 inside
   `personalizeAndFinalizeGeneratedPlan`, and persist `MealPrepPlan` on
   `ConsumerWeeklyPlan.mealPrepPlan`.
2. **Source of truth:** Finalized personal servings, resolved recipes, core repertoire,
   cooking preferences, and grocery list (for soft reconciliation). Never reconstruct
   meals from display names.
3. **Quantities:** Derive `requiredOutputServings` by summing personalized main-recipe
   servings per `coreMealId`. Keep `plannedCookOutputServings` and
   `expectedExcessServings` explicit. Do not silently invent large leftovers.
4. **Tasks:** Structured types — `mise_en_place`, `advance_prep`, `cook`,
   `portion_and_store`, `fresh_finish` — with dependencies, active/passive minutes,
   equipment, and provenance IDs.
5. **Culinary interpretation:** Versioned deterministic policy
   `culinary-prep-interpretation-v1` extracts tasks from recipe prep modes,
   ingredient preparations, and instructions. LLM may later enrich semantics but
   must never invent quantities.
6. **Scheduling:** Deterministic DAG schedule with passive-time overlap, oven
   temperature compatibility, and attention limits (max one attention-heavy active
   task).
7. **Storage:** Every portion gets a disposition using CoreMeal / recipe meal-prep
   metadata. Missing multi-day storage metadata yields typed issues — never invented
   fridge-life numbers. Freezer portions emit future thaw actions for PLAN-014.
8. **Lifecycle:** Prep plan is version-linked via `generatedPlanId`. Checklist
   progress is client AsyncStorage scoped to that id and does not mutate the plan.
9. **Policy version:** `meal-prep-policy-v1`.

## Consequences

- Plan tab exposes a production Meal Prep experience.
- Regenerating a week creates a new prep plan; stale progress keys do not attach.
- PLAN-014 can consume `futureActions` without owning prep generation.
- No dedicated meal-prep table in MVP — plan lives in `consumer_weekly_plans.plan_json`.
