-- RECIPE-001: Versioned recipe catalog foundation
-- Application-owned curated recipes (authenticated read of published versions;
-- service-role / migrations only for writes).
-- Does not modify existing foods / recipes / plan tables (legacy pipeline intact).

create table if not exists public.catalog_recipes (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  section text not null
    check (section in ('breakfast', 'meal', 'snack')),
  current_published_version_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint catalog_recipes_canonical_key_uidx unique (canonical_key),
  constraint catalog_recipes_canonical_key_format_chk check (
    canonical_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  )
);

create trigger catalog_recipes_set_updated_at
before update on public.catalog_recipes
for each row execute function public.set_updated_at();

create table if not exists public.catalog_recipe_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null
    references public.catalog_recipes (id)
    on delete restrict,
  version integer not null check (version > 0),
  status text not null
    check (status in ('draft', 'validated', 'published', 'retired')),
  kitchen_test_status text not null
    check (kitchen_test_status in ('not_tested', 'passed', 'failed')),
  title text not null,
  description text,
  reference_servings numeric not null check (reference_servings > 0),
  active_minutes integer not null check (active_minutes >= 0),
  passive_minutes integer not null check (passive_minutes >= 0),
  lunch_suitability text
    check (
      lunch_suitability is null
      or lunch_suitability in ('preferred', 'compatible', 'unsuitable')
    ),
  dinner_suitability text
    check (
      dinner_suitability is null
      or dinner_suitability in ('preferred', 'compatible', 'unsuitable')
    ),
  created_at timestamptz not null default timezone('utc', now()),
  published_at timestamptz,
  retired_at timestamptz,
  constraint catalog_recipe_versions_recipe_version_uidx unique (recipe_id, version),
  constraint catalog_recipe_versions_title_chk check (char_length(trim(title)) > 0),
  constraint catalog_recipe_versions_published_at_chk check (
    status <> 'published' or published_at is not null
  ),
  constraint catalog_recipe_versions_retired_at_chk check (
    status <> 'retired' or retired_at is not null
  )
);

create index if not exists catalog_recipe_versions_recipe_id_idx
  on public.catalog_recipe_versions (recipe_id);
create index if not exists catalog_recipe_versions_status_idx
  on public.catalog_recipe_versions (status);
create index if not exists catalog_recipe_versions_title_idx
  on public.catalog_recipe_versions (lower(title));

-- Deferred FK: current_published_version_id must belong to same recipe.
alter table public.catalog_recipes
  drop constraint if exists catalog_recipes_current_published_version_fk;
alter table public.catalog_recipes
  add constraint catalog_recipes_current_published_version_fk
  foreign key (current_published_version_id)
  references public.catalog_recipe_versions (id)
  on delete restrict;

create or replace function public.catalog_recipes_current_published_same_recipe()
returns trigger
language plpgsql
as $$
begin
  if new.current_published_version_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.catalog_recipe_versions v
    where v.id = new.current_published_version_id
      and v.recipe_id = new.id
      and v.status = 'published'
  ) then
    raise exception 'INVALID_CURRENT_PUBLISHED_VERSION: current_published_version_id must reference a published version of the same recipe';
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_recipes_current_published_same_recipe_trg on public.catalog_recipes;
create constraint trigger catalog_recipes_current_published_same_recipe_trg
after insert or update of current_published_version_id on public.catalog_recipes
deferrable initially deferred
for each row execute function public.catalog_recipes_current_published_same_recipe();

create table if not exists public.catalog_recipe_components (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null
    references public.catalog_recipe_versions (id)
    on delete restrict,
  name text not null,
  kind text not null
    check (kind in ('main', 'carbohydrate', 'vegetable', 'sauce', 'topping', 'other')),
  display_order integer not null check (display_order >= 0),
  adjustable boolean not null default false,
  constraint catalog_recipe_components_name_uidx unique (recipe_version_id, name),
  constraint catalog_recipe_components_order_uidx unique (recipe_version_id, display_order),
  constraint catalog_recipe_components_name_chk check (char_length(trim(name)) > 0)
);

