# ADR-010: Deterministic macro breakdown from calorie target and weight

## Status

Accepted

## Context

V1 now has a starting daily calorie target from goal, weight, TDEE, and pace. Users need protein, fat, and carbohydrate targets without choosing percentages. The existing `nutrition-target-v1` engine still uses activity multipliers and a different protein/fat policy, so it is the wrong source of truth for this onboarding slice.

## Decision

- Introduce `macro-policy-v1` as a separate deterministic engine in `packages/domain`.
- Protein is `1 g` per pound of current body weight. Fat is `0.7 g` per kilogram. Carbohydrates receive remaining calories.
- Reuse shared kg/lb conversion and Atwater kcal-per-gram constants.
- Extend the existing `NutritionTarget` record and `nutrition_targets` table instead of creating a competing target type.
- Persist append-only. Re-run domain logic in the onboarding Edge Function before persisting. Do not trust client-submitted macro totals.

## Consequences

- Current nutrition target is the latest row for the user.
- Historical analysis remains possible if the policy later changes.
- Nutrition-target-v1 remains unused by this onboarding slice.
