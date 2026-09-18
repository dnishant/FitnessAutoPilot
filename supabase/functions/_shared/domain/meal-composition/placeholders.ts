import { normalizeComponentName } from "./component-identity.ts";

/**
 * Planning-concept placeholders are not edible food. They must never reach
 * authoritative nutrition / PLAN-010. Detection is generic (role/form language),
 * not dish-name matching.
 *
 * Purpose-sentence culinary needs ("Absorbs pan sauce") are handled by
 * `edible-identity.ts` — keep this module focused on role/form stubs.
 */
const PLACEHOLDER_EXACT = new Set([
  "bowl base",
  "bowl vegetables",
  "bowl vegetable",
  "plate base",
  "carb side",
  "carbohydrate side",
  "vegetable side",
  "veg side",
  "protein side",
  "sauce side",
  "side",
  "sides",
  "sauce",
  "condiment",
  "garnish",
  "pasta sauce",
  "curry vegetables",
  "curry sauce",
  "carbohydrate accompaniment",
  "fresh vegetable accompaniment",
  "vegetable accompaniment",
  "carb accompaniment",
]);

const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^(bowl|plate|meal|dish)\s+(base|vegetables?|veg|sides?)$/i,
  /^(carb|carbohydrate|vegetable|veg|protein|sauce|condiment|garnish|legume|fruit)(\s+(side|base|accompaniment|component))?$/i,
  /^(missing|generic|placeholder|unknown)\b/i,
];

export function isUnresolvedPlaceholderName(name: string): boolean {
  const normalized = normalizeComponentName(name);
  if (!normalized) return true;
  if (PLACEHOLDER_EXACT.has(normalized)) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(normalized));
}
