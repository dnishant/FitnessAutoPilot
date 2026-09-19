import type { CulinaryMeasurementState } from "@fitness-autopilot/contracts";
import {
  inferMeasurementStateHint,
  normalizeIngredientName,
} from "../food-resolution/ingredient-key";

/**
 * Grocery aggregation identity — NOT nutrition resolution key.
 * Role must not split the same food across grocery rows.
 */
export function buildGroceryIdentityKey(input: {
  canonicalFoodId?: string | null;
  displayName: string;
  measurementState?: CulinaryMeasurementState;
  preparation?: string | null;
}): string {
  if (input.canonicalFoodId) {
    const state = input.measurementState ?? "unknown";
    return `food:${input.canonicalFoodId}|${state}`;
  }
  const normalized = normalizeIngredientName(input.displayName);
  const state = inferMeasurementStateHint({
    name: input.displayName,
    preparation: input.preparation ?? null,
    measurementState: input.measurementState,
  });
  return `name:${normalized}|${state}`;
}

export function stableGroceryItemId(identityKey: string): string {
  // Deterministic, URL-safe id — not a cryptographic hash.
  let hash = 2166136261;
  for (let i = 0; i < identityKey.length; i += 1) {
    hash ^= identityKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return `groc_${unsigned.toString(36)}`;
}
