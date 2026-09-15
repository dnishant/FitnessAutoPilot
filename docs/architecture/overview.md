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
   - AI recipe candidate generation (provider-independent; Gemini adapter in `packages/llm`)
   - search-grounded culinary discovery (provider-independent; Gemini + Google Search grounding in `packages/llm`)
   - deterministic culinary candidate ranking + deduplication (`candidate-ranking-v1`; no LLM)
   - weekly meal strategy generation (provider-independent concepts; Gemini adapter in `packages/llm`)
   - ranked-candidate weekly strategy (`weekly-strategy-ranked-v1.2.0`; selects PLAN-006 candidate IDs with practicality guardrails)
   - source-grounded recipe resolution (`recipe-resolution-v1`; unique candidates → structured recipes; no authoritative nutrition)
   - canonical food resolution + deterministic recipe nutrition (`food-resolution-v1`; USDA provider; no user portioning)
   - portioning
   - one-day planner
4. **Infrastructure** (`supabase`) — Postgres + RLS + Edge Functions that call domain logic and persist immutable prescriptions. LLM credentials stay server-side (`generate-recipe`, `culinary-discovery`, `generate-weekly-strategy`, `resolve-recipes`). USDA credentials stay server-side (`resolve-recipe-nutrition`). Ranking (`rank-culinary-candidates`) is deterministic and does not call Gemini. `generate-weekly-strategy` dispatches PLAN-007 when ranked lunch/dinner pools are present.

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

Documented in [nutrition-rounding.md](./nutrition-rounding.md), [rmr-v1.md](./rmr-v1.md), [tdee-v1.md](./tdee-v1.md), [weight-change-policy-v1.md](./weight-change-policy-v1.md), [macro-policy-v1.md](./macro-policy-v1.md), [meal-preferences-v1.md](./meal-preferences-v1.md), [cooking-preferences-v1.md](./cooking-preferences-v1.md), [recipe-generation-v1.md](./recipe-generation-v1.md), [culinary-discovery-v1.md](./culinary-discovery-v1.md), [weekly-strategy-v1.md](./weekly-strategy-v1.md), [recipe-resolution-v1.md](./recipe-resolution-v1.md), [food-resolution-v1.md](./food-resolution-v1.md), and [nutrition-target-v1.md](./nutrition-target-v1.md).
