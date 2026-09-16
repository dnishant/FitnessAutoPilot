import type {
  CanonicalFood,
  CulinaryMeasurementState,
  QuantityNormalizationResult,
} from "@fitness-autopilot/contracts";

export type FoodMeasurementContext = {
  food?: CanonicalFood | null;
  measurementState?: CulinaryMeasurementState;
  ingredientName?: string;
};

export type QuantityNormalizationFailure = {
  code: "UNSUPPORTED_UNIT" | "MISSING_MEASURE_MAPPING" | "INVALID_QUANTITY";
  message: string;
};

export type QuantityNormalizationOutcome =
  | { ok: true; value: QuantityNormalizationResult }
  | { ok: false; error: QuantityNormalizationFailure };

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

const VOLUME_ALIASES: Record<string, string[]> = {
  tsp: ["tsp", "teaspoon", "teaspoons"],
  tbsp: ["tbsp", "tablespoon", "tablespoons", "tbs"],
  cup: ["cup", "cups"],
  ml: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
  l: ["l", "liter", "liters", "litre", "litres"],
};

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\./g, "");
}

function matchesAlias(unit: string, aliases: string[]): boolean {
  return aliases.includes(unit);
}

function householdUnitKey(unit: string): string | null {
  for (const [key, aliases] of Object.entries(VOLUME_ALIASES)) {
    if (matchesAlias(unit, aliases)) return key;
  }
  return null;
}

/**
 * Find a provider measure mapping for a household / discrete unit.
 * Never assumes 1 tbsp = 15 g universally.
 */
export function findProviderMeasureGrams(
  food: CanonicalFood,
  quantity: number,
  unit: string,
): QuantityNormalizationResult | null {
  const normalized = normalizeUnit(unit);
  const key = householdUnitKey(normalized);
  const aliases = key ? VOLUME_ALIASES[key] ?? [normalized] : [normalized];
  const measures = food.measures ?? [];
  for (const measure of measures) {
    const label = `${measure.amount} ${measure.unitName} ${measure.label}`.toLowerCase();
    const unitName = measure.unitName.toLowerCase();
    const measureLabel = measure.label.toLowerCase();
    const unitMatch = aliases.some(
      (a) =>
        unitName === a ||
        measureLabel === a ||
        label.includes(` ${a}`) ||
        label.startsWith(a) ||
        measureLabel.includes(a),
    );
    if (!unitMatch) continue;
    if (!Number.isFinite(measure.gramWeight) || measure.gramWeight <= 0) continue;
    const amount = measure.amount > 0 ? measure.amount : 1;
    const grams = (quantity / amount) * measure.gramWeight;
    if (!Number.isFinite(grams) || grams <= 0) continue;
    return {
      grams,
      method: "provider_measure",
      confidence: "high",
      detail: `Mapped via provider measure "${measure.label}" (${measure.gramWeight} g per ${measure.amount} ${measure.unitName}).`,
    };
  }
  return null;
}

/**
 * Deterministic quantity → grams normalization.
 * Volume/household units require food-specific measure data.
 */
export function toGrams(
  quantity: number,
  unit: string,
  foodContext?: FoodMeasurementContext,
): QuantityNormalizationOutcome {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_QUANTITY",
        message: "Quantity must be a finite number greater than 0.",
      },
    };
  }

  const normalized = normalizeUnit(unit);
  const massFactor = MASS_TO_GRAMS[normalized];
  if (massFactor !== undefined) {
    return {
      ok: true,
      value: {
        grams: quantity * massFactor,
        method: "direct_mass",
        confidence: "high",
        detail: `Direct mass conversion (${normalized} → g).`,
      },
    };
  }

  // ml of water-like liquids is not universally 1 g/ml for oils — require measures.
  if (foodContext?.food) {
    const mapped = findProviderMeasureGrams(foodContext.food, quantity, normalized);
    if (mapped) {
      return { ok: true, value: mapped };
    }
  }

  const household = householdUnitKey(normalized);
  if (household || normalized === "piece" || normalized === "clove" || normalized === "pinch") {
    return {
      ok: false,
      error: {
        code: "MISSING_MEASURE_MAPPING",
        message: `No trustworthy food-specific gram mapping for unit "${unit}". Refusing universal volume→weight conversion.`,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "UNSUPPORTED_UNIT",
      message: `Unsupported unit "${unit}" for gram normalization.`,
    },
  };
}

export interface QuantityNormalizer {
  toGrams(
    quantity: number,
    unit: string,
    foodContext?: FoodMeasurementContext,
  ): QuantityNormalizationOutcome;
}

export const defaultQuantityNormalizer: QuantityNormalizer = {
  toGrams,
};
