# ADR-023: Deterministic weekly nutrition personalization (PLAN-010)

## Status

Accepted

## Context

After CompleteMeal composition and canonical nutrition, the product needs personalized
component quantities and a plan-level prescription. Prior experimental PLAN-010 work that
portioned only via fixture meal matching was reverted. PLAN stories must ship through
domain → production pipeline → persistence/API → consumer UI.

## Decision

- Introduce plan-level `personalizeWeeklyNutritionPlan` as the product capability.
- Keep `solveMealPortions` as an internal deterministic meal primitive.
- Version allocation as `nutrition-allocation-policy-v1` (reserve breakfast/snack capacity).
- Version culinary bounds + objective weights as `meal-portion-policy-v1`.
- Scale compound recipe components as units; require `baseServings` and/or `referenceYieldGrams`.
- Reconcile each day after initial solves; preserve meal identity (no food invention).
- Persist `PersonalizedWeeklyNutritionPlan` on the generated `ConsumerWeeklyPlan` with
  `generatedPlanId` + `mealInstanceId` provenance so regeneration cannot leak prior plans.
- Consumer UI shows amounts / compact kcal·protein only when authoritative results exist.
- Starting with PLAN-010, every PLAN story must include domain logic, production orchestration,
  persistence/API integration where required, consumer UI integration, UI states, and an
  end-to-end consumer acceptance test. Backend-only or preview-only work does not satisfy a PLAN story.
- Run a selected-week **CompleteMeal plate nutrition pass** (`resolveCompleteMealNutrition`)
  after selected resolution and before personalize so sides (atomics + recipe_components) get
  PLAN-009 arithmetic when a FoodResolver is available.
- Coefficient ladder (never LLM macros): USDA / CompleteMeal resolution →
  `discrete-staple-estimate-v1` → `role-structural-estimate-v1` for **required** companions →
  skip `recommended` failures → **block only when the main lacks trusted nutrition**.
- Discrete staple counts may be user-adjusted in Meal Detail; nutrition rescales linearly from
  per-component contributions.

## Consequences

- Future grocery/prep engines consume the personalized weekly plan.
- Legacy catalog `portionRecipe` remains for the older gram-based planner path.
- Role-structural estimates are explicit last-resort policy, not silent demo backfill.
- Compound-side USDA enrichment via the plate nutrition pass reduces estimate usage over time
  without changing the personalization orchestration contract.
