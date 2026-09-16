import type { ExternalFoodRecord, FoodSearchResult } from "../../contracts/index.ts";
import {
  hasRequiredCanonicalNutrition,
  mapExternalNutrientsToCanonicalNutrition,
  type ExternalNutrientInput,
} from "../../domain/index.ts";

type UsdaFoodNutrient = {
  nutrientId?: number;
  nutrient?: { id?: number; number?: number | string; name?: string; unitName?: string };
  nutrientNumber?: string | number;
  nutrientName?: string;
  unitName?: string;
  value?: number;
  amount?: number;
};

type UsdaFoodPortion = {
  amount?: number;
  modifier?: string;
  portionDescription?: string;
  measureUnit?: { name?: string; abbreviation?: string };
  gramWeight?: number;
};

type UsdaSearchFood = {
  fdcId?: number | string;
  description?: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  foodCategory?: string | { description?: string };
  score?: number;
};

type UsdaFoodDetail = UsdaSearchFood & {
  foodNutrients?: UsdaFoodNutrient[];
  foodPortions?: UsdaFoodPortion[];
};

function nutrientInputs(foodNutrients: UsdaFoodNutrient[] | undefined): ExternalNutrientInput[] {
  if (!foodNutrients) return [];
  return foodNutrients.map((n) => ({
    nutrientId: n.nutrientId ?? n.nutrient?.id ?? null,
    nutrientNumber: n.nutrientNumber ?? n.nutrient?.number ?? null,
    nutrientName: n.nutrientName ?? n.nutrient?.name ?? null,
    unitName: n.unitName ?? n.nutrient?.unitName ?? null,
    value: n.value ?? n.amount ?? null,
  }));
}

function categoryName(
  foodCategory: UsdaSearchFood["foodCategory"],
): string | null {
  if (!foodCategory) return null;
  if (typeof foodCategory === "string") return foodCategory;
  return foodCategory.description ?? null;
}

export function mapUsdaSearchHit(food: UsdaSearchFood): FoodSearchResult | null {
  if (food.fdcId === undefined || food.fdcId === null) return null;
  const description = (food.description ?? "").trim();
  if (!description) return null;
  return {
    externalId: String(food.fdcId),
    description,
    dataType: food.dataType ?? null,
    brandName: food.brandName ?? food.brandOwner ?? null,
    foodCategory: categoryName(food.foodCategory),
    score: food.score,
  };
}

export function mapUsdaFoodDetail(food: UsdaFoodDetail): ExternalFoodRecord | null {
  if (food.fdcId === undefined || food.fdcId === null) return null;
  const description = (food.description ?? "").trim();
  if (!description) return null;

  const mapped = mapExternalNutrientsToCanonicalNutrition(nutrientInputs(food.foodNutrients));
  if (!hasRequiredCanonicalNutrition(mapped)) {
    return null;
  }

  const measures = (food.foodPortions ?? [])
    .map((portion) => {
      const gramWeight = portion.gramWeight;
      if (gramWeight === undefined || !Number.isFinite(gramWeight) || gramWeight <= 0) {
        return null;
      }
      const amount = portion.amount && portion.amount > 0 ? portion.amount : 1;
      const unitName =
        portion.measureUnit?.abbreviation ??
        portion.measureUnit?.name ??
        portion.modifier ??
        "serving";
      const label =
        portion.portionDescription ??
        [portion.modifier, unitName].filter(Boolean).join(" ") ??
        unitName;
      return {
        label: label || unitName,
        amount,
        unitName,
        gramWeight,
      };
    })
    .filter((m): m is NonNullable<typeof m> => m != null);

  const externalId = String(food.fdcId);
  return {
    provider: "usda",
    externalId,
    canonicalName: description,
    source: {
      provider: "usda",
      externalId,
      dataType: food.dataType ?? null,
    },
    description,
    nutrientsPer100g: {
      caloriesKcal: mapped.caloriesKcal,
      proteinGrams: mapped.proteinGrams,
      carbohydrateGrams: mapped.carbohydrateGrams,
      fatGrams: mapped.fatGrams,
      fiberGrams: mapped.fiberGrams,
    },
    measures,
    metadata: {
      brandName: food.brandName ?? food.brandOwner ?? null,
      foodCategory: categoryName(food.foodCategory),
    },
  };
}
