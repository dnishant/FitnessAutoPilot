# Weekly meal strategy

Provider-independent weekly meal strategy generation for Fitness Autopilot.

## PLAN-004 (unconstrained concepts)

PLAN-004 is the original orchestration layer: Gemini invents 7 days of meal *concepts* from nutrition + PLAN-001/002 preferences. Prompt version: `weekly-strategy-v1`.

This path remains available when `generate-weekly-strategy` receives a request **without** `lunchCandidates` / `dinnerCandidates`.

## PLAN-007 (ranked candidate selection)

PLAN-007 is the current weekly-planning slice:

```
PLAN-005 grounded culinary discovery
        ↓
PLAN-006 ranking + deduplication
        ↓
PLAN-007 whole-week selection + scheduling
        ↓
7 lunches + 7 dinners
```

It answers: “Which of these ranked dishes should this person eat this week, and when?”

It does **not** resolve recipes, calculate authoritative nutrition, or invent unsupported dishes.

### Contract

- Input: `RankedWeeklyStrategyRequest` (`packages/contracts`)
- Output: `RankedWeeklyStrategy` (candidate IDs + prep metadata) + deterministic `RankedWeeklyStrategyQualityStats`
- Prompt version: `weekly-strategy-ranked-v1`
- One Gemini call per week
- `uniqueCandidateIds` and quality stats are calculated in code
- Names are hydrated from the supplied candidate pools — Gemini cannot silently rename a dish
- No per-meal calories/macros

### Pools and repetition

Lunch slots choose from `lunchCandidates`. Dinner slots choose from `dinnerCandidates`. 14 slots does **not** mean 14 unique dishes. Repetition is allowed and often desirable. Empty lunch or dinner pools return `INSUFFICIENT_CANDIDATES` instead of asking Gemini to invent food.

### Planner defaults

| Policy | Value |
| --- | --- |
| `MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK` | `1` |
| Minimum candidates per meal type | `1` |
| Adjacent high-similarity threshold | PLAN-006 `SIMILARITY_PENALTY_THRESHOLD` |

`useDinnerPrepForNextLunch = false` forbids `piggyback_prep` and `direct_leftover`.

### Server config

Reuses PLAN-003/004 LLM env:

| Variable | Purpose |
| --- | --- |
| `LLM_PROVIDER` | Currently `gemini` |
| `GEMINI_API_KEY` | Server-only API key |
| `GEMINI_MODEL` | Defaults to `gemini-3.6-flash` |

Never expose these to Expo / `EXPO_PUBLIC_*`.

### Endpoint

`POST /functions/v1/generate-weekly-strategy`

If the body includes `lunchCandidates` and `dinnerCandidates`, PLAN-007 runs. Otherwise PLAN-004 runs.

Uses the same CORS + in-function JWT pattern as `generate-recipe` (`serveWithCors`, `verify_jwt = false`).

### Manual development test

```bash
cp supabase/.env.example supabase/.env   # set GEMINI_API_KEY
set -a && source supabase/.env && set +a
pnpm generate:ranked-weekly-strategy:dev
```

Internal screen: `/weekly-strategy-preview` (Today → **Dev: Weekly Strategy Preview**). Load ranked lunch/dinner fixtures (or Discover → Rank) then **Generate Weekly Strategy**.

## Out of scope

Detailed recipe generation, USDA resolution, portion solving, grocery aggregation, exact prep timelines, breakfast/snacks, persistent meal history.
