# Fitness Autopilot

Consumer fitness app foundation with a **structured recipe selection + deterministic portioning** vertical slice.

> You set the goal. We manage the process.

## What this repo contains

- **Monorepo** (pnpm workspaces): Expo mobile app + shared TypeScript domain packages + Supabase
- **Deterministic nutrition target engine** (`nutrition-target-v1`)
- **Recipe nutrition + portioning engines** (pure TypeScript, heavily tested)
- **One-day meal planner** (rule-based, no AI)
- **Supabase** schema, RLS, seed catalog, Edge Functions for trusted prescriptions
- **Minimal mobile UI**: auth → onboarding → goal → generate plan → Today

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

### Local Supabase

```bash
supabase start
supabase db reset   # applies migrations + seed.sql
```

### Mobile app

```bash
cp apps/mobile/.env.example apps/mobile/.env
# set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from `supabase status`
pnpm mobile
```

For web preview during development:

```bash
pnpm mobile:web
```

## Workspace layout

```
apps/mobile/          Expo + Expo Router UI
packages/domain/      Pure deterministic engines (nutrition, recipes, planning, safety)
packages/contracts/   Zod schemas + shared API/DB shapes
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
