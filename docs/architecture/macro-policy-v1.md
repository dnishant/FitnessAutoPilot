# macro-policy-v1 — Daily protein, fat, and carbohydrate targets

Policy name/version: `macro-policy` / `macro-policy-v1`

This document is product policy for V1 macro breakdown, not medical certainty.

## Purpose

Turn a daily calorie target and current body weight into protein, fat, and carbohydrate gram targets.

The user does not choose macro percentages. No AI is used.

## Inputs

- Daily calorie target from `weight-change-policy-v1`
- Current body weight (stored in kg; converted with `kgToLb` / `lbToKg`)

## Policy

```
proteinGrams = bodyWeightLb × 1.0
fatGrams = bodyWeightKg × 0.7
proteinCalories = proteinGrams × 4
fatCalories = fatGrams × 9
remainingCalories = targetCalories − proteinCalories − fatCalories
carbohydrateGrams = remainingCalories / 4
```

Shared Atwater constants live in `packages/domain/src/nutrition/energy.ts`. Do not duplicate them.

Internal math keeps full precision. Displayed calories and grams use half-up rounding to the nearest whole unit (`roundKcal`, `roundGrams`). Persisted gram values keep full precision.

If protein + fat calories exceed the calorie target, the calculation fails with `macro_budget_exceeded`. Protein and fat are never reduced to force a fit.

## Persistence

`nutrition_targets` is append-only. Recalculating inserts a new row. A newer row may become current; older rows remain.

The input snapshot stores body weight (kg and lb), the unit used, target calories, the grams-per-unit policy values, and the kcal-per-gram constants.
