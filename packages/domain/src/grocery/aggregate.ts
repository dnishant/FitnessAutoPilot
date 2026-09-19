import type {
  GroceryItem,
  GroceryProvenanceEntry,
  GroceryQuantityLine,
} from "@fitness-autopilot/contracts";
import { buildGroceryIdentityKey, stableGroceryItemId } from "./identity";
import { categorizeGroceryItem } from "./policy";
import type { GroceryReconciliation, IngredientRequirement } from "./types";
import {
  formatGroceryDisplay,
  preferredMassUnit,
  preferredVolumeUnit,
  sameCountUnit,
  toCompatibleBasis,
  type UnitFamily,
} from "./units";

type QuantityBucket = {
  family: UnitFamily;
  /** Canonical accumulated value (grams / teaspoons / count). */
  value: number;
  /** Representative unit for count family. */
  countUnit?: string;
  confidence: "high" | "medium" | "low" | "none";
  contributions: IngredientRequirement[];
};

type IdentityGroup = {
  identityKey: string;
  displayName: string;
  canonicalFoodId: string | null;
  measurementState: IngredientRequirement["measurementState"];
  foodCategory?: string | null;
  buckets: QuantityBucket[];
  /** Requirements that could not join any compatible bucket. */
  incompatible: IngredientRequirement[];
  allRequirements: IngredientRequirement[];
};

/**
 * Aggregate ingredient requirements by canonical identity.
 * Compatible units merge; incompatible units become separate quantity lines.
 */
export function aggregateIngredientRequirements(
  requirements: readonly IngredientRequirement[],
): {
  items: GroceryItem[];
  reconciliation: GroceryReconciliation;
} {
  const purchasable = requirements.filter((r) => !r.excludedAsNonPurchased && r.quantity > 0);
  const excludedNonPurchasedCount = requirements.filter((r) => r.excludedAsNonPurchased).length;

  const groups = new Map<string, IdentityGroup>();
  for (const req of purchasable) {
    const key =
      req.identityKey ||
      buildGroceryIdentityKey({
        canonicalFoodId: req.canonicalFoodId,
        displayName: req.displayName,
        measurementState: req.measurementState,
      });
    let group = groups.get(key);
    if (!group) {
      group = {
        identityKey: key,
        displayName: req.displayName,
        canonicalFoodId: req.canonicalFoodId,
        measurementState: req.measurementState,
        foodCategory: req.foodCategory,
        buckets: [],
        incompatible: [],
        allRequirements: [],
      };
      groups.set(key, group);
    }
    group.allRequirements.push(req);
    mergeIntoGroup(group, req);
  }

  const items: GroceryItem[] = [];
  let incompatibleQuantityLineCount = 0;

  for (const group of groups.values()) {
    const quantities: GroceryQuantityLine[] = [];
    for (const bucket of group.buckets) {
      const line = bucketToQuantityLine(bucket);
      if (line) quantities.push(line);
    }
    for (const req of group.incompatible) {
      incompatibleQuantityLineCount += 1;
      const display = formatGroceryDisplay({ quantity: req.quantity, unit: req.unit });
      quantities.push({
        requiredQuantity: req.quantity,
        unit: req.unit,
        displayQuantity: display.displayQuantity,
        displayUnit: display.displayUnit,
        displayLabel: display.displayLabel,
        conversionConfidence: "none",
      });
    }

    if (quantities.length === 0) continue;

    const provenance = buildProvenance(group.allRequirements);
    const sourceMealInstanceIds = unique(
      group.allRequirements.flatMap((r) => r.sourceMealInstanceIds ?? [r.sourceMealInstanceId]),
    );
    const sourceRecipeIds = unique(
      group.allRequirements.map((r) => r.sourceRecipeId).filter((x): x is string => Boolean(x)),
    );
    const sourceRecipeNames = unique(
      group.allRequirements
        .map((r) => r.sourceRecipeName)
        .filter((x): x is string => Boolean(x)),
    );

    const primary = quantities[0]!;
    const category = categorizeGroceryItem({
      displayName: group.displayName,
      foodCategory: group.foodCategory,
      measurementState: group.measurementState,
    });

    items.push({
      id: stableGroceryItemId(group.identityKey),
      displayName: group.displayName,
      canonicalFoodId: group.canonicalFoodId,
      measurementState: group.measurementState,
      quantities,
      quantity: primary.requiredQuantity,
      unit: primary.unit,
      displayQuantityLabel: primary.displayLabel,
      category,
      status: "needed",
      checked: false,
      sourceMealInstanceIds,
      sourceRecipeIds,
      sourceRecipeNames,
      provenance,
    });
  }

  items.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    items,
    reconciliation: {
      sourceIngredientRequirementCount: purchasable.length,
      aggregatedItemCount: items.length,
      droppedRequirementCount: 0,
      duplicateRequirementCount: 0,
      excludedNonPurchasedCount,
      incompatibleQuantityLineCount,
    },
  };
}

