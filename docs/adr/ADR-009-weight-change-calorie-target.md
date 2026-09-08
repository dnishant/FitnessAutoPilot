# ADR-009: Weight-change starting calorie targets

## Status

Accepted

## Context

V1 now has a goal, current weight, and wearable TDEE. Users need a starting daily calorie target without macros or meal planning. The existing `nutrition-target-v1` engine uses activity multipliers and emits macros, so it is the wrong source of truth for this slice.

## Decision

- Introduce `weight-change-policy-v1` as a separate deterministic engine.
- Convert body-weight percent/week into pounds/week, then into a daily calorie adjustment with `3500 kcal/lb`.
- Persist results on append-only `calorie_targets`.
- Keep stored goal names (`fat_loss`, `muscle_gain`, `recomposition`) and map them onto `weight_loss`, `weight_gain`, and `maintenance`.
- Re-run domain logic in the onboarding Edge Function before persisting. Do not trust a client-supplied target.

## Consequences

- Current calorie target is the latest row for the user.
- Historical analysis remains possible if the policy later changes.
- Nutrition-target-v1 remains unused by this onboarding slice.
