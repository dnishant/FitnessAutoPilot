# Architecture overview

Fitness Autopilot is a modular monolith.

## Layers

1. **Mobile UI** (`apps/mobile`) — Expo Router screens; displays prescriptions; never authoritative for macros.
2. **Contracts / validation** — Zod schemas at external boundaries.
3. **Domain** (`packages/domain`) — pure deterministic engines:
   - safety eligibility
   - RMR v1 (Mifflin-St Jeor estimate or user-reported DEXA)
   - TDEE v1 (Whoop daily calories, or Apple Watch active calories + current RMR)
   - weight-change policy v1 (goal + pace + weight + TDEE → starting calorie target)
   - nutrition target v1
   - macro-policy-v1 (protein / fat / carbs from calorie target + weight)
   - meal preference intent (cuisines, proteins, exclusions, experience, variety)
   - cooking preference intent (prep frequency, session time, weekly style, finish time; dinner-prep-for-lunch deprecated / planner-owned)
  - food / recipe nutrition
  - canonical ingredient + purchasable protein catalog (`ingredient-catalog-v1`; CATALOG-001)
  - AI recipe candidate generation (provider-independent; Gemini adapter in `packages/llm`)
   - search-grounded culinary discovery (provider-independent; Gemini + Google Search grounding in `packages/llm`)
   - deterministic culinary candidate ranking + deduplication (`candidate-ranking-v1`; no LLM)
   - weekly meal strategy generation (provider-independent concepts; Gemini adapter in `packages/llm`)
   - lightweight complete-meal composition (`meal-composition-v2` prompt; policy `meal-composition-v1`; unique ranked candidates → plate concepts before weekly strategy)
   - ranked-candidate weekly strategy (`weekly-strategy-ranked-v1.3.0`; selects composed meal concepts with practicality + component-reuse diagnostics)
   - source-grounded recipe resolution (`recipe-resolution-v1`; selected unique candidates → structured recipes; no authoritative nutrition)
   - selected component recipe resolution (`component-recipe-v1`; compound sides after weekly selection)
   - canonical food resolution + deterministic recipe nutrition (`food-resolution-v1`; USDA provider; no user portioning)
   - complete meal assembly (`meal-composition-v1` policy; culinary plate completion; fiber-policy-v1 daily fiber)
   - weekly nutrition personalization (`nutrition-allocation-policy-v1` + `meal-portion-policy-v1`; PLAN-010)
   - weekly nutrition plan validation & finalization (`nutrition-validation-policy-v1`; PLAN-011)
   - portioning
   - one-day planner
4. **Infrastructure** (`supabase`) — Postgres + RLS + Edge Functions that call domain logic and persist immutable prescriptions. LLM credentials stay server-side (`generate-recipe`, `culinary-discovery`, `generate-weekly-strategy`, `resolve-recipes`, `compose-meals`). USDA credentials stay server-side (`resolve-recipe-nutrition`). Ranking (`rank-culinary-candidates`) is deterministic and does not call Gemini. `generate-weekly-strategy` dispatches PLAN-007 when ranked lunch/dinner pools are present.

## PLAN story completion contract

Starting with PLAN-010, every PLAN story must include:

1. domain logic
2. production orchestration (normal Generate My Plan / consumer path)
3. persistence / API / view-model integration where required
4. consumer UI integration (existing surfaces)
5. loading / error / partial UI states
6. an end-to-end consumer acceptance test

A backend-only implementation, a dev-preview-only implementation, or a UI mock with fake data does **not** satisfy a PLAN story.

## Trust boundary

```
Client JWT + anon key
        │
        ▼
  Edge Function (CORS + requireUser JWT)  ──► domain engines ──► persist snapshots
        │
        ▼
  Postgres RLS (auth.uid() = user_id)
```

Gateway JWT verification is off so browser `OPTIONS` preflight can reach the worker. See [ADR-014](../adr/ADR-014-edge-function-cors.md).

## Rounding rules

Documented in [nutrition-rounding.md](./nutrition-rounding.md), [rmr-v1.md](./rmr-v1.md), [tdee-v1.md](./tdee-v1.md), [weight-change-policy-v1.md](./weight-change-policy-v1.md), [macro-policy-v1.md](./macro-policy-v1.md), [meal-preferences-v1.md](./meal-preferences-v1.md), [cooking-preferences-v1.md](./cooking-preferences-v1.md), [recipe-generation-v1.md](./recipe-generation-v1.md), [culinary-discovery-v1.md](./culinary-discovery-v1.md), [weekly-strategy-v1.md](./weekly-strategy-v1.md), [recipe-resolution-v1.md](./recipe-resolution-v1.md), [food-resolution-v1.md](./food-resolution-v1.md), [meal-composition-v1.md](./meal-composition-v1.md), [meal-portioning-v1.md](./meal-portioning-v1.md), [nutrition-plan-validation-v1.md](./nutrition-plan-validation-v1.md), and [nutrition-target-v1.md](./nutrition-target-v1.md).