function mergeIntoGroup(group: IdentityGroup, req: IngredientRequirement): void {
  const basis = toCompatibleBasis(req.quantity, req.unit);
  if (!basis.ok) {
    const existingIncompatible = group.incompatible.find(
      (r) => r.unit.toLowerCase() === req.unit.toLowerCase(),
    );
    if (existingIncompatible) {
      existingIncompatible.quantity += req.quantity;
      return;
    }
    group.incompatible.push({ ...req });
    return;
  }

  if (basis.family === "mass") {
    const bucket = group.buckets.find((b) => b.family === "mass");
    if (bucket) {
      bucket.value += basis.grams;
      bucket.contributions.push(req);
      return;
    }
    group.buckets.push({
      family: "mass",
      value: basis.grams,
      confidence: basis.confidence,
      contributions: [req],
    });
    return;
  }

  if (basis.family === "volume") {
    const bucket = group.buckets.find((b) => b.family === "volume");
    if (bucket) {
      bucket.value += basis.teaspoons;
      bucket.contributions.push(req);
      return;
    }
    group.buckets.push({
      family: "volume",
      value: basis.teaspoons,
      confidence: basis.confidence,
      contributions: [req],
    });
    return;
  }

  if (basis.family === "count") {
    const bucket = group.buckets.find(
      (b) => b.family === "count" && b.countUnit && sameCountUnit(b.countUnit, basis.unit),
    );
    if (bucket) {
      bucket.value += basis.count;
      bucket.contributions.push(req);
      return;
    }
    const otherCount = group.buckets.find(
      (b) => b.family === "count" && b.countUnit && !sameCountUnit(b.countUnit, basis.unit),
    );
    if (otherCount) {
      group.incompatible.push({ ...req });
      return;
    }
    group.buckets.push({
      family: "count",
      value: basis.count,
      countUnit: basis.unit,
      confidence: basis.confidence,
      contributions: [req],
    });
  }
}

function bucketToQuantityLine(bucket: QuantityBucket): GroceryQuantityLine | null {
  if (!(bucket.value > 0)) return null;
  if (bucket.family === "mass") {
    const preferred = preferredMassUnit(bucket.value);
    const display = formatGroceryDisplay({
      quantity: preferred.quantity,
      unit: preferred.unit,
      family: "mass",
    });
    return {
      requiredQuantity: preferred.quantity,
      unit: preferred.unit,
      displayQuantity: display.displayQuantity,
      displayUnit: display.displayUnit,
      displayLabel: display.displayLabel,
      conversionConfidence: bucket.confidence,
    };
  }
  if (bucket.family === "volume") {
    const preferred = preferredVolumeUnit(bucket.value);
    const display = formatGroceryDisplay({
      quantity: preferred.quantity,
      unit: preferred.unit,
      family: "volume",
    });
    return {
      requiredQuantity: preferred.quantity,
      unit: preferred.unit,
      displayQuantity: display.displayQuantity,
      displayUnit: display.displayUnit,
      displayLabel: display.displayLabel,
      conversionConfidence: bucket.confidence,
    };
  }
  const unit = bucket.countUnit ?? "piece";
  const display = formatGroceryDisplay({
    quantity: bucket.value,
    unit,
    family: "count",
  });
  return {
    requiredQuantity: bucket.value,
    unit,
    displayQuantity: display.displayQuantity,
    displayUnit: display.displayUnit,
    displayLabel: display.displayLabel,
    conversionConfidence: bucket.confidence,
  };
}

function buildProvenance(requirements: readonly IngredientRequirement[]): GroceryProvenanceEntry[] {
  const entries: GroceryProvenanceEntry[] = [];
  const seen = new Set<string>();
  for (const req of requirements) {
    const mealIds = req.sourceMealInstanceIds ?? [req.sourceMealInstanceId];
    const mealNames = req.sourceMealNames ?? (req.sourceMealName ? [req.sourceMealName] : []);
    const contributions = req.mealContributionQuantities;
    for (let i = 0; i < mealIds.length; i += 1) {
      const mealInstanceId = mealIds[i]!;
      const qty =
        contributions && contributions[i] != null && contributions[i]! > 0
          ? contributions[i]!
          : mealIds.length === 1
            ? req.quantity
            : req.quantity / mealIds.length;
      const key = `${mealInstanceId}|${req.sourceRecipeId ?? ""}|${req.unit}|${qty}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        mealInstanceId,
        mealName: mealNames[i] ?? mealNames[0] ?? req.sourceMealName,
        recipeId: req.sourceRecipeId,
        recipeName: req.sourceRecipeName,
        componentId: req.sourceComponentId,
        quantity: qty,
        unit: req.unit,
      });
    }
  }
  return entries.slice(0, 128);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/** Dev helper: summarize why a grocery item exists. */
export function formatGroceryItemDiagnostics(item: GroceryItem): string {
  const lines = [
    `GroceryItem ${item.id}`,
    `  name: ${item.displayName}`,
    `  canonicalFoodId: ${item.canonicalFoodId ?? "null"}`,
    `  measurementState: ${item.measurementState ?? "unknown"}`,
    `  category: ${item.category}`,
    `  quantities:`,
    ...item.quantities.map(
      (q) =>
        `    - required ${q.requiredQuantity} ${q.unit} (display ${q.displayLabel}, confidence=${q.conversionConfidence ?? "n/a"})`,
    ),
    `  sourceRecipes: ${item.sourceRecipeNames.join(", ") || "—"}`,
    `  sourceMeals: ${item.sourceMealInstanceIds.join(", ") || "—"}`,
    `  provenance:`,
    ...item.provenance.map(
      (p) =>
        `    - ${p.mealName ?? p.mealInstanceId} / ${p.recipeName ?? p.recipeId ?? "—"} → ${p.quantity} ${p.unit}`,
    ),
  ];
  return lines.join("\n");
}
