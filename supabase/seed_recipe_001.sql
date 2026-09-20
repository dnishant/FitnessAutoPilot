-- RECIPE-001 supporting canonical ingredients + versioned recipe catalog seed
-- Idempotent upserts. Nutrition lineage intentionally unmapped.

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000027',
  'avocado',
  'Avocado',
  'produce',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000028',
  'whole_grain_bread',
  'Whole-grain bread',
  'grain',
  'count',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000029',
  'olive_oil',
  'Olive oil',
  'oil',
  'ml',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000030',
  'kosher_salt',
  'Kosher salt',
  'spice',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000031',
  'black_pepper',
  'Black pepper',
  'spice',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000032',
  'long_grain_white_rice',
  'Long-grain white rice',
  'grain',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000033',
  'yellow_onion',
  'Yellow onion',
  'produce',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000034',
  'garlic',
  'Garlic',
  'produce',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000035',
  'fresh_ginger',
  'Fresh ginger',
  'produce',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000036',
  'roma_tomato',
  'Roma tomato',
  'produce',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000037',
  'ground_cumin',
  'Ground cumin',
  'spice',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000038',
  'ground_coriander',
  'Ground coriander',
  'spice',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000039',
  'ground_turmeric',
  'Ground turmeric',
  'spice',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000040',
  'garam_masala',
  'Garam masala',
  'spice',
  'g',
  'commonly_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000041',
  'frozen_green_peas',
  'Frozen green peas',
  'produce',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000042',
  'plain_greek_yogurt',
  'Plain Greek yogurt',
  'dairy',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000043',
  'fresh_cilantro',
  'Fresh cilantro',
  'produce',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000044',
  'lemon_juice',
  'Lemon juice',
  'condiment',
  'ml',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000045',
  'mixed_berries',
  'Mixed berries',
  'produce',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000046',
  'walnut_halves',
  'Walnut halves',
  'other',
  'g',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000047',
  'water',
  'Water',
  'other',
  'ml',
  'widely_available',
  null,
  null,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  display_name = excluded.display_name,
  category = excluded.category,
  default_unit = excluded.default_unit,
  availability_class = excluded.availability_class,
  nutrition_source_type = excluded.nutrition_source_type,
  nutrition_source_id = excluded.nutrition_source_id,
  updated_at = excluded.updated_at;

insert into public.ingredient_aliases (
  id, ingredient_id, normalized_alias, display_alias
) values (
  'c3000000-0000-4000-a000-000000000008',
  'c1000000-0000-4000-a000-000000000027',
  'avocado',
  'avocado'
)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  display_alias = excluded.display_alias;

insert into public.ingredient_aliases (
  id, ingredient_id, normalized_alias, display_alias
) values (
  'c3000000-0000-4000-a000-000000000009',
  'c1000000-0000-4000-a000-000000000042',
  'greek yogurt',
  'greek yogurt'
)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  display_alias = excluded.display_alias;

insert into public.ingredient_aliases (
  id, ingredient_id, normalized_alias, display_alias
) values (
  'c3000000-0000-4000-a000-000000000010',
  'c1000000-0000-4000-a000-000000000005',
  'ground chicken',
  'ground chicken'
)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  display_alias = excluded.display_alias;

