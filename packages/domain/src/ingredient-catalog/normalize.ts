/**
 * Deterministic alias normalization for CATALOG-001.
 * Exact match only — no fuzzy matching.
 */

export function normalizeIngredientAlias(alias: string): string {
  return alias.replace(/\s+/g, " ").trim().toLowerCase();
}
