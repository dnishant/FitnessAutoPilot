# weight-change-policy-v1 — Starting calorie target

Policy name/version: `weight-change-policy` / `weight-change-policy-v1`

This document is product policy for V1 starting calorie targets, not medical certainty.

## Purpose

Turn the current goal, current weight, current TDEE, and a selected pace into:

1. a target weekly weight-change rate
2. a daily calorie adjustment
3. a daily calorie target

This policy computes the calorie target only. Macro breakdown is `macro-policy-v1`.

## Goal mapping

Existing stored goal names are preserved:

- `fat_loss` → `weight_loss`
- `muscle_gain` → `weight_gain`
- `recomposition` → `maintenance`

## Pace

- Weight loss: Recommended `-0.50%` body weight/week, Faster `-0.75%`
- Weight gain: Recommended `+0.25%` body weight/week, Faster `+0.50%`
- Maintenance: skip pace selection and use `0%`

## Formula

`1 lb = 0.45359237 kg`. Weight stored in kg is converted with `kgToLb`.

```
targetWeightChangeLbPerWeek = bodyWeightLb × targetRatePerWeek
weeklyCalorieAdjustment = targetWeightChangeLbPerWeek × 3500
dailyCalorieAdjustment = weeklyCalorieAdjustment / 7
targetCalories = tdeeKcal + dailyCalorieAdjustment
```

Internal math keeps full precision. Displayed/persisted calories use `roundKcal` (half-up to nearest whole kcal). Displayed %/week uses 2 decimals. Displayed lb/week uses 1–2 decimals.

## Persistence

`calorie_targets` is append-only. Recalculating inserts a new row. A newer row may become current; older rows remain.
