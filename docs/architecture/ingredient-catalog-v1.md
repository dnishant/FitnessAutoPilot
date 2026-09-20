# Ingredient catalog v1 (CATALOG-001)

Canonical ingredients and purchasable protein products form the foundation for future catalog-backed planning.

```text
Canonical Ingredient
        ↓
Protein Product
        ↓
Aliases / Availability / Nutrition Lineage
        ↓
Read-only Catalog Service
        ↓
Protein Catalog Verification UI (/catalog/proteins)
```

## Policy version

`ingredient-catalog-v1`

## Availability disclaimer

> Availability reflects typical retailer coverage, not live local inventory.

## Related

- [ADR-031](../adr/ADR-031-canonical-ingredient-protein-catalog.md)
- Distinct from [food-resolution-v1](./food-resolution-v1.md) (USDA nutrient resolution)
- Distinct from meal preference protein chips ([meal-preferences-v1](./meal-preferences-v1.md))
