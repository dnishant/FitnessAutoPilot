# Recipe discovery v1 (PLAN-005)

Provider-independent recipe discovery for Fitness Autopilot.

## Purpose

Stop relying on Gemini to invent every meal concept from scratch. Discovery
searches external recipe sources and returns normalized candidates. Weekly
planner integration is **out of scope** for PLAN-005 (see future PLAN-008).

## Flow

```
RecipeDiscoveryRequest
        ↓
RecipeDiscoveryProvider.search()
        ↓
external recipe API (Edamam v2)
        ↓
normalize + dedupe + cap
        ↓
RecipeDiscoveryResult { candidates, metadata }
```

Future architecture (not implemented here):

```
User preferences
  → Recipe Discovery (PLAN-005)
  → Candidate enrichment/ranking (later)
  → Gemini Weekly Planner (PLAN-004 today is still direct)
  → Weekly Strategy
```

## Contract

- Input: `RecipeDiscoveryRequest` (`packages/contracts`)
- Output: `RecipeDiscoveryResult` with `RecipeDiscoveryCandidate[]`
- Provider interface: `RecipeDiscoveryProvider` (`packages/domain`)
- Source nutrition fields are **metadata only** — never authoritative FA nutrition

## Search strategy

- Default `maxResults = 30` (hard max 50)
- Maximum **4** external provider HTTP searches per discovery call
- Meal type mapping: breakfast→breakfast, snack→snack, lunch/dinner→`lunch/dinner`
- Cuisine mapping is centralized; East Asian expands to chinese + japanese + korean
  (multiple `cuisineType` params on one request)
- Proteins become text `q` terms (one search per protein, capped at 4)
- `highProteinPreferred` → Edamam `diet=high-protein`
- Supported allergies/restrictions map to Edamam `health` filters
- Unsupported constraints and all dislikes are reported in metadata
  (`appliedConstraints` / `unsupportedConstraints`) — never silently claimed

## Deduplication

Deterministic by `provider + externalId` (not by recipe name alone), then capped
to `maxResults`.

## Server config

| Variable | Purpose |
| --- | --- |
| `EDAMAM_APP_ID` | Edamam application id (server-only) |
| `EDAMAM_APP_KEY` | Edamam application key (server-only) |
| `EDAMAM_BASE_URL` | Optional; defaults to Recipe Search API v2 |
| `EDAMAM_TIMEOUT_MS` | Optional; default 12000 |

Never expose these to Expo / `EXPO_PUBLIC_*`.

## Endpoint

`POST /functions/v1/recipe-discovery-search`

Auth: JWT via `requireUser` (same CORS/JWT pattern as other Edge Functions).

## Dev manual search

```bash
EDAMAM_APP_ID=... EDAMAM_APP_KEY=... pnpm discover:recipes:dev
# or one scenario:
DISCOVERY_SCENARIO=indian-chicken EDAMAM_APP_ID=... EDAMAM_APP_KEY=... pnpm discover:recipes:dev
```

## Licensing-safe behavior

PLAN-005 only normalizes fields returned by the API and preserves attribution /
source URLs. It does **not** scrape source websites, persist a permanent
third-party recipe library, or invent recipe instructions.

## Out of scope

Discovery UI (PLAN-005.5), weekly planner integration, ranking/enrichment,
nutrition verification, portion solving, groceries, prep optimization.
