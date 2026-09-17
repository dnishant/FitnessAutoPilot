# ADR-023: Deterministic complete-meal portion solver

## Status

Accepted

## Context

After CompleteMeal composition (PLAN-009.5) and canonical nutrition (PLAN-009), the product needs personalized component quantities. Culinary composition must not invent grams; daily allocation (PLAN-011) must not be hardcoded inside the meal solver.

## Decision

- Introduce PLAN-010 `solveMealPortions` as a pure deterministic domain primitive.
- Version culinary bounds + objective weights as `meal-portion-policy-v1`.
- Scale compound recipe components as units; require `baseServings` and/or `referenceYieldGrams` (block if missing).
- Atomic foods use gram variables; discrete foods use quantity steps (e.g. whole tortillas).
- Optimize a weighted normalized error (calories, protein, optional carbs/fat/fiber) plus culinary deviation penalties via coarse-to-fine search — no new optimization dependency.
- Persist provenance via `PersonalizedMealPlan` snapshots (`policyVersion`, intent, portions, status, diagnostics).
- Consumer UI shows amounts / compact kcal·protein only when authoritative PLAN-010 results exist.

## Consequences

- PLAN-011 can call the solver repeatedly with different intents.
- PLAN-012 can later aggregate grocery totals from personalized portions.
- Legacy catalog `portionRecipe` remains for the older gram-based planner path and is not the CompleteMeal solver.
