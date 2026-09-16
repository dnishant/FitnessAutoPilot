# ADR-021: Complete meal composition & fiber foundation

## Status

Accepted. Pipeline ordering was later split in [ADR-022](./ADR-022-lightweight-meal-composition.md): lightweight plate concepts now run before weekly strategy; detailed component recipes remain selected-only.

## Context

PLAN-008/009 treat a resolved main dish as if it were the complete meal. Portion solving (PLAN-010) would then over-scale a single protein dish. Meals often need culturally appropriate companions (starch, vegetable/fiber, condiment) — but only when those roles are not already meaningfully present. Fiber should participate in daily nutrition targets without becoming a rigid per-meal quota.

## Decision

- Introduce `CompleteMeal` distinct from `ResolvedRecipe`.
- Detect existing roles from recipe ingredients, PLAN-008 `mealComponents`, and trusted PLAN-009 nutrition signals (meaningful-quantity heuristics — not “1 tbsp onion = vegetable”).
- Provider-independent `MealCompositionProvider`; ship `GeminiMealCompositionProvider` with prompt `meal-composition-v1`.
- Gemini proposes culinary additions only — never calories/macros/fiber values or personalized quantities.
- Atomic staples route toward PLAN-009 canonical foods; compound sides use structured `recipe_component` definitions (not fake USDA foods).
- Normalize component identity for weekly reuse (prep advantage later in PLAN-012).
- Add `fiber-policy-v1`: daily fiber ≈ 14 g per 1000 kcal from the calorie target.

## Consequences

- PLAN-010 receives a component set to portion, not a single over-scaled main.
- Complete dishes (pasta, taco plates) may require zero additions.
- Historical nutrition targets may omit `fiber_g` until a new target row is written.
- Composition results are versioned API objects (same persistence posture as PLAN-008/009 previews).
