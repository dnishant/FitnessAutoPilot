import type { CanonicalFood, GroceryConversionConfidence } from "@fitness-autopilot/contracts";
import { findProviderMeasureGrams } from "../food-resolution/quantity-normalizer";
import { GROCERY_POLICY } from "./policy";

const MASS_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
};

/** Pure volume equivalences — never claim these equal grams. */
const VOLUME_TO_TSP: Record<string, number> = {
  tsp: 1,
  teaspoon: 1,
  teaspoons: 1,
  tbsp: 3,
  tablespoon: 3,
  tablespoons: 3,
  tbs: 3,
  cup: 48,
  cups: 48,
  ml: 48 / 240, // only for aggregating ml↔tsp of the SAME liquid when already in volume family
  milliliter: 48 / 240,
  milliliters: 48 / 240,
  millilitre: 48 / 240,
  millilitres: 48 / 240,
  l: 48 / 0.24,
  liter: 48 / 0.24,
  liters: 48 / 0.24,
  litre: 48 / 0.24,
  litres: 48 / 0.24,
};

const COUNT_ALIASES = new Set([
  "count",
  "piece",
  "pieces",
  "whole",
  "each",
  "clove",
  "cloves",
  "medium",
  "large",
  "small",
  "bunch",
  "bunches",
  "pinch",
  "pinches",
  "leaf",
  "leaves",
  "sprig",
  "sprigs",
]);

export type UnitFamily = "mass" | "volume" | "count" | "unknown";

export function normalizeUnitToken(unit: string): string {
  return unit.trim().toLowerCase().replace(/\./g, "");
}

export function unitFamily(unit: string): UnitFamily {
  const u = normalizeUnitToken(unit);
  if (MASS_TO_GRAMS[u] != null) return "mass";
  if (VOLUME_TO_TSP[u] != null) return "volume";
  if (COUNT_ALIASES.has(u)) return "count";
  return "unknown";
}

export type CompatibleQuantity =
  | {
      ok: true;
      family: "mass";
      grams: number;
      confidence: GroceryConversionConfidence;
      detail?: string;
    }
  | {
      ok: true;
      family: "volume";
      teaspoons: number;
      confidence: GroceryConversionConfidence;
      detail?: string;
    }
  | {
      ok: true;
      family: "count";
      count: number;
      unit: string;
      confidence: GroceryConversionConfidence;
    }
  | { ok: false; reason: string };

/**
 * Convert a quantity into a comparable canonical basis when safe.
 * Does NOT invent food-specific volume→weight conversions without measures.
 */
export function toCompatibleBasis(
  quantity: number,
  unit: string,
  food?: CanonicalFood | null,
): CompatibleQuantity {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, reason: "Invalid quantity" };
  }
  const u = normalizeUnitToken(unit);
  const mass = MASS_TO_GRAMS[u];
  if (mass != null) {
    return {
      ok: true,
      family: "mass",
      grams: quantity * mass,
      confidence: "high",
      detail: `Direct mass (${u} → g)`,
    };
  }

  if (food) {
    const mapped = findProviderMeasureGrams(food, quantity, u);
    if (mapped) {
      return {
        ok: true,
        family: "mass",
        grams: mapped.grams,
        confidence: mapped.confidence,
        detail: mapped.detail,
      };
    }
  }

  const volume = VOLUME_TO_TSP[u];
  if (volume != null) {
    // ml/L volume aggregation is only safe as volume↔volume, never as grams.
    return {
      ok: true,
      family: "volume",
      teaspoons: quantity * volume,
      confidence: "high",
      detail: `Volume equivalence (${u} → tsp)`,
    };
  }

  if (COUNT_ALIASES.has(u)) {
    return {
      ok: true,
      family: "count",
      count: quantity,
      unit: u,
      confidence: "high",
    };
  }

  return {
    ok: false,
    reason: `No trusted compatible basis for unit "${unit}"`,
  };
}

export function sameCountUnit(a: string, b: string): boolean {
  return normalizeUnitToken(a) === normalizeUnitToken(b);
}

