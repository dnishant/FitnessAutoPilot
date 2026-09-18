import { normalizeComponentName } from "./component-identity.ts";
import { isUnresolvedPlaceholderName } from "./placeholders.ts";

/**
 * Culinary need / purpose language is not edible food identity.
 * Used to stop PLAN-008 mealComponents like
 * "Absorbs delicious lemon-wine pan sauce" from becoming PLAN-010 variables.
 *
 * Heuristics are intentionally generic (verb-led purpose, abstract accompaniments),
 * not dish- or cuisine-specific.
 */

const PURPOSE_VERB_RE =
  /^(absorbs?|complements?|provides?|adds?|balances?|brings?|creates?|offers?|delivers?|serves? as|pairs?|finishes?|rounds?|enhances?|supplies?|gives?|contributes?|supports?|cuts? through|soaks? up)\b/i;

const ABSTRACT_NEED_RE =
  /^(something|anything|a side|an accompaniment|a carb|a vegetable|a starch|a sauce|freshness|acidity|crunch|contrast|moisture)\b/i;

const PURPOSE_CLAUSE_RE = /^(to |for |with which |that |which )\b/i;

/**
 * Food-ish lexical anchors — shared culinary vocabulary, not recipe allowlists.
 * A name without any of these that also matches purpose language is not edible.
 */
const FOOD_NOUN_RE =
  /\b(rice|potato|potatoes|pasta|noodle|noodles|bread|tortilla|roti|naan|quinoa|couscous|bulgur|farro|millet|polenta|salad|slaw|kachumber|spinach|kale|arugula|lettuce|cabbage|broccoli|carrot|cucumber|tomato|pepper|onion|beans|lentils|dal|chickpea|yogurt|raita|chutney|salsa|crema|sauce|relish|pickle|fruit|avocado|corn|peas|greens|herbs?|fish|chicken|beef|pork|lamb|tofu|paneer|egg|eggs|cheese|soup|stew|curry|grain|fries|chips|mash|puree|pureé|risotto|pilaf|biryani|couscous|flatbread|pita|wrap|bun|toast|polenta|grits|veg|vegetable|vegetables)\b/i;

export function looksLikeCulinaryNeedName(name: string): boolean {
  const normalized = normalizeComponentName(name);
  if (!normalized) return true;
  if (PURPOSE_VERB_RE.test(normalized)) return true;
  if (ABSTRACT_NEED_RE.test(normalized)) return true;
  if (PURPOSE_CLAUSE_RE.test(normalized) && !FOOD_NOUN_RE.test(normalized)) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  // Long prose without a food noun is a purpose sentence, not a dish name.
  if (words.length >= 6 && !FOOD_NOUN_RE.test(normalized)) return true;
  // "fresh acidity and crunch" style fragments
  if (
    words.length >= 3 &&
    !FOOD_NOUN_RE.test(normalized) &&
    /\b(acidity|crunch|freshness|contrast|richness|moisture|sauce|pan sauce)\b/i.test(normalized)
  ) {
    return true;
  }
  return false;
}

/**
 * True only when `name` can plausibly identify food the user eats.
 * Placeholders and culinary-need prose return false.
 */
export function isEdibleFoodIdentity(name: string): boolean {
  if (!name || !name.trim()) return false;
  if (isUnresolvedPlaceholderName(name)) return false;
  if (looksLikeCulinaryNeedName(name)) return false;
  return true;
}

/**
 * Unified gate: may this label enter CompleteMeal as an independent edible component?
 */
export function isNutritionEligibleComponentName(name: string): boolean {
  return isEdibleFoodIdentity(name);
}
