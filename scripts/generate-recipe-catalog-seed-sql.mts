#!/usr/bin/env node
/**
 * Generate RECIPE-001 seed SQL (ingredients delta + recipe catalog upserts).
 * Writes supabase/seed_recipe_001.sql
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSeedCatalogSnapshot } from "../packages/domain/src/ingredient-catalog/seed.ts";
import {
  createSeedRecipeCatalogSnapshot,
  flattenRecipeCatalogSnapshot,
} from "../packages/domain/src/recipe-catalog/seed.ts";

function sqlLiteral(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlTextArray(values: readonly string[]): string {
  if (values.length === 0) return "'{}'::text[]";
  return `ARRAY[${values.map((v) => sqlLiteral(v)).join(", ")}]::text[]`;
}

const catalog = createSeedCatalogSnapshot();
const recipeFlat = flattenRecipeCatalogSnapshot(createSeedRecipeCatalogSnapshot());

/** Non-protein / supporting ingredients introduced for RECIPE-001 (keys after lentils_cooked). */
const RECIPE_SUPPORT_KEYS = new Set([
  "avocado",
  "whole_grain_bread",
  "olive_oil",
  "kosher_salt",
  "black_pepper",
  "long_grain_white_rice",
  "yellow_onion",
  "garlic",
  "fresh_ginger",
  "roma_tomato",
  "ground_cumin",
  "ground_coriander",
  "ground_turmeric",
  "garam_masala",
  "frozen_green_peas",
  "plain_greek_yogurt",
  "fresh_cilantro",
  "lemon_juice",
  "mixed_berries",
  "walnut_halves",
  "water",
]);

const lines: string[] = [];
lines.push("-- RECIPE-001 supporting canonical ingredients + versioned recipe catalog seed");
lines.push("-- Idempotent upserts. Nutrition lineage intentionally unmapped.");
lines.push("");

for (const row of catalog.ingredients.filter((i) => RECIPE_SUPPORT_KEYS.has(i.canonicalKey))) {
  lines.push(`insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.canonicalKey)},
  ${sqlLiteral(row.displayName)},
  ${sqlLiteral(row.category)},
  ${sqlLiteral(row.defaultUnit)},
  ${sqlLiteral(row.availabilityClass)},
  ${sqlLiteral(row.nutritionSourceType)},
  ${sqlLiteral(row.nutritionSourceId)},
  ${sqlLiteral(row.createdAt)},
  ${sqlLiteral(row.updatedAt)}
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;`);
  lines.push("");
}

for (const row of catalog.aliases) {
  const ingredient = catalog.ingredients.find((i) => i.id === row.ingredientId);
  if (!ingredient || !RECIPE_SUPPORT_KEYS.has(ingredient.canonicalKey)) {
    // also allow ground_chicken / greek yogurt aliases added in RECIPE-001
    if (
      row.id !== "c3000000-0000-4000-a000-000000000008" &&
      row.id !== "c3000000-0000-4000-a000-000000000009" &&
      row.id !== "c3000000-0000-4000-a000-000000000010"
    ) {
      continue;
    }
  }
  lines.push(`insert into public.ingredient_aliases (
  id, ingredient_id, normalized_alias, display_alias
) values (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.ingredientId)},
  ${sqlLiteral(row.normalizedAlias)},
  ${sqlLiteral(row.displayAlias)}
)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  display_alias = excluded.display_alias;`);
  lines.push("");
}

for (const row of recipeFlat.recipes) {
  lines.push(`insert into public.catalog_recipes (
  id, canonical_key, section, current_published_version_id, created_at, updated_at
) values (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.canonicalKey)},
  ${sqlLiteral(row.section)},
  null,
  ${sqlLiteral(row.createdAt)},
  ${sqlLiteral(row.updatedAt)}
)
on conflict (canonical_key) do update set
  section = excluded.section,
  updated_at = excluded.updated_at;`);
  lines.push("");
}

for (const row of recipeFlat.versions) {
  lines.push(`insert into public.catalog_recipe_versions (
  id, recipe_id, version, status, kitchen_test_status, title, description,
  reference_servings, active_minutes, passive_minutes,
  lunch_suitability, dinner_suitability, created_at, published_at, retired_at
) values (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.recipeId)},
  ${row.version},
  ${sqlLiteral(row.status)},
  ${sqlLiteral(row.kitchenTestStatus)},
  ${sqlLiteral(row.title)},
  ${sqlLiteral(row.description)},
  ${row.referenceServings},
  ${row.activeMinutes},
  ${row.passiveMinutes},
  ${sqlLiteral(row.lunchSuitability)},
  ${sqlLiteral(row.dinnerSuitability)},
  ${sqlLiteral(row.createdAt)},
  ${sqlLiteral(row.publishedAt)},
  ${sqlLiteral(row.retiredAt)}
)
on conflict (id) do update set
  status = excluded.status,
  kitchen_test_status = excluded.kitchen_test_status,
  title = excluded.title,
  description = excluded.description,
  reference_servings = excluded.reference_servings,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  lunch_suitability = excluded.lunch_suitability,
  dinner_suitability = excluded.dinner_suitability,
  published_at = excluded.published_at,
  retired_at = excluded.retired_at;`);
  lines.push("");
}

for (const row of recipeFlat.components) {
  lines.push(`insert into public.catalog_recipe_components (
  id, recipe_version_id, name, kind, display_order, adjustable
) values (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.recipeVersionId)},
  ${sqlLiteral(row.name)},
  ${sqlLiteral(row.kind)},
  ${row.displayOrder},
  ${sqlLiteral(row.adjustable)}
)
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  display_order = excluded.display_order,
  adjustable = excluded.adjustable;`);
  lines.push("");
}

