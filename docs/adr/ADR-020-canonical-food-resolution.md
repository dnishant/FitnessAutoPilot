# ADR-020: Canonical food resolution & deterministic nutrition

## Status

Accepted

## Context

PLAN-008 produces culinary recipes with free-form ingredient names, quantities, and units. Authoritative nutrition cannot come from the LLM. The product needs a provider-fed canonical food layer and deterministic arithmetic before portion solving (PLAN-010).

## Decision

- Introduce a provider-independent `FoodDataProvider` port; ship `UsdaFoodDataProvider` first.
- Canonical nutrition is normalized per 100 g; household units convert only via provider measure mappings (never universal tbsp→g).
- Deterministic candidate scoring prefers generic/reference foods and preparation alignment; ambiguous matches are first-class.
- Optional Gemini disambiguation may select only among supplied candidates and never invent nutrients.
- Persist canonical foods + ingredient mappings as shared catalog data (authenticated read).
- Version policies: `food-resolution-v1`, `nutrition-calculation-v1`, `quantity-normalization-v1`, `food-disambiguation-v1`.

## Consequences

- PLAN-009 computes base-recipe nutrition only; user targets remain PLAN-010.
- Incomplete/ambiguous resolution is preferred over forced incorrect certainty.
- USDA credentials stay server-side (`USDA_API_KEY`).
