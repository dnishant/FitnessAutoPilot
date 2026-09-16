import { z } from "zod";
import {
  AddableMealComponentRoleSchema,
  ComponentDefinitionKindSchema,
  MealComponentRoleSchema,
  MealCompositionAddedComponentProposalSchema,
} from "@fitness-autopilot/contracts";
import { zodToGeminiJsonSchema } from "./json-schema";

/**
 * Model payload for PLAN-009.5. No nutrition fields. No personalized quantities.
 */
export const GeminiMealCompositionPayloadSchema = z.object({
  mealName: z.string().min(1).max(160),
  alreadySatisfiedRoles: z.array(MealComponentRoleSchema).max(12),
  missingRoles: z.array(MealComponentRoleSchema).max(12),
  addedComponents: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        role: AddableMealComponentRoleSchema,
        relationship: z.enum(["required_companion", "recommended"]),
        reason: z.string().min(1).max(400),
        definitionKind: ComponentDefinitionKindSchema,
        preparation: z.string().min(1).max(200).nullable().optional(),
        measurementState: z
          .enum(["raw", "cooked", "as_purchased", "prepared", "unknown"])
          .optional(),
        recipeIngredients: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              quantity: z.number().positive().optional(),
              unit: z.string().min(1).max(40).optional(),
              role: z.string().min(1).max(40).optional(),
              preparation: z.string().min(1).max(200).nullable().optional(),
            }),
          )
          .min(1)
          .max(20)
          .optional(),
        instructions: z.array(z.string().min(1).max(400)).max(12).optional(),
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
      // Strip any nutrition / quantity keys the model may invent.
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
      ]) {
        delete c[banned];
      }
      return c;
    });
  }

  return record;
}

// Keep schema import used for type alignment in tests.
void MealCompositionAddedComponentProposalSchema;
