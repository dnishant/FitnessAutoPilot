# rmr-v1 — Resting Metabolic Rate

Algorithm name/version: `mifflin_st_jeor` / `rmr-v1`

This document is product policy for V1 onboarding, not medical certainty.

## Purpose

Collect only enough profile information to establish a current RMR, then display it.

Users either:

1. Enter an RMR from a DEXA / body-composition report (`user_reported_dexa`)
2. Let the app estimate RMR with Mifflin-St Jeor (`estimated_mifflin_st_jeor`)

V1 does **not** compute TDEE, calorie targets, macros, or meal plans.

## Inputs

- date of birth (age is derived at calculation time and is not a persisted profile field)
- biological sex: `male` | `female`
- height (cm)
- current weight (kg) — stored as `user_profiles.weight_kg`
- optional user-reported RMR (kcal/day) and scan/report date

## Formula

Unrounded Mifflin-St Jeor:

- male: `10 × weightKg + 6.25 × heightCm − 5 × ageYears + 5`
- female: `10 × weightKg + 6.25 × heightCm − 5 × ageYears − 161`

Age is whole years from date of birth using UTC calendar dates.

## Rounding

Displayed and persisted RMR uses the shared calorie rule: **round half-up to the nearest whole kcal** (`roundKcal`). The unrounded intermediate is available for later TDEE work and is not what we store on `rmr_estimates`.

## Persistence

`rmr_estimates` is append-only. Recalculating inserts a new row. A newer row may become current; older rows remain.

Estimated rows store `algorithm_name`, `algorithm_version`, and an immutable input snapshot (DOB, sex, height, weight, age used). DEXA rows store the reported value and report date with null algorithm fields.

## Validation

Range constants live in `RmrValidationPolicy`. They are software bounds, not medical truth.
