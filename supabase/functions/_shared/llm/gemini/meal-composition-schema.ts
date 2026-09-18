import { z } from "zod";
import {
  AddableMealComponentRoleSchema,
  ComponentDefinitionKindSchema,
  CulinaryConfidenceSchema,
  MealComponentRoleSchema,
  MealFormSchema,
  MealNeedSchema,
} from "../../contracts/index.ts";
import { zodToGeminiJsonSchema } from "./json-schema.ts";

/**
 * Model payload for meal-composition-v3 (Culinary Meal Architect).
 * No nutrition, quantities, or instructions.
 */
export const GeminiMealCompositionPayloadSchema = z.object({
  mealName: z.string().min(1).max(160),
  mealUnderstanding: z.object({
    mealForm: MealFormSchema,
    isStandaloneMeal: z.boolean(),
    dishSummary: z.string().min(1).max(600),
    howItIsEaten: z.string().min(1).max(600),
    existingComponents: z
      .array(
        z.object({
          name: z.string().min(1).max(160),
          role: MealComponentRoleSchema.optional(),
          relationship: z.enum(["intrinsic", "required_companion", "recommended"]).optional(),
          integration: z
            .enum(["integrated_in_dish", "separately_eaten", "unclear"])
            .optional()
            .default("unclear"),
          purpose: z.string().min(1).max(400).optional(),
        }),
      )
      .max(24),
    satisfiedNeeds: z.array(MealNeedSchema).max(12),
    missingNeeds: z.array(MealNeedSchema).max(12),
    additionsRecommended: z.boolean(),
    confidence: CulinaryConfidenceSchema,
  }),
  alreadySatisfiedRoles: z.array(MealComponentRoleSchema).max(12).optional().default([]),
  missingRoles: z.array(MealComponentRoleSchema).max(12).optional().default([]),
  addedComponents: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        role: AddableMealComponentRoleSchema,
        relationship: z.enum(["required_companion", "recommended"]),
        reason: z.string().min(1).max(400),
        culinaryReason: z.string().min(1).max(400).optional(),
        satisfiesMissingNeed: MealNeedSchema.optional(),
        definitionKind: ComponentDefinitionKindSchema,
        preparation: z.string().min(1).max(200).nullable().optional(),
        measurementState: z
          .enum(["raw", "cooked", "as_purchased", "prepared", "unknown"])
          .optional(),
      }),
    )
    .max(8),
  compositionSummary: z.string().min(1).max(600),
  noAdditionsNeeded: z.boolean().optional(),
});

export type GeminiMealCompositionPayload = z.infer<typeof GeminiMealCompositionPayloadSchema>;

export function geminiMealCompositionResponseJsonSchema(): Record<string, unknown> {
  return zodToGeminiJsonSchema(GeminiMealCompositionPayloadSchema);
}

