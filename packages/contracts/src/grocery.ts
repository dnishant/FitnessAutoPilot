import { z } from "zod";

/**
 * Grocery list contracts for the consumer Grocery tab.
 *
 * Aggregation is a future deterministic engine. UI renders GroceryList only —
 * it must not invent quantities from reference recipes.
 */

export const GroceryCategorySchema = z.enum([
  "produce",
  "meat_seafood",
  "dairy_eggs",
  "pantry",
  "spices_seasonings",
  "frozen",
  "other",
]);

export const GROCERY_CATEGORY_LABELS = {
  produce: "Produce",
  meat_seafood: "Meat & Seafood",
  dairy_eggs: "Dairy & Eggs",
  pantry: "Pantry",
  spices_seasonings: "Spices & Seasonings",
  frozen: "Frozen",
  other: "Other",
} as const satisfies Record<z.infer<typeof GroceryCategorySchema>, string>;

export const GroceryItemSchema = z.object({
  id: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(200),
  quantity: z.number().finite().positive().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  checked: z.boolean().default(false),
});

export const GrocerySectionSchema = z.object({
  category: GroceryCategorySchema,
  items: z.array(GroceryItemSchema).max(200),
});

export const GroceryListSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sections: z.array(GrocerySectionSchema).max(20),
  generatedAt: z.string().optional(),
  /** When false/undefined, UI should treat the list as unavailable. */
  available: z.boolean().optional(),
});

export type GroceryCategory = z.infer<typeof GroceryCategorySchema>;
export type GroceryItem = z.infer<typeof GroceryItemSchema>;
export type GrocerySection = z.infer<typeof GrocerySectionSchema>;
export type GroceryList = z.infer<typeof GroceryListSchema>;

export function groceryCategoryLabel(category: GroceryCategory): string {
  return GROCERY_CATEGORY_LABELS[category];
}