insert into public.catalog_recipes (
  id, canonical_key, section, current_published_version_id, created_at, updated_at
) values (
  'a1000000-0000-4000-a000-000000000001',
  'egg_avocado_whole_grain_toast',
  'breakfast',
  null,
  '2026-09-20T00:00:00.000Z',
  '2026-09-20T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  section = excluded.section,
  updated_at = excluded.updated_at;

insert into public.catalog_recipes (
  id, canonical_key, section, current_published_version_id, created_at, updated_at
) values (
  'a1000000-0000-4000-a000-000000000002',
  'ground_chicken_kheema_bowl',
  'meal',
  null,
  '2026-09-20T00:00:00.000Z',
  '2026-09-20T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  section = excluded.section,
  updated_at = excluded.updated_at;

insert into public.catalog_recipes (
  id, canonical_key, section, current_published_version_id, created_at, updated_at
) values (
  'a1000000-0000-4000-a000-000000000003',
  'greek_yogurt_berries_walnuts',
  'snack',
  null,
  '2026-09-20T00:00:00.000Z',
  '2026-09-20T00:00:00.000Z'
)
on conflict (canonical_key) do update set
  section = excluded.section,
  updated_at = excluded.updated_at;

insert into public.catalog_recipe_versions (
  id, recipe_id, version, status, kitchen_test_status, title, description,
  reference_servings, active_minutes, passive_minutes,
  lunch_suitability, dinner_suitability, created_at, published_at, retired_at
) values (
  'a2000000-0000-4000-a000-000000000001',
  'a1000000-0000-4000-a000-000000000001',
  1,
  'published',
  'not_tested',
  'Egg, Avocado and Whole-Grain Toast',
  'Simple breakfast assembly with exact large-egg protein product, avocado, and whole-grain toast.',
  1,
  10,
  0,
  null,
  null,
  '2026-09-20T00:00:00.000Z',
  '2026-09-20T12:00:00.000Z',
  null
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
  retired_at = excluded.retired_at;

insert into public.catalog_recipe_versions (
  id, recipe_id, version, status, kitchen_test_status, title, description,
  reference_servings, active_minutes, passive_minutes,
  lunch_suitability, dinner_suitability, created_at, published_at, retired_at
) values (
  'a2000000-0000-4000-a000-000000000002',
  'a1000000-0000-4000-a000-000000000002',
  1,
  'published',
  'not_tested',
  'Ground Chicken Kheema Bowl',
  'Spiced ground-chicken bowl with rice, peas, and a yogurt sauce. Culinary reference formulation — not a claim of regional authenticity.',
  4,
  41,
  20,
  'preferred',
  'preferred',
  '2026-09-20T00:00:00.000Z',
  '2026-09-20T12:00:00.000Z',
  null
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
  retired_at = excluded.retired_at;

insert into public.catalog_recipe_versions (
  id, recipe_id, version, status, kitchen_test_status, title, description,
  reference_servings, active_minutes, passive_minutes,
  lunch_suitability, dinner_suitability, created_at, published_at, retired_at
) values (
  'a2000000-0000-4000-a000-000000000003',
  'a1000000-0000-4000-a000-000000000003',
  1,
  'published',
  'not_tested',
  'Greek Yogurt, Berries and Walnuts',
  'Quick no-cook snack with portionable dairy, fruit, and tree nuts.',
  1,
  3,
  0,
  null,
  null,
  '2026-09-20T00:00:00.000Z',
  '2026-09-20T12:00:00.000Z',
  null
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
  retired_at = excluded.retired_at;

insert into public.catalog_recipe_components (
  id, recipe_version_id, name, kind, display_order, adjustable
) values (
  'a3000000-0000-4000-a000-000000000001',
  'a2000000-0000-4000-a000-000000000001',
  'Toast assembly',
  'main',
  0,
  false
)
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  display_order = excluded.display_order,
  adjustable = excluded.adjustable;

insert into public.catalog_recipe_components (
  id, recipe_version_id, name, kind, display_order, adjustable
) values (
  'a3000000-0000-4000-a000-000000000002',
  'a2000000-0000-4000-a000-000000000002',
  'Ground Chicken Kheema',
  'main',
  0,
  true
)
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  display_order = excluded.display_order,
  adjustable = excluded.adjustable;

insert into public.catalog_recipe_components (
  id, recipe_version_id, name, kind, display_order, adjustable
) values (
  'a3000000-0000-4000-a000-000000000003',
  'a2000000-0000-4000-a000-000000000002',
  'Rice',
  'carbohydrate',
  1,
  true
)
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  display_order = excluded.display_order,
  adjustable = excluded.adjustable;

insert into public.catalog_recipe_components (
  id, recipe_version_id, name, kind, display_order, adjustable
) values (
  'a3000000-0000-4000-a000-000000000004',
  'a2000000-0000-4000-a000-000000000002',
  'Vegetables',
  'vegetable',
  2,
  true
)
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  display_order = excluded.display_order,
  adjustable = excluded.adjustable;

insert into public.catalog_recipe_components (
  id, recipe_version_id, name, kind, display_order, adjustable
) values (
  'a3000000-0000-4000-a000-000000000005',
  'a2000000-0000-4000-a000-000000000002',
  'Yogurt Sauce',
  'sauce',
  3,
  true
)
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  display_order = excluded.display_order,
  adjustable = excluded.adjustable;

insert into public.catalog_recipe_components (
  id, recipe_version_id, name, kind, display_order, adjustable
) values (
  'a3000000-0000-4000-a000-000000000006',
  'a2000000-0000-4000-a000-000000000003',
  'Yogurt bowl',
  'main',
  0,
  true
)
on conflict (id) do update set
  name = excluded.name,
  kind = excluded.kind,
  display_order = excluded.display_order,
  adjustable = excluded.adjustable;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000001',
  'a2000000-0000-4000-a000-000000000001',
  'a3000000-0000-4000-a000-000000000001',
  'c1000000-0000-4000-a000-000000000022',
  'c2000000-0000-4000-a000-000000000022',
  2,
  'count',
  'cracked',
  false,
  0
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000002',
  'a2000000-0000-4000-a000-000000000001',
  'a3000000-0000-4000-a000-000000000001',
  'c1000000-0000-4000-a000-000000000027',
  null,
  80,
  'g',
  'sliced',
  false,
  1
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000003',
  'a2000000-0000-4000-a000-000000000001',
  'a3000000-0000-4000-a000-000000000001',
  'c1000000-0000-4000-a000-000000000028',
  null,
  2,
  'count',
  null,
  false,
  2
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000004',
  'a2000000-0000-4000-a000-000000000001',
  'a3000000-0000-4000-a000-000000000001',
  'c1000000-0000-4000-a000-000000000029',
  null,
  5,
  'ml',
  null,
  false,
  3
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000005',
  'a2000000-0000-4000-a000-000000000001',
  'a3000000-0000-4000-a000-000000000001',
  'c1000000-0000-4000-a000-000000000030',
  null,
  1,
  'g',
  null,
  false,
  4
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000006',
  'a2000000-0000-4000-a000-000000000001',
  'a3000000-0000-4000-a000-000000000001',
  'c1000000-0000-4000-a000-000000000031',
  null,
  0.5,
  'g',
  null,
  false,
  5
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000010',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000005',
  'c2000000-0000-4000-a000-000000000005',
  450,
  'g',
  'raw',
  false,
  0
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000011',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000033',
  null,
  150,
  'g',
  'finely diced',
  false,
  1
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000012',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000034',
  null,
  12,
  'g',
  'minced',
  false,
  2
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000013',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000035',
  null,
  10,
  'g',
  'minced',
  false,
  3
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000014',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000036',
  null,
  200,
  'g',
  'diced',
  false,
  4
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000015',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000037',
  null,
  4,
  'g',
  null,
  false,
  5
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000016',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000038',
  null,
  4,
  'g',
  null,
  false,
  6
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000017',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000039',
  null,
  2,
  'g',
  null,
  false,
  7
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000018',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000040',
  null,
  3,
  'g',
  null,
  false,
  8
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000019',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000029',
  null,
  15,
  'ml',
  null,
  false,
  9
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000020',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000030',
  null,
  6,
  'g',
  null,
  false,
  10
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000021',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000003',
  'c1000000-0000-4000-a000-000000000032',
  null,
  180,
  'g',
  'rinsed',
  false,
  11
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000022',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000003',
  'c1000000-0000-4000-a000-000000000047',
  null,
  360,
  'ml',
  null,
  false,
  12
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000023',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000004',
  'c1000000-0000-4000-a000-000000000041',
  null,
  120,
  'g',
  null,
  false,
  13
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000024',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000005',
  'c1000000-0000-4000-a000-000000000042',
  null,
  100,
  'g',
  null,
  false,
  14
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000025',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000005',
  'c1000000-0000-4000-a000-000000000043',
  null,
  10,
  'g',
  'chopped',
  true,
  15
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000026',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000005',
  'c1000000-0000-4000-a000-000000000044',
  null,
  15,
  'ml',
  null,
  false,
  16
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000030',
  'a2000000-0000-4000-a000-000000000003',
  'a3000000-0000-4000-a000-000000000006',
  'c1000000-0000-4000-a000-000000000042',
  null,
  170,
  'g',
  null,
  false,
  0
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000031',
  'a2000000-0000-4000-a000-000000000003',
  'a3000000-0000-4000-a000-000000000006',
  'c1000000-0000-4000-a000-000000000045',
  null,
  80,
  'g',
  null,
  false,
  1
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_ingredients (
  id, recipe_version_id, component_id, canonical_ingredient_id, protein_product_id,
  quantity, unit, preparation, optional, display_order
) values (
  'a4000000-0000-4000-a000-000000000032',
  'a2000000-0000-4000-a000-000000000003',
  'a3000000-0000-4000-a000-000000000006',
  'c1000000-0000-4000-a000-000000000046',
  null,
  20,
  'g',
  'roughly chopped',
  false,
  2
)
on conflict (id) do update set
  component_id = excluded.component_id,
  canonical_ingredient_id = excluded.canonical_ingredient_id,
  protein_product_id = excluded.protein_product_id,
  quantity = excluded.quantity,
  unit = excluded.unit,
  preparation = excluded.preparation,
  optional = excluded.optional,
  display_order = excluded.display_order;

insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  'a5000000-0000-4000-a000-000000000001',
  'a2000000-0000-4000-a000-000000000001',
  'a3000000-0000-4000-a000-000000000001',
  1,
  'Toast bread',
  'Toast 2 slices of whole-grain bread until golden and firm enough to hold toppings.',
  3,
  null,
  ARRAY['toaster']::text[]
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;

insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  'a5000000-0000-4000-a000-000000000002',
  'a2000000-0000-4000-a000-000000000001',
  'a3000000-0000-4000-a000-000000000001',
  2,
  'Cook eggs',
  'Warm olive oil in a nonstick skillet over medium heat. Crack in 2 large eggs and cook to desired doneness (about 3 minutes for set whites).',
  4,
  null,
  ARRAY['nonstick_skillet', 'spatula']::text[]
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;

insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  'a5000000-0000-4000-a000-000000000003',
  'a2000000-0000-4000-a000-000000000001',
  'a3000000-0000-4000-a000-000000000001',
  3,
  'Assemble',
  'Slice avocado. Top each toast slice with avocado, one egg, then salt and black pepper.',
  3,
  null,
  ARRAY['knife', 'cutting_board']::text[]
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;

insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  'a5000000-0000-4000-a000-000000000010',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  1,
  'Prep aromatics',
  'Finely dice onion. Mince garlic and ginger. Dice tomato. Keep each pile separate.',
  10,
  null,
  ARRAY['knife', 'cutting_board']::text[]
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;

insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  'a5000000-0000-4000-a000-000000000011',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000003',
  2,
  'Cook rice',
  'Combine rinsed rice and water in a saucepan. Bring to a boil, cover, reduce heat to low, and simmer until water is absorbed (about 15 minutes). Rest covered 5 minutes.',
  5,
  20,
  ARRAY['saucepan', 'lid']::text[]
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;

insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  'a5000000-0000-4000-a000-000000000012',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  3,
  'Bloom spices',
  'Heat olive oil in a wide skillet over medium heat. Add onion and cook until translucent (5 minutes). Stir in garlic and ginger for 1 minute. Add cumin, coriander, and turmeric; stir 30 seconds until fragrant.',
  7,
  null,
  ARRAY['skillet', 'spatula']::text[]
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;

insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  'a5000000-0000-4000-a000-000000000013',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  4,
  'Brown ground chicken',
  'Add ground chicken. Break into small pieces and cook until no pink remains (6–8 minutes). Season with salt.',
  8,
  null,
  ARRAY['skillet', 'spatula']::text[]
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;

insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  'a5000000-0000-4000-a000-000000000014',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000002',
  5,
  'Simmer with tomato',
  'Stir in diced tomato and garam masala. Simmer until tomato softens and mixture is saucy (5 minutes).',
  5,
  null,
  ARRAY['skillet']::text[]
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;

insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  'a5000000-0000-4000-a000-000000000015',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000004',
  6,
  'Finish peas',
  'Fold frozen green peas into the kheema and cook until heated through (2–3 minutes).',
  3,
  null,
  ARRAY['skillet']::text[]
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;

insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  'a5000000-0000-4000-a000-000000000016',
  'a2000000-0000-4000-a000-000000000002',
  'a3000000-0000-4000-a000-000000000005',
  7,
  'Sauce and serve',
  'Stir lemon juice into Greek yogurt. Optionally fold in chopped cilantro. Serve kheema over rice with yogurt sauce on the side (keep sauce separate for storage).',
  3,
  null,
  ARRAY['bowl', 'spoon']::text[]
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;

insert into public.catalog_recipe_steps (
  id, recipe_version_id, component_id, step_order, title, instruction,
  active_minutes, passive_minutes, equipment
) values (
  'a5000000-0000-4000-a000-000000000020',
  'a2000000-0000-4000-a000-000000000003',
  'a3000000-0000-4000-a000-000000000006',
  1,
  'Assemble',
  'Spoon Greek yogurt into a bowl. Top with mixed berries and roughly chopped walnuts. Serve immediately.',
  3,
  null,
  ARRAY['bowl', 'spoon', 'knife']::text[]
)
on conflict (id) do update set
  component_id = excluded.component_id,
  step_order = excluded.step_order,
  title = excluded.title,
  instruction = excluded.instruction,
  active_minutes = excluded.active_minutes,
  passive_minutes = excluded.passive_minutes,
  equipment = excluded.equipment;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000001',
  'a5000000-0000-4000-a000-000000000001',
  'a4000000-0000-4000-a000-000000000003',
  2,
  'count',
  'toast'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000002',
  'a5000000-0000-4000-a000-000000000002',
  'a4000000-0000-4000-a000-000000000004',
  5,
  'ml',
  'heat'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000003',
  'a5000000-0000-4000-a000-000000000002',
  'a4000000-0000-4000-a000-000000000001',
  2,
  'count',
  'cook'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000004',
  'a5000000-0000-4000-a000-000000000003',
  'a4000000-0000-4000-a000-000000000002',
  80,
  'g',
  'slice_and_top'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000005',
  'a5000000-0000-4000-a000-000000000003',
  'a4000000-0000-4000-a000-000000000005',
  1,
  'g',
  'season'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000006',
  'a5000000-0000-4000-a000-000000000003',
  'a4000000-0000-4000-a000-000000000006',
  0.5,
  'g',
  'season'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000010',
  'a5000000-0000-4000-a000-000000000011',
  'a4000000-0000-4000-a000-000000000021',
  180,
  'g',
  'cook'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000011',
  'a5000000-0000-4000-a000-000000000011',
  'a4000000-0000-4000-a000-000000000022',
  360,
  'ml',
  'cook'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000012',
  'a5000000-0000-4000-a000-000000000012',
  'a4000000-0000-4000-a000-000000000019',
  15,
  'ml',
  'heat'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000013',
  'a5000000-0000-4000-a000-000000000012',
  'a4000000-0000-4000-a000-000000000011',
  150,
  'g',
  'saute'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000014',
  'a5000000-0000-4000-a000-000000000012',
  'a4000000-0000-4000-a000-000000000012',
  12,
  'g',
  'saute'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000015',
  'a5000000-0000-4000-a000-000000000012',
  'a4000000-0000-4000-a000-000000000013',
  10,
  'g',
  'saute'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000016',
  'a5000000-0000-4000-a000-000000000012',
  'a4000000-0000-4000-a000-000000000015',
  4,
  'g',
  'bloom'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000017',
  'a5000000-0000-4000-a000-000000000012',
  'a4000000-0000-4000-a000-000000000016',
  4,
  'g',
  'bloom'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000018',
  'a5000000-0000-4000-a000-000000000012',
  'a4000000-0000-4000-a000-000000000017',
  2,
  'g',
  'bloom'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000019',
  'a5000000-0000-4000-a000-000000000013',
  'a4000000-0000-4000-a000-000000000010',
  450,
  'g',
  'brown'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000020',
  'a5000000-0000-4000-a000-000000000013',
  'a4000000-0000-4000-a000-000000000020',
  6,
  'g',
  'season'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000021',
  'a5000000-0000-4000-a000-000000000014',
  'a4000000-0000-4000-a000-000000000014',
  200,
  'g',
  'simmer'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000022',
  'a5000000-0000-4000-a000-000000000014',
  'a4000000-0000-4000-a000-000000000018',
  3,
  'g',
  'season'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000023',
  'a5000000-0000-4000-a000-000000000015',
  'a4000000-0000-4000-a000-000000000023',
  120,
  'g',
  'heat'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000024',
  'a5000000-0000-4000-a000-000000000016',
  'a4000000-0000-4000-a000-000000000024',
  100,
  'g',
  'mix'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000025',
  'a5000000-0000-4000-a000-000000000016',
  'a4000000-0000-4000-a000-000000000026',
  15,
  'ml',
  'mix'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000026',
  'a5000000-0000-4000-a000-000000000016',
  'a4000000-0000-4000-a000-000000000025',
  10,
  'g',
  'optional_fold'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000040',
  'a5000000-0000-4000-a000-000000000020',
  'a4000000-0000-4000-a000-000000000030',
  170,
  'g',
  'portion'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000041',
  'a5000000-0000-4000-a000-000000000020',
  'a4000000-0000-4000-a000-000000000031',
  80,
  'g',
  'top'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_step_ingredient_usages (
  id, recipe_step_id, recipe_ingredient_id, quantity, unit, action
) values (
  'a6000000-0000-4000-a000-000000000042',
  'a5000000-0000-4000-a000-000000000020',
  'a4000000-0000-4000-a000-000000000032',
  20,
  'g',
  'top'
)
on conflict (id) do update set
  quantity = excluded.quantity,
  unit = excluded.unit,
  action = excluded.action;

insert into public.catalog_recipe_classifications (
  recipe_version_id, cuisines, flavor_profiles, experience_preferences,
  cooking_methods, allergens, dietary_attributes, required_equipment
) values (
  'a2000000-0000-4000-a000-000000000001',
  ARRAY['american']::text[],
  ARRAY['savory', 'mild']::text[],
  ARRAY['fresh', 'light_refreshing']::text[],
  ARRAY['stovetop', 'assembly']::text[],
  ARRAY['egg', 'gluten']::text[],
  ARRAY['vegetarian', 'high_protein', 'contains_gluten']::text[],
  ARRAY['toaster', 'nonstick_skillet', 'spatula', 'knife', 'cutting_board']::text[]
)
on conflict (recipe_version_id) do update set
  cuisines = excluded.cuisines,
  flavor_profiles = excluded.flavor_profiles,
  experience_preferences = excluded.experience_preferences,
  cooking_methods = excluded.cooking_methods,
  allergens = excluded.allergens,
  dietary_attributes = excluded.dietary_attributes,
  required_equipment = excluded.required_equipment;

insert into public.catalog_recipe_classifications (
  recipe_version_id, cuisines, flavor_profiles, experience_preferences,
  cooking_methods, allergens, dietary_attributes, required_equipment
) values (
  'a2000000-0000-4000-a000-000000000002',
  ARRAY['indian']::text[],
  ARRAY['savory', 'aromatic', 'rich']::text[],
  ARRAY['saucy_flavorful', 'comforting', 'spicy']::text[],
  ARRAY['stovetop']::text[],
  ARRAY['dairy']::text[],
  ARRAY['high_protein', 'contains_meat', 'contains_dairy']::text[],
  ARRAY['knife', 'cutting_board', 'saucepan', 'lid', 'skillet', 'spatula', 'bowl', 'spoon']::text[]
)
on conflict (recipe_version_id) do update set
  cuisines = excluded.cuisines,
  flavor_profiles = excluded.flavor_profiles,
  experience_preferences = excluded.experience_preferences,
  cooking_methods = excluded.cooking_methods,
  allergens = excluded.allergens,
  dietary_attributes = excluded.dietary_attributes,
  required_equipment = excluded.required_equipment;

insert into public.catalog_recipe_classifications (
  recipe_version_id, cuisines, flavor_profiles, experience_preferences,
  cooking_methods, allergens, dietary_attributes, required_equipment
) values (
  'a2000000-0000-4000-a000-000000000003',
  ARRAY['american']::text[],
  ARRAY['bright', 'mild']::text[],
  ARRAY['fresh', 'light_refreshing']::text[],
  ARRAY['no_cook', 'assembly']::text[],
  ARRAY['dairy', 'tree_nut']::text[],
  ARRAY['vegetarian', 'high_protein', 'contains_dairy']::text[],
  ARRAY['bowl', 'spoon', 'knife']::text[]
)
on conflict (recipe_version_id) do update set
  cuisines = excluded.cuisines,
  flavor_profiles = excluded.flavor_profiles,
  experience_preferences = excluded.experience_preferences,
  cooking_methods = excluded.cooking_methods,
  allergens = excluded.allergens,
  dietary_attributes = excluded.dietary_attributes,
  required_equipment = excluded.required_equipment;

insert into public.catalog_recipe_scaling_profiles (
  recipe_version_id, method, minimum_servings, maximum_servings, serving_increment, notes
) values (
  'a2000000-0000-4000-a000-000000000001',
  'linear',
  1,
  4,
  1,
  'Scale eggs and toast slices together.'
)
on conflict (recipe_version_id) do update set
  method = excluded.method,
  minimum_servings = excluded.minimum_servings,
  maximum_servings = excluded.maximum_servings,
  serving_increment = excluded.serving_increment,
  notes = excluded.notes;

insert into public.catalog_recipe_scaling_profiles (
  recipe_version_id, method, minimum_servings, maximum_servings, serving_increment, notes
) values (
  'a2000000-0000-4000-a000-000000000002',
  'linear',
  2,
  8,
  1,
  'Scale protein and rice together; keep sauce separate when storing.'
)
on conflict (recipe_version_id) do update set
  method = excluded.method,
  minimum_servings = excluded.minimum_servings,
  maximum_servings = excluded.maximum_servings,
  serving_increment = excluded.serving_increment,
  notes = excluded.notes;

insert into public.catalog_recipe_scaling_profiles (
  recipe_version_id, method, minimum_servings, maximum_servings, serving_increment, notes
) values (
  'a2000000-0000-4000-a000-000000000003',
  'linear',
  1,
  4,
  1,
  null
)
on conflict (recipe_version_id) do update set
  method = excluded.method,
  minimum_servings = excluded.minimum_servings,
  maximum_servings = excluded.maximum_servings,
  serving_increment = excluded.serving_increment,
  notes = excluded.notes;

insert into public.catalog_recipe_storage_profiles (
  recipe_version_id, prep_style, refrigeration_supported, freezing_supported,
  store_components_separately, guidance_source, notes
) values (
  'a2000000-0000-4000-a000-000000000001',
  'cook_fresh',
  false,
  false,
  false,
  null,
  'Best assembled and eaten fresh; storage horizons not reviewed.'
)
on conflict (recipe_version_id) do update set
  prep_style = excluded.prep_style,
  refrigeration_supported = excluded.refrigeration_supported,
  freezing_supported = excluded.freezing_supported,
  store_components_separately = excluded.store_components_separately,
  guidance_source = excluded.guidance_source,
  notes = excluded.notes;

insert into public.catalog_recipe_storage_profiles (
  recipe_version_id, prep_style, refrigeration_supported, freezing_supported,
  store_components_separately, guidance_source, notes
) values (
  'a2000000-0000-4000-a000-000000000002',
  'batch_cook',
  true,
  false,
  true,
  null,
  'Store yogurt sauce separately from hot components. Freezer horizon not reviewed — freezingSupported remains false.'
)
on conflict (recipe_version_id) do update set
  prep_style = excluded.prep_style,
  refrigeration_supported = excluded.refrigeration_supported,
  freezing_supported = excluded.freezing_supported,
  store_components_separately = excluded.store_components_separately,
  guidance_source = excluded.guidance_source,
  notes = excluded.notes;

insert into public.catalog_recipe_storage_profiles (
  recipe_version_id, prep_style, refrigeration_supported, freezing_supported,
  store_components_separately, guidance_source, notes
) values (
  'a2000000-0000-4000-a000-000000000003',
  'assemble_later',
  true,
  false,
  true,
  null,
  'Keep components separate until serving. Freezer guidance not reviewed.'
)
on conflict (recipe_version_id) do update set
  prep_style = excluded.prep_style,
  refrigeration_supported = excluded.refrigeration_supported,
  freezing_supported = excluded.freezing_supported,
  store_components_separately = excluded.store_components_separately,
  guidance_source = excluded.guidance_source,
  notes = excluded.notes;

insert into public.catalog_recipe_provenance (
  recipe_version_id, provenance_type, source_url, source_creator,
  reviewed_by, reviewed_at, kitchen_tested_at
) values (
  'a2000000-0000-4000-a000-000000000001',
  'editor_authored',
  null,
  'Fitness Autopilot culinary reference',
  null,
  null,
  null
)
on conflict (recipe_version_id) do update set
  provenance_type = excluded.provenance_type,
  source_url = excluded.source_url,
  source_creator = excluded.source_creator,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at,
  kitchen_tested_at = excluded.kitchen_tested_at;

insert into public.catalog_recipe_provenance (
  recipe_version_id, provenance_type, source_url, source_creator,
  reviewed_by, reviewed_at, kitchen_tested_at
) values (
  'a2000000-0000-4000-a000-000000000002',
  'editor_authored',
  null,
  'Fitness Autopilot culinary reference',
  null,
  null,
  null
)
on conflict (recipe_version_id) do update set
  provenance_type = excluded.provenance_type,
  source_url = excluded.source_url,
  source_creator = excluded.source_creator,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at,
  kitchen_tested_at = excluded.kitchen_tested_at;

insert into public.catalog_recipe_provenance (
  recipe_version_id, provenance_type, source_url, source_creator,
  reviewed_by, reviewed_at, kitchen_tested_at
) values (
  'a2000000-0000-4000-a000-000000000003',
  'editor_authored',
  null,
  'Fitness Autopilot culinary reference',
  null,
  null,
  null
)
on conflict (recipe_version_id) do update set
  provenance_type = excluded.provenance_type,
  source_url = excluded.source_url,
  source_creator = excluded.source_creator,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at,
  kitchen_tested_at = excluded.kitchen_tested_at;

update public.catalog_recipes
set current_published_version_id = 'a2000000-0000-4000-a000-000000000001',
    updated_at = '2026-09-20T00:00:00.000Z'
where id = 'a1000000-0000-4000-a000-000000000001';

update public.catalog_recipes
set current_published_version_id = 'a2000000-0000-4000-a000-000000000002',
    updated_at = '2026-09-20T00:00:00.000Z'
where id = 'a1000000-0000-4000-a000-000000000002';

update public.catalog_recipes
set current_published_version_id = 'a2000000-0000-4000-a000-000000000003',
    updated_at = '2026-09-20T00:00:00.000Z'
where id = 'a1000000-0000-4000-a000-000000000003';

