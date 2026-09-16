import type {
  MealComponentRole,
  MealComponentType,
  ResolvedRecipeIngredient,
} from "../../contracts/index.ts";

/** Map PLAN-008 meal component types onto PLAN-009.5 roles. */
export function mapPlan008TypeToRole(type: MealComponentType): MealComponentRole {
  switch (type) {
    case "main":
      return "main";
    case "carb_side":
      return "carbohydrate";
    case "vegetable_side":
      return "vegetable";
    case "sauce":
    case "condiment":
      return "sauce_condiment";
    case "garnish":
      return "garnish";
    default:
      return "garnish";
  }
}

/**
 * Normalize a component name for weekly identity / dedup.
 * "Mint-Yogurt Chutney" ≡ "mint yogurt chutney" ≡ "mint raita" is NOT forced —
 * only spelling/punctuation variants of the same label share identity.
 */
export function normalizeComponentName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildNormalizedComponentKey(role: MealComponentRole, name: string): string {
  return `${role}:${normalizeComponentName(name)}`;
}

/** Known compound culinary sides that must not be faked as a single USDA food. */
const COMPOUND_COMPONENT_PATTERNS: RegExp[] = [
  /\bkachumber\b/i,
  /\bchutney\b/i,
  /\braita\b/i,
  /\bslaw\b/i,
  /\bsalsa\b/i,
  /\brelish\b/i,
  /\bpico\b/i,
  /\bdressing\b/i,
  /\bsalad\b/i,
  /\band\b/i,
  /\bwith\b/i,
  /\brice and peas\b/i,
  /\byogurt sauce\b/i,
  /\bmint[- ]?yogurt\b/i,
];

export function looksLikeCompoundComponent(name: string): boolean {
  const normalized = name.trim();
  if (normalized.split(/\s+/).length >= 4) return true;
  return COMPOUND_COMPONENT_PATTERNS.some((re) => re.test(normalized));
}

const CARB_NAME_RE =
  /\b(rice|pasta|noodle|noodles|tortilla|bread|potato|potatoes|quinoa|couscous|bulgur|farro|grain|roti|naan|injera|polenta|grits|corn|beans|lentils|dal|dahl|chickpea|pita)\b/i;

const VEGETABLE_NAME_RE =
  /\b(cabbage|lettuce|spinach|kale|broccoli|carrot|cucumber|tomato|pepper|zucchini|eggplant|greens|salad|slaw|kachumber|onion|scallion|herb|basil|cilantro|pickle|pickled|vegetable|veggie|coleslaw|beansprout|bean sprout)\b/i;

const SAUCE_NAME_RE =
  /\b(sauce|chutney|raita|salsa|dressing|aioli|mayo|mayonnaise|crema|tahini|yogurt|curry|gravy|glaze|marinade|pesto|chimichurri)\b/i;

const PROTEIN_NAME_RE =
  /\b(chicken|beef|pork|lamb|shrimp|fish|salmon|tuna|tofu|tempeh|egg|turkey|duck|goat|paneer|prawn|crab|lobster)\b/i;

export function ingredientSuggestsRole(
  ingredient: ResolvedRecipeIngredient,
): MealComponentRole | null {
  const role = ingredient.role;
  if (role === "protein") return "main";
  if (role === "carbohydrate" || role === "carb") return "carbohydrate";
  if (role === "vegetable") return "vegetable";
  if (role === "sauce") return "sauce_condiment";
  if (role === "fat") return "fat";
  if (role === "garnish") return "garnish";

  const name = ingredient.name;
  if (CARB_NAME_RE.test(name)) return "carbohydrate";
  if (VEGETABLE_NAME_RE.test(name) && role !== "aromatic" && role !== "seasoning") {
    return "vegetable";
  }
  if (SAUCE_NAME_RE.test(name)) return "sauce_condiment";
  if (role === "aromatic" || role === "seasoning" || role === "acid") return null;
  if (PROTEIN_NAME_RE.test(name)) return "main";
  return null;
}

/**
 * Estimate whether an ingredient quantity is "meaningful" for a meal role.
 * 1 tbsp onion / 2 tsp sugar must not count as vegetable / carbohydrate.
 */
export function isMeaningfulIngredientQuantity(
  ingredient: ResolvedRecipeIngredient,
  role: MealComponentRole,
): boolean {
  const q = ingredient.quantity;
  const unit = ingredient.unit.trim().toLowerCase();

  const isTinyVolume =
    /^(tsp|teaspoon|teaspoons|tsp\.|pinch|dash)$/i.test(unit) ||
    (/^(tbsp|tablespoon|tablespoons|tbsp\.)$/i.test(unit) && q <= 1 && role !== "fat");

  if (isTinyVolume && (role === "carbohydrate" || role === "vegetable" || role === "fruit")) {
    return false;
  }

  if (/^(g|gram|grams|kg)$/i.test(unit)) {
    const grams = /kg/i.test(unit) ? q * 1000 : q;
    if (role === "carbohydrate") return grams >= 40;
    if (role === "vegetable" || role === "fruit" || role === "legume") return grams >= 50;
    if (role === "main") return grams >= 80;
    if (role === "sauce_condiment") return grams >= 15;
    if (role === "fat") return grams >= 5;
    return grams >= 20;
  }

  if (/^(ml|milliliter|milliliters|l|liter|liters)$/i.test(unit)) {
    const ml = /^l/i.test(unit) ? q * 1000 : q;
    if (role === "sauce_condiment") return ml >= 30;
    if (role === "carbohydrate") return ml >= 80;
    return ml >= 40;
  }

  if (/^(cup|cups)$/i.test(unit)) {
    return q >= 0.25;
  }

  if (/^(piece|pieces|tortilla|tortillas|clove|cloves)$/i.test(unit)) {
    if (role === "carbohydrate") return q >= 1;
    if (role === "main") return q >= 1;
    // cloves of garlic etc. are not meaningful vegetables
    if (role === "vegetable" && /clove/i.test(unit)) return false;
    return q >= 1;
  }

  // Unknown units: be conservative for aromatics, permissive for explicit carb/veg roles
  if (ingredient.role === "aromatic" || ingredient.role === "seasoning") return false;
  return true;
}

export function namesLikelyEquivalent(a: string, b: string): boolean {
  const na = normalizeComponentName(a);
  const nb = normalizeComponentName(b);
  if (na === nb) return true;
  // Soft plural collapse: "corn tortilla" ≡ "corn tortillas"
  const singularize = (s: string) => s.replace(/\b(\w+)s\b/g, "$1");
  if (singularize(na) === singularize(nb)) return true;
  // Soft synonym collapse for common condiment variants (prep reuse).
  const synonyms: Array<[RegExp, string]> = [
    [/\bmint\b.*\b(yogurt|yoghurt)\b.*\b(chutney|raita|sauce)\b/, "mint yogurt sauce"],
    [/\bmint\b.*\braita\b/, "mint yogurt sauce"],
    [/\bbasmati\b.*\brice\b/, "basmati rice"],
    [/\bjasmine\b.*\brice\b/, "jasmine rice"],
    [/\bsteamed\b.*\brice\b/, "steamed rice"],
    [/\bcabbage\b.*\bslaw\b|\bslaw\b|\bcabbage\b/, "cabbage"],
  ];
  let ca = na;
  let cb = nb;
  for (const [re, canon] of synonyms) {
    if (re.test(ca)) ca = canon;
    if (re.test(cb)) cb = canon;
  }
  return ca === cb;
}
