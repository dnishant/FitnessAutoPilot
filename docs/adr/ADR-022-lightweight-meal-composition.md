# ADR-022: Lightweight complete-plate composition before weekly strategy

## Status

Accepted

## Context

PLAN-009.5 originally composed complete meals **after** weekly strategy, recipe resolution, and USDA nutrition. That is too late: the weekly planner was choosing mains without knowing the complete plate, while detailed side recipes and nutrition were paid for candidates that never made the week.

PLAN-009.5 was also doing two jobs: (A) *what belongs on the plate* and (B) *how each component is cooked*.

## Decision

- Split those jobs. Lightweight composition (`meal-composition-v2`) runs immediately after PLAN-006 ranking/dedup and before PLAN-007/007.1.
- Keep policy version `meal-composition-v1`. Introduce prompt `meal-composition-v2` rather than silently changing historical semantics.
- `MealConcept` describes the complete plate (names, roles, intrinsic vs added). No quantities, instructions, USDA foods, nutrition, or personalized portions.
- Compose unique ranked candidates once with bounded concurrency. Weekly strategy consumes `mealConceptsByCandidateId` and may reason about component reuse and composition complexity as diagnostics (no rigid component quotas).
- After weekly selection, reuse the existing PLAN-009.5 component-resolution path (`component-recipe-v1`) plus PLAN-008 main recipes, then PLAN-009 USDA — selected meals only.
- Gemini remains culinary-only at both composition and component-recipe stages.
- Fiber stays `fiber-policy-v1` and is not computed during lightweight composition.

## Consequences

- The weekly planner understands Chicken Tikka + rice + kachumber + chutney before scheduling it.
- Discarded candidates do not incur detailed recipe or USDA cost.
- Developer previews show Ranked candidate → Lightweight composition → Weekly strategy → Detailed resolution → USDA.
- Existing PLAN-005 through PLAN-009.5 contracts remain; this is a pipeline responsibility refactor, not a persisted-version renumber.