create index if not exists catalog_recipe_components_version_idx
  on public.catalog_recipe_components (recipe_version_id);

create table if not exists public.catalog_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null
    references public.catalog_recipe_versions (id)
    on delete restrict,
  component_id uuid
    references public.catalog_recipe_components (id)
    on delete restrict,
  canonical_ingredient_id uuid not null
    references public.canonical_ingredients (id)
    on delete restrict,
  protein_product_id uuid
    references public.protein_products (id)
    on delete restrict,
  quantity numeric not null check (quantity > 0),
  unit text not null
    check (unit in ('g', 'kg', 'oz', 'lb', 'ml', 'tsp', 'tbsp', 'cup', 'count')),
  preparation text,
  optional boolean not null default false,
  display_order integer not null check (display_order >= 0),
  constraint catalog_recipe_ingredients_order_uidx unique (recipe_version_id, display_order)
);

create index if not exists catalog_recipe_ingredients_version_idx
  on public.catalog_recipe_ingredients (recipe_version_id);
create index if not exists catalog_recipe_ingredients_canonical_idx
  on public.catalog_recipe_ingredients (canonical_ingredient_id);
create index if not exists catalog_recipe_ingredients_protein_idx
  on public.catalog_recipe_ingredients (protein_product_id);

create or replace function public.catalog_recipe_ingredient_protein_pair_chk()
returns trigger
language plpgsql
as $$
declare
  product_ingredient uuid;
begin
  if new.protein_product_id is null then
    return new;
  end if;
  select ingredient_id into product_ingredient
  from public.protein_products
  where id = new.protein_product_id;
  if product_ingredient is null then
    raise exception 'INVALID_PROTEIN_INGREDIENT_PAIR: unknown protein product';
  end if;
  if product_ingredient <> new.canonical_ingredient_id then
    raise exception 'INVALID_PROTEIN_INGREDIENT_PAIR: protein product must match canonical ingredient';
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_recipe_ingredient_protein_pair_trg on public.catalog_recipe_ingredients;
create trigger catalog_recipe_ingredient_protein_pair_trg
before insert or update on public.catalog_recipe_ingredients
for each row execute function public.catalog_recipe_ingredient_protein_pair_chk();

create or replace function public.catalog_recipe_ingredient_component_same_version_chk()
returns trigger
language plpgsql
as $$
begin
  if new.component_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.catalog_recipe_components c
    where c.id = new.component_id
      and c.recipe_version_id = new.recipe_version_id
  ) then
    raise exception 'MISSING_RECIPE_COMPONENT: component must belong to the same recipe version';
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_recipe_ingredient_component_same_version_trg on public.catalog_recipe_ingredients;
create trigger catalog_recipe_ingredient_component_same_version_trg
before insert or update on public.catalog_recipe_ingredients
for each row execute function public.catalog_recipe_ingredient_component_same_version_chk();

create table if not exists public.catalog_recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_version_id uuid not null
    references public.catalog_recipe_versions (id)
    on delete restrict,
  component_id uuid
    references public.catalog_recipe_components (id)
    on delete restrict,
  step_order integer not null check (step_order > 0),
  title text,
  instruction text not null,
  active_minutes integer check (active_minutes is null or active_minutes >= 0),
  passive_minutes integer check (passive_minutes is null or passive_minutes >= 0),
  equipment text[] not null default '{}',
  constraint catalog_recipe_steps_order_uidx unique (recipe_version_id, step_order),
  constraint catalog_recipe_steps_instruction_chk check (char_length(trim(instruction)) > 0)
);

create index if not exists catalog_recipe_steps_version_idx
  on public.catalog_recipe_steps (recipe_version_id);

create or replace function public.catalog_recipe_step_component_same_version_chk()
returns trigger
language plpgsql
as $$
begin
  if new.component_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.catalog_recipe_components c
    where c.id = new.component_id
      and c.recipe_version_id = new.recipe_version_id
  ) then
    raise exception 'MISSING_RECIPE_COMPONENT: step component must belong to the same recipe version';
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_recipe_step_component_same_version_trg on public.catalog_recipe_steps;
create trigger catalog_recipe_step_component_same_version_trg
before insert or update on public.catalog_recipe_steps
for each row execute function public.catalog_recipe_step_component_same_version_chk();

