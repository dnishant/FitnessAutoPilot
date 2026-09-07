# ADR-007: Immutable RMR estimates

## Status

Accepted

## Context

V1 onboarding establishes Resting Metabolic Rate either from a user-entered DEXA value or a deterministic Mifflin-St Jeor estimate. Mixing that derived number into the mutable profile would overwrite history.

## Decision

- Persist RMR on a separate `rmr_estimates` table.
- Treat rows as append-only historical records (same spirit as ADR-003).
- Recalculate or re-report by inserting a new row; never overwrite a previous recommendation or user-entered value.
- Re-run domain logic in an Edge Function before persisting an estimated RMR. Do not trust a client-supplied estimate.
- Keep `user_profiles.weight_kg` as current weight. Do not persist age.

## Consequences

- Current RMR is the latest row for the user.
- Historical analysis remains possible if the algorithm later changes.
- Authenticated clients have select/insert RLS only (`auth.uid() = user_id`).
