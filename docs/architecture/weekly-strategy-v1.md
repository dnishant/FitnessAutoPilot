# Weekly meal strategy v1 (PLAN-004)

Provider-independent weekly meal strategy generation for Fitness Autopilot.

## Role

PLAN-004 is the **orchestration layer** above PLAN-003:

```
Nutrition targets
+ PLAN-001 food preferences
+ PLAN-002 cooking preferences
+ variety preference
        ↓
WeeklyStrategyGenerator.generateWeeklyStrategy(request)
        ↓
Gemini structured output (one call)
        ↓
Zod + deterministic structural validation
        ↓
WeeklyMealStrategy + WeeklyStrategyStats
```

It answers: “What should this person's week of eating look like?”

It does **not** answer exact ingredients/grams. Do **not** call `RecipeGenerator.generateRecipe` from this layer.

## Contract

- Input: `WeeklyStrategyRequest` (`packages/contracts`)
- Output: `WeeklyMealStrategy` (meal concepts) + deterministic `WeeklyStrategyStats`
- Prompt version: `weekly-strategy-v1`
- `uniqueConceptCount` is calculated in code, never trusted from the model
- AI nutrition fields are stripped and never authoritative

## Server config

Reuses PLAN-003 LLM env:

| Variable | Purpose |
| --- | --- |
| `LLM_PROVIDER` | Currently `gemini` |
| `GEMINI_API_KEY` | Server-only API key |
| `GEMINI_MODEL` | Defaults to `gemini-2.5-flash` |

Never expose these to Expo / `EXPO_PUBLIC_*`.

## Endpoint

`POST /functions/v1/generate-weekly-strategy`

Response shape:

```json
{
  "strategy": { "...": "WeeklyMealStrategy" },
  "stats": { "...": "WeeklyStrategyStats" },
  "meta": {
    "requestId": "...",
    "promptVersion": "weekly-strategy-v1",
    "provider": "gemini",
    "model": "...",
    "durationMs": 0
  }
}
```

## Manual development test

```bash
cp supabase/.env.example supabase/.env   # set GEMINI_API_KEY
set -a && source supabase/.env && set +a
pnpm generate:weekly-strategy:dev
```

Internal screen: `/weekly-strategy-preview` (entry from Today → **Dev: Weekly Strategy Preview**).

## Out of scope

Detailed recipe generation, USDA resolution, portion solving, grocery aggregation, exact prep timelines, flavor-distance algorithms, polished weekly-plan UI.