create table if not exists public.catalog_recipe_step_ingredient_usages (
  id uuid primary key default gen_random_uuid(),
  recipe_step_id uuid not null
    references public.catalog_recipe_steps (id)
    on delete restrict,
  recipe_ingredient_id uuid not null
    references public.catalog_recipe_ingredients (id)
    on delete restrict,
  quantity numeric not null check (quantity > 0),
  unit text not null
    check (unit in ('g', 'kg', 'oz', 'lb', 'ml', 'tsp', 'tbsp', 'cup', 'count')),
  action text
);

create index if not exists catalog_recipe_step_usages_step_idx
  on public.catalog_recipe_step_ingredient_usages (recipe_step_id);
create index if not exists catalog_recipe_step_usages_ingredient_idx
  on public.catalog_recipe_step_ingredient_usages (recipe_ingredient_id);

create or replace function public.catalog_recipe_usage_same_version_chk()
returns trigger
language plpgsql
as $$
declare
  step_version uuid;
  ingredient_version uuid;
begin
  select recipe_version_id into step_version
  from public.catalog_recipe_steps where id = new.recipe_step_id;
  select recipe_version_id into ingredient_version
  from public.catalog_recipe_ingredients where id = new.recipe_ingredient_id;
  if step_version is null or ingredient_version is null or step_version <> ingredient_version then
    raise exception 'UNACCOUNTED_INGREDIENT: step usage must reference the same recipe version';
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_recipe_usage_same_version_trg on public.catalog_recipe_step_ingredient_usages;
create trigger catalog_recipe_usage_same_version_trg
before insert or update on public.catalog_recipe_step_ingredient_usages
for each row execute function public.catalog_recipe_usage_same_version_chk();

create table if not exists public.catalog_recipe_classifications (
  recipe_version_id uuid primary key
    references public.catalog_recipe_versions (id)
    on delete restrict,
  cuisines text[] not null default '{}',
  flavor_profiles text[] not null default '{}',
  experience_preferences text[] not null default '{}',
  cooking_methods text[] not null default '{}',
  allergens text[] not null default '{}',
  dietary_attributes text[] not null default '{}',
  required_equipment text[] not null default '{}'
);

create table if not exists public.catalog_recipe_scaling_profiles (
  recipe_version_id uuid primary key
    references public.catalog_recipe_versions (id)
    on delete restrict,
  method text not null
    check (method in ('linear', 'constrained', 'unsupported')),
  minimum_servings numeric not null check (minimum_servings > 0),
  maximum_servings numeric not null check (maximum_servings > 0),
  serving_increment numeric not null check (serving_increment > 0),
  notes text,
  constraint catalog_recipe_scaling_range_chk check (minimum_servings <= maximum_servings)
);

create table if not exists public.catalog_recipe_storage_profiles (
  recipe_version_id uuid primary key
    references public.catalog_recipe_versions (id)
    on delete restrict,
  prep_style text not null
    check (prep_style in ('batch_cook', 'fresh_finish', 'assemble_later', 'cook_fresh')),
  refrigeration_supported boolean not null,
  freezing_supported boolean not null,
  store_components_separately boolean not null,
  guidance_source text,
  notes text
);

create table if not exists public.catalog_recipe_provenance (
  recipe_version_id uuid primary key
    references public.catalog_recipe_versions (id)
    on delete restrict,
  provenance_type text not null
    check (
      provenance_type in (
        'editor_authored',
        'licensed_source',
        'user_submitted',
        'social_import',
        'generated_draft'
      )
    ),
  source_url text,
  source_creator text,
  reviewed_by text,
  reviewed_at timestamptz,
  kitchen_tested_at timestamptz
);

comment on table public.catalog_recipes is
  'RECIPE-001 stable recipe identities. Distinct from legacy public.recipes (Food-based).';
comment on table public.catalog_recipe_versions is
  'Immutable once published/retired. Revisions create a new version row.';
