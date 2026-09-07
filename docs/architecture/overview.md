# Architecture overview

Fitness Autopilot is a modular monolith.

## Layers

1. **Mobile UI** (`apps/mobile`) — Expo Router screens; displays prescriptions; never authoritative for macros.
2. **Contracts / validation** — Zod schemas at external boundaries.
3. **Domain** (`packages/domain`) — pure deterministic engines:
   - safety eligibility
   - RMR v1 (Mifflin-St Jeor estimate or user-reported DEXA)
   - nutrition target v1
   - food / recipe nutrition
   - portioning
   - one-day planner
4. **Infrastructure** (`supabase`) — Postgres + RLS + Edge Functions that call domain logic and persist immutable prescriptions.

## Trust boundary

```
Client JWT + anon key
        │
        ▼
  Edge Function  ──► domain engines ──► persist snapshots
        │
        ▼
  Postgres RLS (auth.uid() = user_id)
```

## Rounding rules

Documented in [nutrition-rounding.md](./nutrition-rounding.md), [rmr-v1.md](./rmr-v1.md), and [nutrition-target-v1.md](./nutrition-target-v1.md).
