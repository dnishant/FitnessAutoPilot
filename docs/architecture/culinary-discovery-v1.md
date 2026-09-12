# Culinary discovery v1 (PLAN-005)

## Purpose

Discover genuinely exciting, diverse, **source-backed** recipe candidates via Gemini + Google Search grounding.

Discovery answers: “What interesting real-world dishes could we cook?” — not “What macros should this have?” and not “What is the weekly plan?”

## Flow

```text
CulinaryDiscoveryRequest
      ↓
Gemini + googleSearch tool + structured JSON
      ↓
deterministic schema / provenance validation
      ↓
CulinaryDiscoveryResult (candidates + diagnostics)
```

## Prompt version

`culinary-discovery-v1`

## Non-goals

- Weekly strategy integration
- Detailed recipe extraction / instructions
- USDA / nutrition verification / portion solving
- Persistent meal-history database
- Scraping Google / Instagram / TikTok
- Edamam / Spoonacular / TheMealDB

## Trust model

- Gemini calls are server-side only (`packages/llm` + Edge Function).
- Mobile preview invokes `culinary-discovery`; never holds `GEMINI_API_KEY`.
- Candidate source URLs must be valid http(s); invented provenance is rejected.
- Grounding metadata is required (search queries and/or chunks).
- Search-entry-point HTML is not forwarded to clients.

## Dev surfaces

- Edge: `POST /functions/v1/culinary-discovery`
- Mobile: `/culinary-discovery-preview` (Dev: Culinary Discovery)
- CLI: `pnpm discover:culinary:dev`
