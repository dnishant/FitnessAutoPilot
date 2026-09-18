# Weekly nutrition plan validation & finalization v1 (PLAN-011)

## Role

Deterministic integrity and nutrition-quality gate for a personalized weekly
prescription produced by PLAN-010.

```
PersonalizedWeeklyNutritionPlan (PLAN-010)
        ↓
★ PLAN-011 VALIDATE → CLASSIFY → FINALIZE
        ↓
Finalized weekly prescription → active ConsumerWeeklyPlan
```

PLAN-011 answers: *Can we trust this weekly prescription enough to make it active?*

It does **not** choose meals, invent portions, call Gemini/USDA, or become a
second portion solver.

## Ownership

| Layer | Owns |
| --- | --- |
| PLAN-010 | allocate → portion → reconcile |
| PLAN-011 | validate → classify → finalize (declarative repair requests only) |

When PLAN-011 finds a **repairable** nutrition deviation, it returns a typed
`NutritionPlanRepairRequest`. PLAN-010 rebalances portions within culinary bounds.
Structural corruption is never sent to PLAN-010 for fake repair.

## Policy (`nutrition-validation-policy-v1`)

| Concern | Rule |
| --- | --- |
| Daily calories preferred | ±5% of target |
| Daily calories hard (finalizable) | ±10% of target |
| Daily calories best_feasible extended | ±18% warning when day is culinary-constrained |
| Weekly calories preferred / hard | ±4% / ±8% |
| Protein preferred minimum | ≥95% of daily target |
| Protein hard minimum | ≥90% of daily target |
| Protein upper guardrail | ≤135% of daily target |
| Fiber | daily moderate/severe warnings; weekly average warning (not portion-repairable) |
| Meal/day arithmetic | absolute kcal/macro tolerances |
| Macro energy vs labeled kcal | ±22% or ±40 kcal |
| Max repair attempts | 2 (`MAX_FINALIZATION_REPAIR_ATTEMPTS`) |

Authoritative personalized nutrition must come from PLAN-010 portioning.
Validated `llm_estimate` recipe coefficients (ADR-024) may feed PLAN-010; raw
LLM totals must not appear as personalized meal authority
(`NUTRITION_LLM_SOURCE_NOT_AUTHORITATIVE`).

## Status eligibility

| PLAN-010 status | Finalizable? |
| --- | --- |
| `solved` | Yes, if PLAN-011 hard rules pass |
| `best_feasible` | Yes, if PLAN-011 hard rules pass |
| `blocked` | No |

## Production path

```
Generate My Plan
  → … → PLAN-010 personalizeWeeklyNutritionPlan
  → PLAN-011 finalizeWeeklyNutritionPlan (bounded repair loop)
  → attach + assert integrity
  → persist ready plan only on finalization success
```

Failed finalization does **not** replace an existing active ready plan.

## Consumer UX

- Progress: “Finalizing your plan…”
- Failure: “We couldn't finish a reliable plan this time. Please try generating again.”
- Validation report is developer diagnostics only (`validationReport` on the plan).

## Non-goals

Meal discovery, grocery aggregation, prep scheduling, micronutrient scoring,
meal-level macro perfection, inventing breakfast/snack foods (reserved budget only).
