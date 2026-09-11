import { z } from "zod";
import { NutritionMacrosSchema } from "./nutrition.ts";
import { MealTypeSchema } from "./recipe.ts";

export const PortionedIngredientSchema = z.object({
  recipeIngredientId: z.string().uuid(),
  foodId: z.string().uuid(),
  foodName: z.string(),
  role: z.string(),
  quantityG: z.number().positive(),
  nutrition: NutritionMacrosSchema,
});

export const MealInstanceSchema = z.object({
  id: z.string().uuid(),
  dailyPlanId: z.string().uuid(),
  recipeId: z.string().uuid(),
  recipeKey: z.string(),
  recipeName: z.string(),
  mealType: MealTypeSchema,
  portionMultiplier: z.number().positive(),
  plannedCalories: z.number().finite().nonnegative(),
  plannedProteinG: z.number().finite().nonnegative(),
  plannedCarbsG: z.number().finite().nonnegative(),
  plannedFatG: z.number().finite().nonnegative(),
  ingredientSnapshot: z.array(PortionedIngredientSchema),
  createdAt: z.string(),
});

export const DailyPlanSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  nutritionTargetId: z.string().uuid(),
  planDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedCalories: z.number().finite().nonnegative(),
  plannedProteinG: z.number().finite().nonnegative(),
  meals: z.array(MealInstanceSchema),
  createdAt: z.string(),
});

export type PortionedIngredient = z.infer<typeof PortionedIngredientSchema>;
export type MealInstance = z.infer<typeof MealInstanceSchema>;
export type DailyPlan = z.infer<typeof DailyPlanSchema>;
