/**
 * PLAN-009 domain: food resolution, quantity normalization, deterministic nutrition.
 *
 * INACTIVE for the current meal-planning architecture (ADR-024).
 * Weekly planning uses ResolvedRecipe.nutrition (llm_estimate).
 * Keep this module for optional future USDA verification — do not restore it as a planning blocker.
 */

export * from "./nutrient-mapper";
export * from "./ingredient-key";
export * from "./candidate-scoring";
export * from "./quantity-normalizer";
export * from "./nutrition-arithmetic";
export * from "./builtin-foods";
export * from "./caches";
export * from "./food-data-provider";
export * from "./food-resolver";
export * from "./recipe-nutrition";
export * from "./fixtures";
