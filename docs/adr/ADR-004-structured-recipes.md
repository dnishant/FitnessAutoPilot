# ADR-004: Structured Recipes

## Status

Accepted

## Context

The first meal-planning system is a structured recipe selection + deterministic portioning engine. Free-text recipes and manually typed calorie totals are not trustworthy.

## Decision

- `Food` records hold nutrition truth per 100g (seeded or future USDA/provider-fed).
- `Recipe` is a semantic template with versioned ingredients referencing `Food` rows.
- Recipe nutrition = sum of ingredient nutrition (within rounding tolerance).
- Portioning adjusts scalable ingredients within bounds; failures are explicit.
- AI must not invent authoritative recipe macros.

## Consequences

- Small high-quality catalog preferred over hundreds of weak recipes.
- Provider swaps for Food data do not change domain calculation APIs.
- Impossible targets return controlled domain failures instead of forced fits.