export function coerceMealCompositionPayload(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };

  const coerceRole = (role: unknown): string => {
    if (typeof role !== "string") return "garnish";
    const n = role.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const aliases: Record<string, string> = {
      main: "main",
      protein: "main",
      carbohydrate: "carbohydrate",
      carb: "carbohydrate",
      carb_side: "carbohydrate",
      starch: "carbohydrate",
      vegetable: "vegetable",
      veg: "vegetable",
      vegetable_side: "vegetable",
      fruit: "fruit",
      legume: "legume",
      beans: "legume",
      sauce: "sauce_condiment",
      condiment: "sauce_condiment",
      sauce_condiment: "sauce_condiment",
      fat: "fat",
      garnish: "garnish",
    };
    return aliases[n] ?? "garnish";
  };

  const coerceNeed = (need: unknown): string => {
    if (typeof need !== "string") return "completeness_other";
    const n = need.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const aliases: Record<string, string> = {
      protein: "protein_structure",
      protein_structure: "protein_structure",
      carbohydrate: "carbohydrate_accompaniment",
      carb: "carbohydrate_accompaniment",
      carbohydrate_accompaniment: "carbohydrate_accompaniment",
      vegetable: "fresh_vegetable_accompaniment",
      veg: "fresh_vegetable_accompaniment",
      fresh_vegetable_accompaniment: "fresh_vegetable_accompaniment",
      sauce: "moisture_sauce",
      moisture: "moisture_sauce",
      moisture_sauce: "moisture_sauce",
      texture: "textural_contrast",
      textural_contrast: "textural_contrast",
      other: "completeness_other",
      completeness_other: "completeness_other",
    };
    return aliases[n] ?? "completeness_other";
  };

  const coerceMealForm = (form: unknown): string => {
    if (typeof form !== "string") return "other";
    const n = form.trim().toLowerCase().replace(/[\s-]+/g, "_");
    const aliases: Record<string, string> = {
      complete_composite: "complete_composite",
      complete: "complete_composite",
      composite: "complete_composite",
      standalone: "complete_composite",
      main_only: "main_only",
      main: "main_only",
      main_with_existing_companions: "main_with_existing_companions",
      multi_component: "multi_component",
      assembly: "assembly",
      other: "other",
    };
    return aliases[n] ?? "other";
  };

  if (record.mealUnderstanding && typeof record.mealUnderstanding === "object") {
    const u = { ...(record.mealUnderstanding as Record<string, unknown>) };
    u.mealForm = coerceMealForm(u.mealForm);
    if (Array.isArray(u.satisfiedNeeds)) u.satisfiedNeeds = u.satisfiedNeeds.map(coerceNeed);
    if (Array.isArray(u.missingNeeds)) u.missingNeeds = u.missingNeeds.map(coerceNeed);
    if (typeof u.confidence === "string") {
      const c = u.confidence.trim().toLowerCase();
      u.confidence = c === "high" || c === "medium" || c === "low" ? c : "medium";
    }
    if (Array.isArray(u.existingComponents)) {
      u.existingComponents = u.existingComponents.map((raw) => {
        if (raw === null || typeof raw !== "object") return raw;
        const c = { ...(raw as Record<string, unknown>) };
        if (c.role != null) c.role = coerceRole(c.role);
        return c;
      });
    }
    record.mealUnderstanding = u;
  } else {
    // Legacy v2 payloads without understanding — synthesize a conservative shell.
    record.mealUnderstanding = {
      mealForm: "other",
      isStandaloneMeal: Boolean(record.noAdditionsNeeded),
      dishSummary: typeof record.compositionSummary === "string" ? record.compositionSummary : "Meal",
      howItIsEaten: "As plated.",
      existingComponents: [],
      satisfiedNeeds: [],
      missingNeeds: [],
      additionsRecommended: Array.isArray(record.addedComponents)
        ? (record.addedComponents as unknown[]).length > 0
        : true,
      confidence: "medium",
    };
  }

  if (Array.isArray(record.alreadySatisfiedRoles)) {
    record.alreadySatisfiedRoles = record.alreadySatisfiedRoles.map(coerceRole);
  }
  if (Array.isArray(record.missingRoles)) {
    record.missingRoles = record.missingRoles.map(coerceRole);
  }
  if (Array.isArray(record.addedComponents)) {
    record.addedComponents = record.addedComponents.map((raw) => {
      if (raw === null || typeof raw !== "object") return raw;
      const c = { ...(raw as Record<string, unknown>) };
      c.role = coerceRole(c.role);
      if (typeof c.relationship === "string") {
        const rel = c.relationship.trim().toLowerCase().replace(/[\s-]+/g, "_");
        if (rel === "intrinsic") c.relationship = "required_companion";
        else if (rel === "recommended_side" || rel === "optional") c.relationship = "recommended";
        else if (rel === "required" || rel === "required_companion") {
          c.relationship = "required_companion";
        }
      }
      if (typeof c.definitionKind === "string") {
        const kind = c.definitionKind.trim().toLowerCase().replace(/[\s-]+/g, "_");
        if (kind === "atomic" || kind === "food" || kind === "canonical_food") {
          c.definitionKind = "atomic_food";
        } else if (kind === "recipe" || kind === "compound" || kind === "component_recipe") {
          c.definitionKind = "recipe_component";
        }
      }
      if (c.satisfiesMissingNeed != null) {
        c.satisfiesMissingNeed = coerceNeed(c.satisfiesMissingNeed);
      }
      if (typeof c.culinaryReason !== "string" && typeof c.reason === "string") {
        c.culinaryReason = c.reason;
      }
      for (const banned of [
        "calories",
        "caloriesKcal",
        "proteinGrams",
        "carbohydrateGrams",
        "fatGrams",
        "fiberGrams",
        "grams",
        "servingGrams",
        "macros",
        "nutrition",
        "recipeIngredients",
        "instructions",
        "ingredients",
        "quantity",
        "unit",
      ]) {
        delete c[banned];
      }
      return c;
    });
  }

  return record;
}
