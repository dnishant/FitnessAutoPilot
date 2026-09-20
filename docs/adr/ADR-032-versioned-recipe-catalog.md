# ADR-032: Versioned recipe catalog foundation

## Status

Accepted

## Context

Fitness Autopilot is pivoting from runtime web-recipe discovery toward a curated, versioned recipe catalog built on CATALOG-001 canonical ingredients and protein products. Legacy `public.recipes` (Food-based templates for the existing planner) must remain intact.

## Decision

- Introduce application-owned `catalog_recipes*` tables distinct from legacy `public.recipes`.
- Stable recipe identity + immutable published versions; revisions create new version rows.
- Exactly three sections: `breakfast`, `meal`, `snack` (lunch/dinner share `meal` with suitability metadata).
- Every ingredient references CATALOG-001; proteins use exact `protein_product_id`.
- Components, ordered steps, and ingredient-to-step usages with quantity reconciliation.
- Scaling, storage, and provenance are mandatory version metadata (no invented food-safety durations or nutrition totals).
- Authenticated RLS SELECT on **published** versions only; mutations via service-role / migrations.
- Read-only domain service + `/catalog/recipes` verification UI reading the shared TypeScript seed (CATALOG-001 preview convention).

## Consequences

- Future nutrition composer / weekly retrieval can pin exact recipe-version IDs.
- Legacy planner and Edge recipe-generation pipeline are unchanged in this story.
- Kitchen-test status remains independent of publication status.
