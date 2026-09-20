# ADR-031: Canonical ingredient and protein-product catalog

## Status

Accepted

## Context

Fitness Autopilot is pivoting from runtime web-recipe discovery toward a curated, versioned recipe catalog. Protein identity today is either free-text culinary language or preference chips (`PROTEIN_OPTIONS`). Those are insufficient for protein-first retrieval, substitutions, grocery generation, and nutrition lineage.

Existing `public.foods` (gram-based planner / PLAN-009 USDA resolution) answers a different question: nutrient arithmetic per 100 g. It must not be overloaded as the purchasable protein identity model.

## Decision

- Introduce application-owned tables: `canonical_ingredients`, `ingredient_aliases`, `protein_products`, `retailer_availability_evidence`, `ingredient_substitutions`.
- Keep broad protein families (`chicken`, `beef`, …) as **filters** on `protein_products`; authoritative identity is the protein product + linked canonical ingredient.
- Distinct cuts, forms, bone/skin states, and ground-beef fat ratios remain distinct rows.
- Alias resolution is exact + deterministic normalization only; ambiguous family terms (`ground beef`, `steak`) return refinement-required results.
- Retailer evidence is historical coverage, never live inventory; `verified` requires `source_url` + `verified_at`.
- Nutrition source lineage may be stored; unverified mappings stay explicitly unmapped (no invented USDA FDC IDs).
- Authenticated SELECT via RLS; mutations via migrations / service role only.
- Read-only domain query service + `/catalog/proteins` verification UI.
- Preview UI reads the shared TypeScript seed via `createProteinCatalogService()` (same curated dataset as SQL upserts). It does not query Postgres from the client in this story, so hosted PR preview works without depending on remote seed application, and the UI never exposes mutation APIs.

## Consequences

- Future recipe catalog stories can reference stable `canonical_key` / protein-product IDs.
- Legacy free-text recipe proteins are **not** migrated in this story.
- PLAN-009 `foods` / `ingredient_food_mappings` remain for nutrient resolution and are intentionally separate.