for (const row of recipeFlat.ingredients) {
  lines.push(`insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.recipeVersionId)},
  ${sqlLiteral(row.componentId)},
  ${sqlLiteral(row.canonicalIngredientId)},
  ${sqlLiteral(row.proteinProductId)},
  ${row.quantity},
  ${sqlLiteral(row.unit)},
  ${sqlLiteral(row.preparation)},
  ${sqlLiteral(row.optional)},
  ${row.displayOrder}
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;`);
  lines.push("");
}

for (const row of recipeFlat.steps) {
  lines.push(`insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.recipeVersionId)},
  ${sqlLiteral(row.componentId)},
  ${row.order},
  ${sqlLiteral(row.title)},
  ${sqlLiteral(row.instruction)},
  ${sqlLiteral(row.activeMinutes ?? null)},
  ${sqlLiteral(row.passiveMinutes ?? null)},
  ${sqlTextArray(row.equipment)}
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;`);
  lines.push("");
}

for (const row of recipeFlat.usages) {
  lines.push(`insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.recipeStepId)},
  ${sqlLiteral(row.recipeIngredientId)},
  ${row.quantity},
  ${sqlLiteral(row.unit)},
  ${sqlLiteral(row.action)}
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;`);
  lines.push("");
}

for (const row of recipeFlat.classifications) {
  lines.push(`insert into public.catalog_recipe_classifications (
  recipe_version_id, cuisines, flavor_profiles, experience_preferences,
  cooking_methods, allergens, dietary_attributes, required_equipment
) values (
  ${sqlLiteral(row.recipeVersionId)},
  ${sqlTextArray(row.cuisines)},
  ${sqlTextArray(row.flavorProfiles)},
  ${sqlTextArray(row.experiencePreferences)},
  ${sqlTextArray(row.cookingMethods)},
  ${sqlTextArray(row.allergens)},
  ${sqlTextArray(row.dietaryAttributes)},
  ${sqlTextArray(row.requiredEquipment)}
)
on conflict (recipe_version_id) do update set
  cuisines = excluded.cuisines,
  flavor_profiles = excluded.flavor_profiles,
  experience_preferences = excluded.experience_preferences,
  cooking_methods = excluded.cooking_methods,
  allergens = excluded.allergens,
  dietary_attributes = excluded.dietary_attributes,
  required_equipment = excluded.required_equipment;`);
  lines.push("");
}

for (const row of recipeFlat.scalingProfiles) {
  lines.push(`insert into public.catalog_recipe_scaling_profiles (
  recipe_version_id, method, minimum_servings, maximum_servings, serving_increment, notes
) values (
  ${sqlLiteral(row.recipeVersionId)},
  ${sqlLiteral(row.method)},
  ${row.minimumServings},
  ${row.maximumServings},
  ${row.servingIncrement},
  ${sqlLiteral(row.notes)}
)
on conflict (recipe_version_id) do update set
  method = excluded.method,
  minimum_servings = excluded.minimum_servings,
  maximum_servings = excluded.maximum_servings,
  serving_increment = excluded.serving_increment,
  notes = excluded.notes;`);
  lines.push("");
}

for (const row of recipeFlat.storageProfiles) {
  lines.push(`insert into public.catalog_recipe_storage_profiles (
  recipe_version_id, prep_style, refrigeration_supported, freezing_supported,
  store_components_separately, guidance_source, notes
) values (
  ${sqlLiteral(row.recipeVersionId)},
  ${sqlLiteral(row.prepStyle)},
  ${sqlLiteral(row.refrigerationSupported)},
  ${sqlLiteral(row.freezingSupported)},
  ${sqlLiteral(row.storeComponentsSeparately)},
  ${sqlLiteral(row.guidanceSource)},
  ${sqlLiteral(row.notes)}
)
on conflict (recipe_version_id) do update set
  prep_style = excluded.prep_style,
  refrigeration_supported = excluded.refrigeration_supported,
  freezing_supported = excluded.freezing_supported,
  store_components_separately = excluded.store_components_separately,
  guidance_source = excluded.guidance_source,
  notes = excluded.notes;`);
  lines.push("");
}

for (const row of recipeFlat.provenances) {
  lines.push(`insert into public.catalog_recipe_provenance (
  recipe_version_id, provenance_type, source_url, source_creator,
  reviewed_by, reviewed_at, kitchen_tested_at
) values (
  ${sqlLiteral(row.recipeVersionId)},
  ${sqlLiteral(row.type)},
  ${sqlLiteral(row.sourceUrl)},
  ${sqlLiteral(row.sourceCreator)},
  ${sqlLiteral(row.reviewedBy)},
  ${sqlLiteral(row.reviewedAt)},
  ${sqlLiteral(row.kitchenTestedAt)}
)
on conflict (recipe_version_id) do update set
  provenance_type = excluded.provenance_type,
  source_url = excluded.source_url,
  source_creator = excluded.source_creator,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at,
  kitchen_tested_at = excluded.kitchen_tested_at;`);
  lines.push("");
}

for (const row of recipeFlat.recipes) {
  if (!row.currentPublishedVersionId) continue;
  lines.push(`update public.catalog_recipes
set current_published_version_id = ${sqlLiteral(row.currentPublishedVersionId)},
    updated_at = ${sqlLiteral(row.updatedAt)}
where id = ${sqlLiteral(row.id)};`);
  lines.push("");
}

const out = resolve("supabase/seed_recipe_001.sql");
writeFileSync(out, lines.join("\n") + "\n", "utf8");
console.log(`Wrote ${out} (${lines.length} lines)`);
