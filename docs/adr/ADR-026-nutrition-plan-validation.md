# ADR-026: Weekly nutrition plan validation & finalization (PLAN-011)

## Status

Accepted

## Context

PLAN-010 produces personalized portions and daily reconciliation, but activation
previously treated a successful personalization as sufficient for a ready plan.
Defense-in-depth structural checks existed (`canonical-meal-integrity`), yet there
was no versioned daily/weekly nutrition quality gate, bounded repair loop, or
immutable finalization metadata before a plan became active.

## Decision

1. Introduce `nutrition-validation-policy-v1` as the centralized PLAN-011 policy.
2. `validateWeeklyNutritionPlan` recomputes meal/day/week nutrition from
   personalized portions and classifies `pass | warning | repairable_failure | hard_failure`.
3. `finalizeWeeklyNutritionPlan` runs a bounded loop (max 2 repairs) that may
   ask PLAN-010 to rebalance portions via declarative day deltas — never meal
   replacement or structural mutation.
4. Only plans with `finalization.validationStatus === "finalized"` may activate.
5. Regeneration failures leave the previous ready plan active.

## Consequences

- Generate My Plan includes a `finalizing_plan` stage.
- Fiber shortfalls are warnings (portion rebalance cannot invent fiber foods).
- Developer diagnostics expose `validationReport` and
  `formatValidationReportForDiagnostics`.
