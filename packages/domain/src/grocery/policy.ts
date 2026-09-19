import type { CulinaryMeasurementState, GroceryCategory } from "@fitness-autopilot/contracts";
import { GROCERY_AGGREGATION_POLICY_VERSION } from "@fitness-autopilot/contracts";

export { GROCERY_AGGREGATION_POLICY_VERSION };

/** Stable policy id for grocery derivation + display rounding. */
export const GROCERY_POLICY = {
  version: GROCERY_AGGREGATION_POLICY_VERSION,
  /**
   * Ordinary tap water and similar non-purchased cooking utilities.
   * Prefer canonical IDs / structured keys over scattered string checks.
   */
  nonPurchasedKeys: new Set([
    "water",
    "tap water",
    "cold water",
    "hot water",
    "ice water",
    "boiling water",
  ]),
  /** Display mass preference for US consumers when converting from grams. */
  preferredMassDisplay: "lb" as const,
  /** Below this gram threshold, prefer g display over lb. */
  smallMassDisplayGrams: 100,
} as const;

/**
 * Deterministic category mapping. Prefer USDA foodCategory when present,
 * otherwise keyword heuristics. Never uses an LLM.
 */
export function categorizeGroceryItem(input: {
  displayName: string;
  foodCategory?: string | null;
  measurementState?: CulinaryMeasurementState;
}): GroceryCategory {
  const usda = (input.foodCategory ?? "").toLowerCase();
  if (usda) {
    if (/vegetable|fruit|produce/.test(usda)) return "produce";
    if (/poultry|beef|pork|lamb|seafood|fish|meat/.test(usda)) return "meat_seafood";
    if (/dairy|egg|cheese|milk|yogurt|butter/.test(usda)) return "dairy_eggs";
    if (/cereal|grain|bakery|bread|pasta|rice/.test(usda)) return "grains_bakery";
    if (/canned|packaged|soup|sauce/.test(usda)) return "canned_packaged";
    if (/spice|herb|seasoning|oil|condiment|sweetener/.test(usda)) return "pantry_spices";
    if (/frozen/.test(usda)) return "frozen";
  }

  const name = input.displayName.toLowerCase();

  if (
    /\b(frozen)\b/.test(name) ||
    input.measurementState === undefined && /\bfrozen\b/.test(name)
  ) {
    if (/\bfrozen\b/.test(name)) return "frozen";
  }

  if (
    /\b(chicken|turkey|beef|pork|lamb|salmon|shrimp|fish|tuna|cod|thigh|breast|ground meat|bacon)\b/.test(
      name,
    )
  ) {
    return "meat_seafood";
  }

  if (
    /\b(milk|yogurt|cheese|butter|cream|egg|eggs|ghee|paneer|feta|cheddar)\b/.test(name)
  ) {
    return "dairy_eggs";
  }

  if (
    /\b(rice|pasta|bread|roti|naan|tortilla|flour|oat|quinoa|couscous|noodle|bagel|bun|pita|cereal|grain)\b/.test(
      name,
    )
  ) {
    return "grains_bakery";
  }

  if (/\b(canned|jarred|crushed tomato|tomato paste|broth|stock)\b/.test(name)) {
    return "canned_packaged";
  }

  if (
    /\b(salt|pepper|cumin|turmeric|paprika|chili|coriander|cinnamon|oregano|basil|thyme|spice|oil|olive oil|vinegar|sugar|honey|soy sauce|fish sauce|garlic powder|onion powder|pinch|mustard|seed|seeds|curry paste|paste|seasoning|herb|herbs)\b/.test(
      name,
    )
  ) {
    return "pantry_spices";
  }

  if (
    /\b(onion|tomato|garlic|ginger|lemon|lime|cilantro|parsley|spinach|lettuce|cucumber|carrot|pepper|avocado|banana|apple|herb|mint|cabbage|broccoli|potato|scallion|shallot|chili|chilli|celery|zucchini|mushroom|berry|berries|fruit|vegetable|eggplant|peas|bean|coconut)\b/.test(
      name,
    )
  ) {
    return "produce";
  }

  return "other";
}

export function isNonPurchasedGroceryIngredient(input: {
  displayName: string;
  canonicalFoodId?: string | null;
  normalizedKey?: string;
}): boolean {
  const normalized =
    input.normalizedKey?.toLowerCase().trim() ??
    input.displayName.toLowerCase().replace(/\s+/g, " ").trim();
  if (GROCERY_POLICY.nonPurchasedKeys.has(normalized)) return true;
  // Exact water-like tokens only — do not drop "watermelon", "coconut water", etc.
  if (/^(tap |cold |hot |boiling |filtered )?water$/i.test(normalized)) return true;
  return false;
}

/** Category display order on the Grocery tab. */
export const GROCERY_CATEGORY_ORDER: GroceryCategory[] = [
  "produce",
  "meat_seafood",
  "dairy_eggs",
  "grains_bakery",
  "canned_packaged",
  "pantry_spices",
  "frozen",
  "other",
];
