# Fitness Autopilot

Consumer fitness app foundation with a **structured recipe selection + deterministic portioning** vertical slice.

> You set the goal. We manage the process.

## What this repo contains

- **Monorepo** (pnpm workspaces): Expo mobile app + shared TypeScript domain packages + Supabase
- **Deterministic nutrition target engine** (`nutrition-target-v1`)
- **Recipe nutrition + portioning engines** (pure TypeScript, heavily tested)
- **One-day meal planner** (rule-based, no AI)
- **Supabase** schema, RLS, seed catalog, Edge Functions for trusted prescriptions
- **Starting calorie target** (`weight-change-policy-v1`) from goal, weight, TDEE, and pace
- **Minimal mobile UI**: auth → goal + wearable + RMR onboarding → pace → calorie target → Today

## Requirements

- Node.js 20+
- pnpm 9+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local DB / Edge Functions)
- Expo Go or a simulator for the mobile app

## Quick start

```bash
pnpm install
pnpm test:unit
```

### Domain packages only

```bash
pnpm --filter @fitness-autopilot/domain test
pnpm --filter @fitness-autopilot/domain typecheck
```

### Dev-only live recipe generation (PLAN-003)

Requires a server-side Gemini key (never put this in Expo):

```bash
cp supabase/.env.example supabase/.env   # set GEMINI_API_KEY
set -a && source supabase/.env && set +a
pnpm generate:recipe:dev
```

Hosted Recipe Preview (`/recipe-preview`) calls the `generate-recipe` Edge Function. For production:

```bash
npx supabase secrets set GEMINI_API_KEY=your_key --project-ref <project-ref>
npx supabase functions deploy generate-recipe --project-ref <project-ref>
```

If Preview shows only `Edge Function returned a non-2xx status code`, the function body was swallowed by supabase-js — check the function logs, and confirm `GEMINI_API_KEY` is set.

### Dev-only live weekly strategy generation (PLAN-004)

Same server-side Gemini key:

```bash
set -a && source supabase/.env && set +a
pnpm generate:weekly-strategy:dev
```

### Local Supabase

```bash
supabase start
supabase db reset   # applies migrations + seed.sql
```

### Hosted Edge Functions (Vercel web)

The Expo web app calls functions from the browser, so CORS + in-function JWT verification are required ([ADR-014](./docs/adr/ADR-014-edge-function-cors.md)). After changing packages or functions:

```bash
pnpm sync:edge   # rewrite _shared copies with Deno-compatible .ts imports
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase secrets set GEMINI_MODEL=gemini-3.6-flash --project-ref <project-ref>
npx supabase functions deploy
```

A Vercel rebuild is not required for function CORS changes.

### Mobile app

```bash
cp apps/mobile/.env.example apps/mobile/.env
# Default: EXPO_PUBLIC_USE_LOCAL_PLANNER=true runs the deterministic
# domain engines in-process (no Supabase required for the first slice demo).
# For full Supabase: set URL + anon key from `supabase status` and set
# EXPO_PUBLIC_USE_LOCAL_PLANNER=false
pnpm mobile
```

Web preview (useful in this environment):

```bash
pnpm mobile:web
# http://127.0.0.1:19006
```

## Workspace layout

```
apps/mobile/          Expo + Expo Router UI
packages/domain/      Pure deterministic engines (nutrition, recipes, planning, safety)
packages/contracts/   Zod schemas + shared API/DB shapes
packages/llm/         Server-only LLM adapters (Gemini recipe generation)
packages/validation/  Result helpers + boundary validators
packages/test-fixtures/
supabase/             migrations, functions, seed, RLS tests
docs/                 architecture, ADRs, product
```

## Testing & CI

```bash
pnpm lint
pnpm typecheck
pnpm test:unit
```

GitHub Actions runs install → lint → typecheck → unit tests → migration validation on pull requests.

## Documentation

- [AGENTS.md](./AGENTS.md) — rules for AI coding agents
- [Architecture](./docs/architecture/)
- [ADRs](./docs/adr/)
- [Product](./docs/product/)

## License

Private.