export type DisplayQuantity = {
  displayQuantity: number;
  displayUnit: string;
  displayLabel: string;
};

/**
 * Format required quantity for UI without mutating the underlying demand.
 * Mass: prefer lb for larger amounts (US), keep g for small amounts.
 * Volume: prefer tbsp/cup when tsp accumulates.
 * Count: keep the source count unit.
 */
export function formatGroceryDisplay(input: {
  quantity: number;
  unit: string;
  family?: UnitFamily;
}): DisplayQuantity {
  const family = input.family ?? unitFamily(input.unit);
  if (family === "mass") {
    const basis = toCompatibleBasis(input.quantity, input.unit);
    const grams = basis.ok && basis.family === "mass" ? basis.grams : input.quantity;
    if (grams >= GROCERY_POLICY.smallMassDisplayGrams) {
      const lb = grams / (MASS_TO_GRAMS.lb ?? 453.59237);
      const rounded = roundDisplay(lb, lb >= 10 ? 0 : 1);
      return {
        displayQuantity: rounded,
        displayUnit: "lb",
        displayLabel: `~${formatNumber(rounded)} lb`,
      };
    }
    const g = roundDisplay(grams, grams >= 100 ? 0 : 1);
    return {
      displayQuantity: g,
      displayUnit: "g",
      displayLabel: `${formatNumber(g)} g`,
    };
  }

  if (family === "volume") {
    const basis = toCompatibleBasis(input.quantity, input.unit);
    const tsp = basis.ok && basis.family === "volume" ? basis.teaspoons : input.quantity;
    if (tsp >= 48) {
      const cups = tsp / 48;
      const rounded = roundDisplay(cups, cups >= 10 ? 0 : 2);
      return {
        displayQuantity: rounded,
        displayUnit: "cup",
        displayLabel: `${formatNumber(rounded)} cup${rounded === 1 ? "" : "s"}`,
      };
    }
    if (tsp >= 3) {
      const tbsp = tsp / 3;
      const rounded = roundDisplay(tbsp, tbsp >= 10 ? 0 : 2);
      return {
        displayQuantity: rounded,
        displayUnit: "tbsp",
        displayLabel: `${formatNumber(rounded)} tbsp`,
      };
    }
    const rounded = roundDisplay(tsp, tsp >= 10 ? 0 : 2);
    // Never round tiny spices to zero.
    const safe = rounded <= 0 ? roundDisplay(Math.max(tsp, 0.01), 2) : rounded;
    return {
      displayQuantity: safe,
      displayUnit: "tsp",
      displayLabel: `${formatNumber(safe)} tsp`,
    };
  }

  const u = normalizeUnitToken(input.unit);
  // Discrete count units: ceil for shoppable display without mutating exact demand.
  if (family === "count" || COUNT_ALIASES.has(u)) {
    const ceiled = Math.max(1, Math.ceil(input.quantity - Number.EPSILON));
    return {
      displayQuantity: ceiled,
      displayUnit: u || input.unit,
      displayLabel: `${formatNumber(ceiled)} ${u || input.unit}`,
    };
  }
  const rounded = roundDisplay(input.quantity, Number.isInteger(input.quantity) ? 0 : 2);
  const safe = rounded <= 0 ? roundDisplay(Math.max(input.quantity, 0.01), 2) : rounded;
  return {
    displayQuantity: safe,
    displayUnit: u || input.unit,
    displayLabel: `${formatNumber(safe)} ${u || input.unit}`,
  };
}

function roundDisplay(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor + Number.EPSILON) / factor;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(value);
}

/** Preferred storage unit after mass aggregation. */
export function preferredMassUnit(grams: number): { quantity: number; unit: string } {
  return { quantity: grams, unit: "g" };
}

export function preferredVolumeUnit(teaspoons: number): { quantity: number; unit: string } {
  if (teaspoons >= 48) return { quantity: teaspoons / 48, unit: "cup" };
  if (teaspoons >= 3) return { quantity: teaspoons / 3, unit: "tbsp" };
  return { quantity: teaspoons, unit: "tsp" };
}
