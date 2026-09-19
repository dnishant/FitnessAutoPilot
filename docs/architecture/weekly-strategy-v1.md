# Weekly meal strategy

Provider-independent weekly meal strategy generation for Fitness Autopilot.

## V1 meal-prep product shape (current Generate My Plan path)

Standard week:

| Constant | Value |
| --- | --- |
| Core meals | **4** |
| Covered days | **6** (Mon–Sat) |
| Lunch/dinner portions | **12** |
| Flexible day | **Sunday** (no prescribed lunch/dinner) |

Variety no longer changes unique-meal count. It only adjusts diversity vs grocery
overlap pressure between the four meals (`V1_VARIETY_DIVERSITY_POLICY`).

Selection is deterministic combinatorial set scoring (`buildV1WeeklyStrategy` in
`packages/domain`), not an LLM unique-band week. Prompt version for ranked
contracts remains `weekly-strategy-ranked-v1.5.0`. See [ADR-029](../adr/ADR-029-v1-four-meal-six-day-prep.md).

## PLAN-004 (unconstrained concepts)

PLAN-004 is the original orchestration layer: Gemini invents 7 days of meal *concepts* from nutrition + PLAN-001/002 preferences. Prompt version: `weekly-strategy-v1`.

This path remains available when `generate-weekly-strategy` receives a request **without** `lunchCandidates` / `dinnerCandidates`.

## PLAN-007 (ranked candidate selection — legacy LLM path)

PLAN-007 is the ranked-candidate weekly-planning slice (still used by preview tooling):

```
PLAN-005 grounded culinary discovery
        ↓
PLAN-006 ranking + deduplication
        ↓
Lightweight complete-meal composition (`meal-composition-v2`)
        ↓
PLAN-007 whole-week selection + scheduling
        ↓
V1: 4 core meals → 12 lunch/dinner instances across 6 covered days
```

It answers: “Which of these composed plates should this person eat this week, and when?”

It does **not** resolve detailed recipes, calculate authoritative nutrition, or invent unsupported dishes. Component reuse on the plate (shared rice, chutney) is a prep-efficiency signal, not meal repetition.

### Contract

- Input: `RankedWeeklyStrategyRequest` (`packages/contracts`), including optional `mealConceptsByCandidateId`
- Output: `RankedWeeklyStrategy` (candidate IDs + prep metadata) + deterministic `RankedWeeklyStrategyQualityStats` (including component reuse / composition complexity diagnostics)
- Prompt version: `weekly-strategy-ranked-v1.5.0`
- Generate My Plan uses `buildV1WeeklyStrategy` (deterministic). The Gemini ranked generator remains for previews / optional server paths.
- `uniqueCandidateIds`, quality stats, and complexity status are calculated in code
- Names are hydrated from the supplied candidate pools — Gemini cannot silently rename a dish
- No per-meal calories/macros
- Variety is culinary diversity pressure within a **fixed 4-meal** repertoire; weekly prep practicality outranks maximizing unique dishes
- Central policy: `WEEKLY_VARIETY_COMPLEXITY_POLICY` — **all variety levels: preferred/hard unique = 4** (V1)

### Pools and repetition

Lunch slots choose from `lunchCandidates`. Dinner slots choose from `dinnerCandidates`. 12 slots does **not** mean 12 unique dishes — V1 expects intentional repeats of exactly four cores. Empty lunch or dinner pools return `INSUFFICIENT_CANDIDATES` instead of asking Gemini to invent food.

### Planner defaults

| Policy | Value |
| --- | --- |
| `MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK` | `1` |
| Minimum candidates per meal type | `1` |
| Adjacent high-similarity threshold | PLAN-006 `SIMILARITY_PENALTY_THRESHOLD` |
| Core meals / covered days / portions | 4 / 6 / 12 |

Shared prep / `piggyback_prep` is always permitted when metadata evidence supports it (PLAN-008). Default remains `independent_meal_prep`. `useDinnerPrepForNextLunch` is deprecated and ignored.

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