comment on column public.catalog_recipe_versions.kitchen_test_status is
  'Independent of publication status — published does not imply kitchen tested.';

-- RLS: authenticated may SELECT published versions and related rows;
-- draft/validated/retired version rows are not exposed to ordinary users.
-- Mutations: service-role / migrations only (no authenticated write policies).

alter table public.catalog_recipes enable row level security;
alter table public.catalog_recipe_versions enable row level security;
alter table public.catalog_recipe_components enable row level security;
alter table public.catalog_recipe_ingredients enable row level security;
alter table public.catalog_recipe_steps enable row level security;
alter table public.catalog_recipe_step_ingredient_usages enable row level security;
alter table public.catalog_recipe_classifications enable row level security;
alter table public.catalog_recipe_scaling_profiles enable row level security;
alter table public.catalog_recipe_storage_profiles enable row level security;
alter table public.catalog_recipe_provenance enable row level security;

create policy catalog_recipes_select_authenticated
  on public.catalog_recipes
  for select
  to authenticated
  using (
    current_published_version_id is not null
    and exists (
      select 1 from public.catalog_recipe_versions v
      where v.id = catalog_recipes.current_published_version_id
        and v.status = 'published'
    )
  );

create policy catalog_recipe_versions_select_authenticated
  on public.catalog_recipe_versions
  for select
  to authenticated
  using (status = 'published');

create policy catalog_recipe_components_select_authenticated
  on public.catalog_recipe_components
  for select
  to authenticated
  using (
    exists (
      select 1 from public.catalog_recipe_versions v
      where v.id = catalog_recipe_components.recipe_version_id
        and v.status = 'published'
    )
  );

create policy catalog_recipe_ingredients_select_authenticated
  on public.catalog_recipe_ingredients
  for select
  to authenticated
  using (
    exists (
      select 1 from public.catalog_recipe_versions v
      where v.id = catalog_recipe_ingredients.recipe_version_id
        and v.status = 'published'
    )
  );

create policy catalog_recipe_steps_select_authenticated
  on public.catalog_recipe_steps
  for select
  to authenticated
  using (
    exists (
      select 1 from public.catalog_recipe_versions v
      where v.id = catalog_recipe_steps.recipe_version_id
        and v.status = 'published'
    )
  );

create policy catalog_recipe_step_usages_select_authenticated
  on public.catalog_recipe_step_ingredient_usages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.catalog_recipe_steps s
      join public.catalog_recipe_versions v on v.id = s.recipe_version_id
      where s.id = catalog_recipe_step_ingredient_usages.recipe_step_id
        and v.status = 'published'
    )
  );

create policy catalog_recipe_classifications_select_authenticated
  on public.catalog_recipe_classifications
  for select
  to authenticated
  using (
    exists (
      select 1 from public.catalog_recipe_versions v
      where v.id = catalog_recipe_classifications.recipe_version_id
        and v.status = 'published'
    )
  );

create policy catalog_recipe_scaling_select_authenticated
  on public.catalog_recipe_scaling_profiles
  for select
  to authenticated
  using (
    exists (
      select 1 from public.catalog_recipe_versions v
      where v.id = catalog_recipe_scaling_profiles.recipe_version_id
        and v.status = 'published'
    )
  );

create policy catalog_recipe_storage_select_authenticated
  on public.catalog_recipe_storage_profiles
  for select
  to authenticated
  using (
    exists (
      select 1 from public.catalog_recipe_versions v
      where v.id = catalog_recipe_storage_profiles.recipe_version_id
        and v.status = 'published'
    )
  );

create policy catalog_recipe_provenance_select_authenticated
  on public.catalog_recipe_provenance
  for select
  to authenticated
  using (
    exists (
      select 1 from public.catalog_recipe_versions v
      where v.id = catalog_recipe_provenance.recipe_version_id
        and v.status = 'published'
    )
  );

-- No insert/update/delete policies for authenticated: mutation is service-role / migrations only.
-- Internal verification UI reads the shared TypeScript seed (same curated dataset as SQL upserts),
-- matching CATALOG-001 preview convention — unpublished drafts are never exposed via RLS to clients.

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

