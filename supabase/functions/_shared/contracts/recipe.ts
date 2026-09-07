import { z } from "zod";

export const MealTypeSchema = z.enum(["breakfast", "lunch", "snack", "dinner"]);

export const IngredientRoleSchema = z.enum([
  "protein",
  "carbohydrate",
  "fat",
  "vegetable",
  "sauce",
  "seasoning",
  "other",
]);

export const FoodSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  brand: z.string().nullable(),
  source: z.string().min(1),
  sourceFoodId: z.string().nullable(),
  caloriesPer100g: z.number().finite().nonnegative(),
  proteinGPer100g: z.number().finite().nonnegative(),
  carbsGPer100g: z.number().finite().nonnegative(),
  fatGPer100g: z.number().finite().nonnegative(),
  dietaryTags: z.array(z.string()).default([]),
  allergenTags: z.array(z.string()).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const RecipeIngredientSchema = z.object({
  id: z.string().uuid(),
  recipeId: z.string().uuid(),
  foodId: z.string().uuid(),
  baseQuantityG: z.number().positive(),
  role: IngredientRoleSchema,
  scalable: z.boolean(),
  minMultiplier: z.number().positive().optional(),
  maxMultiplier: z.number().positive().optional(),
  preparationNote: z.string().optional(),
  sortOrder: z.number().int().nonnegative(),
});

export const RecipeSchema = z.object({
  id: z.string().uuid(),
  recipeKey: z.string().min(1),
  version: z.number().int().positive(),
  name: z.string().min(1),
  description: z.string(),
  mealTypes: z.array(MealTypeSchema).min(1),
  cuisineTags: z.array(z.string()).default([]),
  dietaryTags: z.array(z.string()).default([]),
  baseServings: z.number().positive(),
  prepMinutes: z.number().int().nonnegative(),
  cookMinutes: z.number().int().nonnegative(),
  instructions: z.array(z.string()).min(1),
  cookingEquipment: z.array(z.string()).default([]),
  storageInstructions: z.string().optional(),
  reheatingInstructions: z.string().optional(),
  status: z.enum(["active", "deprecated"]),
  createdAt: z.string().optional(),
});

export type MealType = z.infer<typeof MealTypeSchema>;
export type IngredientRole = z.infer<typeof IngredientRoleSchema>;
export type Food = z.infer<typeof FoodSchema>;
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;
export type Recipe = z.infer<typeof RecipeSchema>;
