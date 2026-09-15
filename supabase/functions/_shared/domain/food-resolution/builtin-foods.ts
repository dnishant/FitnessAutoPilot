import type { CanonicalFood } from "../../contracts/index.ts";

/**
 * Tiny builtin catalog for obvious non-caloric staples.
 * Avoids perpetual external lookups for water/salt without building a handcrafted DB.
 */

const NOW = "1970-01-01T00:00:00.000Z";

function builtinFood(
  foodId: string,
  canonicalName: string,
  externalId: string,
  nutrients: CanonicalFood["nutrientsPer100g"],
): CanonicalFood {
  return {
    foodId,
    canonicalName,
    source: {
      provider: "usda",
      externalId,
      dataType: "builtin",
    },
    description: canonicalName,
    nutrientsPer100g: nutrients,
    measures: [],
    metadata: { brandName: null, foodCategory: "builtin" },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** Stable UUIDs for builtin foods (not USDA FDC IDs). */
export const BUILTIN_WATER = builtinFood(
  "00000000-0000-4000-8000-000000000001",
  "Water",
  "builtin:water",
  {
    caloriesKcal: 0,
    proteinGrams: 0,
    carbohydrateGrams: 0,
    fatGrams: 0,
    fiberGrams: 0,
  },
);

export const BUILTIN_SALT = builtinFood(
  "00000000-0000-4000-8000-000000000002",
  "Salt, table",
  "builtin:salt",
  {
    caloriesKcal: 0,
    proteinGrams: 0,
    carbohydrateGrams: 0,
    fatGrams: 0,
    fiberGrams: 0,
  },
);

const BUILTIN_BY_KEY: Array<{ pattern: RegExp; food: CanonicalFood }> = [
  { pattern: /^(water|tap water|cold water|warm water|hot water)$/i, food: BUILTIN_WATER },
  { pattern: /^(salt|table salt|kosher salt|sea salt|fine salt)$/i, food: BUILTIN_SALT },
];

export function matchBuiltinFood(ingredientName: string): CanonicalFood | null {
  const normalized = ingredientName.trim().toLowerCase();
  for (const entry of BUILTIN_BY_KEY) {
    if (entry.pattern.test(normalized)) return entry.food;
  }
  return null;
}
