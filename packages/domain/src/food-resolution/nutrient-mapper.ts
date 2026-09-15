/**
 * Central USDA / external nutrient ID → canonical nutrition mapping.
 * Do not scatter nutrient name/ID checks across the codebase.
 */

export const USDA_NUTRIENT_IDS = {
  energyKcal: 1008,
  protein: 1003,
  carbohydrate: 1005,
  fat: 1004,
  fiber: 1079,
  /** Alternate energy entry sometimes present (kJ) — ignored for kcal. */
  energyKj: 1062,
} as const;

export type CanonicalNutrientKey =
  | "caloriesKcal"
  | "proteinGrams"
  | "carbohydrateGrams"
  | "fatGrams"
  | "fiberGrams";

export type ExternalNutrientInput = {
  nutrientId?: number | null;
  nutrientNumber?: string | number | null;
  nutrientName?: string | null;
  unitName?: string | null;
  value?: number | null;
  amount?: number | null;
};

export type MappedCanonicalNutrition = {
  caloriesKcal: number | null;
  proteinGrams: number | null;
  carbohydrateGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
  missingRequired: CanonicalNutrientKey[];
};

const REQUIRED: CanonicalNutrientKey[] = [
  "caloriesKcal",
  "proteinGrams",
  "carbohydrateGrams",
  "fatGrams",
];

function nutrientValue(n: ExternalNutrientInput): number | null {
  const raw = n.value ?? n.amount;
  if (raw === null || raw === undefined) return null;
  if (!Number.isFinite(raw) || raw < 0) return null;
  return raw;
}

function matchesEnergyKcal(n: ExternalNutrientInput): boolean {
  if (n.nutrientId === USDA_NUTRIENT_IDS.energyKcal) return true;
  const unit = (n.unitName ?? "").toLowerCase();
  const name = (n.nutrientName ?? "").toLowerCase();
  if (n.nutrientId === USDA_NUTRIENT_IDS.energyKj) return false;
  if (name.includes("energy") && (unit === "kcal" || unit === "kilocalorie")) return true;
  if (name === "energy" && unit === "kcal") return true;
  return false;
}

function matchesProtein(n: ExternalNutrientInput): boolean {
  if (n.nutrientId === USDA_NUTRIENT_IDS.protein) return true;
  return (n.nutrientName ?? "").toLowerCase() === "protein";
}

function matchesCarbohydrate(n: ExternalNutrientInput): boolean {
  if (n.nutrientId === USDA_NUTRIENT_IDS.carbohydrate) return true;
  const name = (n.nutrientName ?? "").toLowerCase();
  return name.startsWith("carbohydrate") || name === "carbohydrate, by difference";
}

function matchesFat(n: ExternalNutrientInput): boolean {
  if (n.nutrientId === USDA_NUTRIENT_IDS.fat) return true;
  const name = (n.nutrientName ?? "").toLowerCase();
  return name === "total lipid (fat)" || name === "total fat" || name === "fat";
}

function matchesFiber(n: ExternalNutrientInput): boolean {
  if (n.nutrientId === USDA_NUTRIENT_IDS.fiber) return true;
  const name = (n.nutrientName ?? "").toLowerCase();
  return name.includes("fiber") || name.includes("fibre");
}

/**
 * Map provider nutrient rows to canonical per-100g nutrition.
 * Missing required nutrients stay `null` (never silently coerced to 0).
 */
export function mapExternalNutrientsToCanonicalNutrition(
  nutrients: readonly ExternalNutrientInput[],
): MappedCanonicalNutrition {
  let caloriesKcal: number | null = null;
  let proteinGrams: number | null = null;
  let carbohydrateGrams: number | null = null;
  let fatGrams: number | null = null;
  let fiberGrams: number | null = null;

  for (const n of nutrients) {
    const value = nutrientValue(n);
    if (value === null) continue;
    if (matchesEnergyKcal(n) && caloriesKcal === null) {
      caloriesKcal = value;
      continue;
    }
    if (matchesProtein(n) && proteinGrams === null) {
      proteinGrams = value;
      continue;
    }
    if (matchesCarbohydrate(n) && carbohydrateGrams === null) {
      carbohydrateGrams = value;
      continue;
    }
    if (matchesFat(n) && fatGrams === null) {
      fatGrams = value;
      continue;
    }
    if (matchesFiber(n) && fiberGrams === null) {
      fiberGrams = value;
    }
  }

  const mapped = {
    caloriesKcal,
    proteinGrams,
    carbohydrateGrams,
    fatGrams,
    fiberGrams,
  };
  const missingRequired = REQUIRED.filter((key) => mapped[key] === null);
  return { ...mapped, missingRequired };
}

export function hasRequiredCanonicalNutrition(
  mapped: MappedCanonicalNutrition,
): mapped is MappedCanonicalNutrition & {
  caloriesKcal: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
} {
  return mapped.missingRequired.length === 0;
}
