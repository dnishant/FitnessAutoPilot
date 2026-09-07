# tdee-v1 — Wearable Total Daily Energy Expenditure

Algorithm name/version: `apple_watch_active_plus_rmr` / `tdee-v1` for Apple Watch.

Whoop TDEE is user-reported daily calories (`whoop_daily_calories`) and has null algorithm fields.

This document is product policy for V1 onboarding, not medical certainty.

## Purpose

After the user chooses a goal and wearable, establish a current TDEE from wearable calories plus the current RMR.

V1 does **not** compute calorie targets, macros, or meal plans from this TDEE.

## Inputs

- onboarding goal: Bulking (`muscle_gain`), Shredding / Weight Loss (`fat_loss`), Recomposition / Maintenance (`recomposition`)
- wearable: `apple_watch` | `whoop`
- wearable calories (kcal/day)
- current RMR (DEXA if provided, otherwise Mifflin-St Jeor)

## Formula

- Whoop: `TDEE = average daily calories`
- Apple Watch: `TDEE = active calories + current RMR`

The Apple Watch path uses the established current RMR, not a second Mifflin pass, so a DEXA RMR is used when the user entered one.

## Rounding

Displayed and persisted TDEE uses the shared calorie rule: **round half-up to the nearest whole kcal** (`roundKcal`). Wearable calorie inputs are rounded the same way before they are stored.

## Persistence

`tdee_estimates` is append-only. Recalculating inserts a new row. A newer row may become current; older rows remain.

Every row stores an immutable input snapshot (wearable, calories, RMR used, RMR source, goal type).

## Validation

Range constants live in `TdeeValidationPolicy`. They are software bounds, not medical truth.
