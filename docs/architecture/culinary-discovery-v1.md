# Culinary discovery v1 (PLAN-005 / PLAN-005.1)

## Purpose

Discover genuinely exciting, diverse, **source-backed** recipe candidates via Gemini + Google Search grounding.

Discovery answers: “What genuinely delicious food might this person want to eat?” — not “What macros should this have?” and not “What is the weekly plan?”

## Flow

```text
CulinaryDiscoveryRequest
      ↓
Gemini + googleSearch tool (exploration-first notes + fenced JSON)
      ↓
extract JSON → deterministic schema / provenance validation
      ↓
CulinaryDiscoveryResult (candidates + diagnostics)
```

## Gemini grounding + JSON limitation

On Gemini 3.x (`gemini-3.6-flash` and peers), enabling `responseMimeType` /
`responseJsonSchema` together with the `googleSearch` tool commonly returns
JSON **without** `groundingMetadata` (no `webSearchQueries` / chunks). Asking
for “JSON only” also often skips search entirely. The API also does not expose
a deterministic cap on the number of Google Search queries.

Discovery therefore:

1. Enables `googleSearch` **without** structured-output mime/schema.
2. Prompts for brief grounded notes, then a trailing fenced JSON block.
3. Extracts and Zod/domain-validates the JSON server-side.
4. Retries up to 3 times with a stronger search nudge when grounding metadata is absent.
5. Fails with `DISCOVERY_NOT_GROUNDED` when search metadata is still absent after retries.
6. Guides the model toward approximately 4–8 exploratory searches (prompt guidance, not a hard API limit).

## Prompt version

`culinary-discovery-v1.1` (PLAN-005.1)

Refinements vs v1:

- Exploration-first search (broad culinary directions before dish-name verification).
- Source-quality guidance without famous-publication targeting.
- Requested candidate count is a maximum/target, not an exact quota.
- Fitness adaptability is `easy | moderate | hard` and must not prescribe recipe substitutions.
- Homepage/root URLs and uncorrelated candidates are discarded.
- Grounding coverage and source-quality diagnostics are distinct.

## Provenance

A kept candidate must have a non-empty source name, a valid http(s) URL that is
not an obvious homepage/root, and grounding-chunk correlation when usable chunk
hosts exist. Missing grounding is omitted rather than fabricated.

The homepage heuristic is pragmatic (`https://food52.com/` is rejected;
`https://food52.com/recipes/...` is not). It does not prove that every remaining
URL is a recipe page.

Social/community hosts (Reddit, YouTube, Facebook, Substack) are not preferred
canonical sources; they are not auto-rejected.

## Diagnostics

`groundingCoverage` is candidate–chunk correlation. `1.0` does **not** mean
every source is high quality. Additional locally derived stats include unique
sources/domains, search-query counts (broad vs specific-dish heuristic),
rejected-for-weak-provenance count, and generic-homepage count.

## Non-goals

- Weekly strategy integration (PLAN-004 remains unchanged)
- Multi-cuisine orchestration / ranking (later PLAN-006)
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
