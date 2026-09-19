# Meal Prep Execution Planning (PLAN-013)

## Pipeline

```text
Finalized Weekly Plan (PLAN-011)
        ↓
Weekly Cooking Requirements
        ↓
Just-in-Time Step Extraction
        ↓
Dependency Graph Validation
        ↓
Schedule (passive overlap, equipment, attention)
        ↓
Nearby Shared-Prep Lookahead
        ↓
Storage Plan + Future Actions
        ↓
Linear Guided Steps → Consumer UI
```

## Consumer model

One sequence: **Start → Step 1…N → Portion/Store steps → Done**.

No required Mise en Place phase. Each step shows contextual ingredients, equipment,
and instructions for that moment only.

## Ownership

PLAN-013 owns PREP / SCHEDULE / COOK / STORE / FINISH-LATER.

It does **not** own meal discovery, nutrition, portion optimization, or grocery demand.

## Policy versions

- `meal-prep-policy-v1`
- `culinary-prep-interpretation-v1` (just-in-time extraction)

## Persistence

`ConsumerWeeklyPlan.mealPrepPlan` inside `consumer_weekly_plans.plan_json`,
version-linked by `generatedPlanId`.

Checklist / current-step progress: client AsyncStorage key
`fa.consumer.mealPrepProgress.{generatedPlanId}`.

## See also

- [ADR-030](../adr/ADR-030-meal-prep-execution-planning.md)
- [ADR-027](../adr/ADR-027-deterministic-grocery-aggregation.md) (PLAN-012 input)
- [ADR-029](../adr/ADR-029-v1-four-meal-six-day-prep.md) (product shape)
