# ADR-008: Wearable TDEE estimates

## Status

Accepted

## Context

V1 onboarding now asks for a goal and a wearable, then establishes TDEE. Mixing that derived number into the mutable profile would overwrite history. Activity-multiplier TDEE from `nutrition-target-v1` is a later planning concern and is not used here.

## Decision

- Persist TDEE on a separate `tdee_estimates` table.
- Treat rows as append-only historical records (same spirit as ADR-003 and ADR-007).
- Whoop TDEE is the user-entered average daily calories.
- Apple Watch TDEE is active calories plus the established current RMR.
- Re-run domain logic in an Edge Function before persisting. Do not trust a client-supplied TDEE.
- Keep goals in the existing versioned `goals` table. Map UI labels to `muscle_gain`, `fat_loss`, and `recomposition`.

## Consequences

- Current TDEE is the latest row for the user.
- Historical analysis remains possible if the wearable formula later changes.
- Authenticated clients have select/insert RLS only (`auth.uid() = user_id`).
- Nutrition targets and meal plans remain out of this slice.
