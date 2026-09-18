/**
 * PLAN-009 domain: food resolution, quantity normalization, deterministic nutrition.
 *
 * INACTIVE for the current meal-planning architecture (ADR-024).
 * Weekly planning uses ResolvedRecipe.nutrition (llm_estimate).
 * Keep this module for optional future USDA verification — do not restore it as a planning blocker.
 */

export * from "./nutrient-mapper.ts";
export * from "./ingredient-key.ts";
export * from "./candidate-scoring.ts";
export * from "./quantity-normalizer.ts";
export * from "./nutrition-arithmetic.ts";
export * from "./builtin-foods.ts";
export * from "./caches.ts";
export * from "./food-data-provider.ts";
export * from "./food-resolver.ts";
export * from "./recipe-nutrition.ts";
export * from "./fixtures.ts";
