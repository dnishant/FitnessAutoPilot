# Recipe generation v1 (PLAN-003)

Provider-independent single-recipe generation for Fitness Autopilot.

## Flow

```
nutrition targets (guidance)
+ PLAN-001 food preferences
+ PLAN-002 cooking preferences
        ↓
RecipeGenerator.generateRecipe(request)
        ↓
Gemini Flash structured output
        ↓
Zod RecipeCandidate validation
```

## Contract

- Input: `RecipeGenerationRequest` (`packages/contracts`)
- Output: exactly one `RecipeCandidate`
- Prompt version: `recipe-generation-v1`
- AI nutrition fields are stripped and never authoritative

## Server config

| Variable | Purpose |
| --- | --- |
| `LLM_PROVIDER` | Currently `gemini` |
| `GEMINI_API_KEY` | Server-only API key |
| `GEMINI_MODEL` | Defaults to `gemini-2.5-flash` |

Never expose these to Expo / `EXPO_PUBLIC_*`.

## Endpoint

`POST /functions/v1/generate-recipe`

## Mobile preview (PLAN-003.5)

Internal screen: `/recipe-preview` (entry from Today → **Dev: Recipe Preview**).

- Builds a `RecipeGenerationRequest` from the signed-in user's nutrition target + PLAN-001/002 preferences
- Calls the Edge Function via `session.generateRecipe` (never Gemini from the client)
- Shows loading/error/success, generation context, AI metadata, and raw `RecipeCandidate` JSON

## Out of scope

Weekly generation, USDA resolution, portion solving, web recipe discovery, leftovers/prep timelines.
