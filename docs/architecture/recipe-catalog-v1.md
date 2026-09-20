# Recipe catalog v1 (RECIPE-001)

Versioned curated recipes built on CATALOG-001 ingredients and protein products.

```text
CATALOG-001 Ingredient / Protein
        ↓
Stable Recipe
        ↓
Immutable Recipe Version
        ↓
Components + Ingredients + Steps
        ↓
Ingredient-Usage Reconciliation
        ↓
Scaling + Storage + Provenance
        ↓
Read-only Recipe Catalog UI (/catalog/recipes)
```

## Policy version

`recipe-catalog-v1`

## Sections

- Breakfast
- Meals (lunch and dinner suitability metadata; not separate sections)
- Snacks

## Visibility

| Status | Authenticated Postgres RLS | Verification UI (TS seed) |
| --- | --- | --- |
| published | SELECT allowed | Shown |
| draft / validated / retired | Not visible | Available only if seeded for internal tooling |

Ordinary users cannot insert/update/delete catalog rows.

## Related

- [ADR-032](../adr/ADR-032-versioned-recipe-catalog.md)
- [ingredient-catalog-v1](./ingredient-catalog-v1.md)
- Distinct from legacy Food-based [ADR-004](../adr/ADR-004-structured-recipes.md) `public.recipes`
