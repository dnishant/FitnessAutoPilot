import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSeedCatalogSnapshot } from "../packages/domain/src/ingredient-catalog/seed.ts";

function sqlLiteral(value: string | null | undefined): string {
  if (value === null || value === undefined) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlBool(value: boolean): string {
  return value ? "true" : "false";
}

const snapshot = createSeedCatalogSnapshot();
const lines: string[] = [];
lines.push("-- CATALOG-001 curated seed (idempotent upserts)");
lines.push("-- Nutrition source IDs intentionally unmapped unless verified.");
lines.push("");

for (const row of snapshot.ingredients) {
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

for (const row of snapshot.proteinProducts) {
  lines.push(`insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.canonicalKey)},
  ${sqlLiteral(row.ingredientId)},
  ${sqlLiteral(row.proteinFamily)},
  ${sqlLiteral(row.displayName)},
  ${sqlLiteral(row.species)},
  ${sqlLiteral(row.cut)},
  ${sqlLiteral(row.form)},
  ${sqlLiteral(row.boneState)},
  ${sqlLiteral(row.skinState)},
  ${sqlLiteral(row.fatDescriptor)},
  ${sqlLiteral(row.typicalPurchaseUnit)},
  ${sqlLiteral(row.availabilityClass)},
  ${sqlBool(row.active)},
  ${sqlLiteral(row.createdAt)},
  ${sqlLiteral(row.updatedAt)}
)
on conflict (canonical_key) do update set
  ingredient_id = excluded.ingredient_id,
  protein_family = excluded.protein_family,
  display_name = excluded.display_name,
  species = excluded.species,
  cut = excluded.cut,
  form = excluded.form,
  bone_state = excluded.bone_state,
  skin_state = excluded.skin_state,
  fat_descriptor = excluded.fat_descriptor,
  typical_purchase_unit = excluded.typical_purchase_unit,
  availability_class = excluded.availability_class,
  active = excluded.active,
  updated_at = excluded.updated_at;`);
  lines.push("");
}

for (const row of snapshot.aliases) {
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

for (const row of snapshot.retailerEvidence) {
  lines.push(`insert into public.retailer_availability_evidence (
  id, ingredient_id, protein_product_id, retailer, confidence, region, product_form,
  source_url, verified_at, notes
) values (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.ingredientId)},
  ${sqlLiteral(row.proteinProductId)},
  ${sqlLiteral(row.retailer)},
  ${sqlLiteral(row.confidence)},
  ${sqlLiteral(row.region)},
  ${sqlLiteral(row.productForm)},
  ${sqlLiteral(row.sourceUrl)},
  ${sqlLiteral(row.verifiedAt)},
  ${sqlLiteral(row.notes)}
)
on conflict (id) do update set
  ingredient_id = excluded.ingredient_id,
  protein_product_id = excluded.protein_product_id,
  retailer = excluded.retailer,
  confidence = excluded.confidence,
  region = excluded.region,
  product_form = excluded.product_form,
  source_url = excluded.source_url,
  verified_at = excluded.verified_at,
  notes = excluded.notes,
  updated_at = timezone('utc', now());`);
  lines.push("");
}

for (const row of snapshot.substitutions) {
  lines.push(`insert into public.ingredient_substitutions (
  id, source_ingredient_id, substitute_ingredient_id, compatibility, notes, approved
) values (
  ${sqlLiteral(row.id)},
  ${sqlLiteral(row.sourceIngredientId)},
  ${sqlLiteral(row.substituteIngredientId)},
  ${sqlLiteral(row.compatibility)},
  ${sqlLiteral(row.notes)},
  ${sqlBool(row.approved)}
)
on conflict (id) do update set
  source_ingredient_id = excluded.source_ingredient_id,
  substitute_ingredient_id = excluded.substitute_ingredient_id,
  compatibility = excluded.compatibility,
  notes = excluded.notes,
  approved = excluded.approved,
  updated_at = timezone('utc', now());`);
  lines.push("");
}

const body = lines.join("\n");
const out = resolve("supabase/seed_catalog_001.sql");
writeFileSync(out, body);
console.log(`Wrote ${out} (${snapshot.proteinProducts.length} protein products)`);

// Keep supabase/seed.sql catalog section synchronized with the generated artifact.
const seedSqlPath = resolve("supabase/seed.sql");
const seedSql = readFileSync(seedSqlPath, "utf8");
const marker = "-- CATALOG-001 protein foundation seed";
const markerIdx = seedSql.indexOf(marker);
if (markerIdx >= 0) {
  const next = `${seedSql.slice(0, markerIdx)}${marker}\n${body}\n`;
  writeFileSync(seedSqlPath, next);
  console.log(`Updated catalog section in ${seedSqlPath}`);
} else {
  console.warn(`Marker "${marker}" not found in seed.sql — skipped sync`);
}
