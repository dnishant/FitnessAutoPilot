# Meal Prep Execution Planning (PLAN-013)

## Pipeline

```text
Finalized Weekly Plan (PLAN-011)
        ↓
Weekly Cooking Requirements
        ↓
Prep Task Extraction (culinary-prep-interpretation-v1)
        ↓
Mise-en-Place Consolidation
        ↓
Dependency Graph Validation
        ↓
Schedule (passive overlap, equipment, attention)
        ↓
Storage Plan + Future Actions
        ↓
Consumer Meal Prep UI
```

## Ownership

PLAN-013 owns PREP / SCHEDULE / COOK / STORE / FINISH-LATER.

It does **not** own meal discovery, nutrition, portion optimization, or grocery demand.

## Policy versions

- `meal-prep-policy-v1`
- `culinary-prep-interpretation-v1`

## Persistence

`ConsumerWeeklyPlan.mealPrepPlan` inside `consumer_weekly_plans.plan_json`,
version-linked by `generatedPlanId`.

Checklist progress: client AsyncStorage key `fa.consumer.mealPrepProgress.{generatedPlanId}`.

## See also

- [ADR-030](../adr/ADR-030-meal-prep-execution-planning.md)
- [ADR-027](../adr/ADR-027-deterministic-grocery-aggregation.md) (PLAN-012 input)
- [ADR-029](../adr/ADR-029-v1-four-meal-six-day-prep.md) (product shape)
