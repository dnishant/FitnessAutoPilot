-- CATALOG-001: Canonical ingredient and protein-product foundation
-- Application-owned catalog (authenticated read; service-role / migration write).
-- Does not modify existing foods / recipes / plan tables.

create table if not exists public.canonical_ingredients (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  display_name text not null,
  category text not null
    check (
      category in (
        'protein',
        'produce',
        'grain',
        'dairy',
        'legume',
        'spice',
        'condiment',
        'oil',
        'other'
      )
    ),
  default_unit text,
  availability_class text not null
    check (
      availability_class in (
        'widely_available',
        'commonly_available',
        'retailer_dependent',
        'specialty',
        'seasonal'
      )
    ),
  nutrition_source_type text
    check (
      nutrition_source_type is null
      or nutrition_source_type in ('usda_fdc', 'manufacturer', 'verified_manual')
    ),
  nutrition_source_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint canonical_ingredients_canonical_key_uidx unique (canonical_key),
  constraint canonical_ingredients_nutrition_mapping_chk check (
    (nutrition_source_type is null and nutrition_source_id is null)
    or (nutrition_source_type is not null and nutrition_source_id is not null)
  ),
  constraint canonical_ingredients_canonical_key_format_chk check (
    canonical_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  constraint canonical_ingredients_display_name_chk check (char_length(trim(display_name)) > 0)
);

create trigger canonical_ingredients_set_updated_at
before update on public.canonical_ingredients
for each row execute function public.set_updated_at();

create table if not exists public.ingredient_aliases (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null
    references public.canonical_ingredients (id)
    on delete restrict,
  normalized_alias text not null,
  display_alias text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint ingredient_aliases_normalized_uidx unique (normalized_alias),
  constraint ingredient_aliases_normalized_chk check (char_length(trim(normalized_alias)) > 0),
  constraint ingredient_aliases_display_chk check (char_length(trim(display_alias)) > 0)
);

create index if not exists ingredient_aliases_ingredient_id_idx
  on public.ingredient_aliases (ingredient_id);

create table if not exists public.protein_products (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  ingredient_id uuid not null
    references public.canonical_ingredients (id)
    on delete restrict,
  protein_family text not null
    check (
      protein_family in (
        'chicken',
        'turkey',
        'egg',
        'beef',
        'fish',
        'shellfish',
        'paneer',
        'tofu',
        'legume',
        'other'
      )
    ),
  display_name text not null,
  species text,
  cut text,
  form text not null,
  bone_state text
    check (bone_state is null or bone_state in ('bone_in', 'boneless', 'not_applicable')),
  skin_state text
    check (
      skin_state is null
      or skin_state in ('skin_on', 'skinless', 'variable', 'not_applicable')
    ),
  fat_descriptor text,
  typical_purchase_unit text not null
    check (typical_purchase_unit in ('lb', 'oz', 'count', 'package')),
  availability_class text not null
    check (
      availability_class in (
        'widely_available',
        'commonly_available',
        'retailer_dependent',
        'specialty',
        'seasonal'
      )
    ),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint protein_products_canonical_key_uidx unique (canonical_key),
  constraint protein_products_canonical_key_format_chk check (
    canonical_key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  constraint protein_products_display_name_chk check (char_length(trim(display_name)) > 0),
  constraint protein_products_form_chk check (char_length(trim(form)) > 0)
);

create trigger protein_products_set_updated_at
before update on public.protein_products
for each row execute function public.set_updated_at();

create index if not exists protein_products_ingredient_id_idx
  on public.protein_products (ingredient_id);
create index if not exists protein_products_family_active_idx
  on public.protein_products (protein_family, active);
create index if not exists protein_products_availability_idx
  on public.protein_products (availability_class);
create index if not exists protein_products_display_name_idx
  on public.protein_products (lower(display_name));

create table if not exists public.retailer_availability_evidence (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid references public.canonical_ingredients (id) on delete restrict,
  protein_product_id uuid references public.protein_products (id) on delete restrict,
  retailer text not null
    check (retailer in ('costco', 'walmart', 'whole_foods', 'trader_joes')),
  confidence text not null
    check (confidence in ('verified', 'likely', 'unknown')),
  region text,
  product_form text,
  source_url text,
  verified_at timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint retailer_evidence_exactly_one_target_chk check (
    (ingredient_id is not null and protein_product_id is null)
    or (ingredient_id is null and protein_product_id is not null)
  ),
  constraint retailer_evidence_verified_requires_source_chk check (
    confidence <> 'verified'
    or (source_url is not null and char_length(trim(source_url)) > 0)
  ),
  constraint retailer_evidence_verified_requires_timestamp_chk check (
    confidence <> 'verified' or verified_at is not null
  )
);

create trigger retailer_availability_evidence_set_updated_at
before update on public.retailer_availability_evidence
for each row execute function public.set_updated_at();

create index if not exists retailer_evidence_protein_product_id_idx
  on public.retailer_availability_evidence (protein_product_id);
create index if not exists retailer_evidence_ingredient_id_idx
  on public.retailer_availability_evidence (ingredient_id);

create table if not exists public.ingredient_substitutions (
  id uuid primary key default gen_random_uuid(),
  source_ingredient_id uuid not null
    references public.canonical_ingredients (id)
    on delete restrict,
  substitute_ingredient_id uuid not null
    references public.canonical_ingredients (id)
    on delete restrict,
  compatibility text not null
    check (compatibility in ('equivalent', 'recipe_dependent', 'limited')),
  notes text,
  approved boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ingredient_substitutions_no_self_chk check (
    source_ingredient_id <> substitute_ingredient_id
  ),
  constraint ingredient_substitutions_pair_uidx unique (
    source_ingredient_id,
    substitute_ingredient_id
  )
);

create trigger ingredient_substitutions_set_updated_at
before update on public.ingredient_substitutions
for each row execute function public.set_updated_at();

create index if not exists ingredient_substitutions_source_idx
  on public.ingredient_substitutions (source_ingredient_id)
  where approved = true;

comment on table public.canonical_ingredients is
  'CATALOG-001 stable canonical ingredients. Display names may change; keys do not.';
comment on table public.protein_products is
  'CATALOG-001 purchasable protein forms. Distinct cuts/fat ratios remain distinct rows.';
comment on table public.retailer_availability_evidence is
  'Historical retailer coverage signals — not live local inventory.';
comment on column public.retailer_availability_evidence.confidence is
  'verified requires source_url + verified_at; likely/unknown must not be shown as verified.';

alter table public.canonical_ingredients enable row level security;
alter table public.ingredient_aliases enable row level security;
alter table public.protein_products enable row level security;
alter table public.retailer_availability_evidence enable row level security;
alter table public.ingredient_substitutions enable row level security;

create policy canonical_ingredients_select_authenticated
  on public.canonical_ingredients
  for select
  to authenticated
  using (true);

create policy ingredient_aliases_select_authenticated
  on public.ingredient_aliases
  for select
  to authenticated
  using (true);

create policy protein_products_select_authenticated
  on public.protein_products
  for select
  to authenticated
  using (true);

create policy retailer_availability_evidence_select_authenticated
  on public.retailer_availability_evidence
  for select
  to authenticated
  using (true);

create policy ingredient_substitutions_select_authenticated
  on public.ingredient_substitutions
  for select
  to authenticated
  using (approved = true);

-- No insert/update/delete policies for authenticated: mutation is service-role / migrations only.
-- CATALOG-001 curated seed (idempotent upserts)
-- Nutrition source IDs intentionally unmapped unless verified.

insert into public.canonical_ingredients (
  id, canonical_key, display_name, category, default_unit, availability_class,
  nutrition_source_type, nutrition_source_id, created_at, updated_at
) values (
  'c1000000-0000-4000-a000-000000000001',
  'chicken_breast_boneless_skinless',
  'Boneless skinless chicken breast',
  'protein',
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
  'c1000000-0000-4000-a000-000000000002',
  'chicken_thigh_boneless_skinless',
  'Boneless skinless chicken thighs',
  'protein',
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
  'c1000000-0000-4000-a000-000000000003',
  'chicken_thigh_bone_in_skin_on',
  'Bone-in skin-on chicken thighs',
  'protein',
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
  'c1000000-0000-4000-a000-000000000004',
  'chicken_wings',
  'Chicken wings',
  'protein',
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
  'c1000000-0000-4000-a000-000000000005',
  'ground_chicken',
  'Ground chicken',
  'protein',
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
  'c1000000-0000-4000-a000-000000000006',
  'ground_turkey_93_7',
  '93/7 ground turkey',
  'protein',
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
  'c1000000-0000-4000-a000-000000000007',
  'ground_beef_80_20',
  '80/20 ground beef',
  'protein',
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
  'c1000000-0000-4000-a000-000000000008',
  'ground_beef_90_10',
  '90/10 ground beef',
  'protein',
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
  'c1000000-0000-4000-a000-000000000009',
  'ground_beef_93_7',
  '93/7 ground beef',
  'protein',
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
  'c1000000-0000-4000-a000-000000000010',
  'beef_ribeye_steak',
  'Ribeye steak',
  'protein',
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
  'c1000000-0000-4000-a000-000000000011',
  'beef_new_york_strip_steak',
  'New York strip steak',
  'protein',
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
  'c1000000-0000-4000-a000-000000000012',
  'beef_top_sirloin_steak',
  'Top sirloin steak',
  'protein',
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
  'c1000000-0000-4000-a000-000000000013',
  'beef_flank_steak',
  'Flank steak',
  'protein',
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
  'c1000000-0000-4000-a000-000000000014',
  'beef_tenderloin',
  'Beef tenderloin',
  'protein',
  'g',
  'retailer_dependent',
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
  'c1000000-0000-4000-a000-000000000015',
  'beef_chuck_roast',
  'Chuck roast',
  'protein',
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
  'c1000000-0000-4000-a000-000000000016',
  'beef_stew_meat',
  'Beef stew meat',
  'protein',
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
  'c1000000-0000-4000-a000-000000000017',
  'atlantic_salmon_fillet',
  'Atlantic salmon fillet',
  'protein',
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
  'c1000000-0000-4000-a000-000000000018',
  'cod_fillet',
  'Cod fillet',
  'protein',
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
  'c1000000-0000-4000-a000-000000000019',
  'tilapia_fillet',
  'Tilapia fillet',
  'protein',
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
  'c1000000-0000-4000-a000-000000000020',
  'shrimp_raw_peeled_deveined',
  'Raw peeled and deveined shrimp',
  'protein',
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
  'c1000000-0000-4000-a000-000000000021',
  'lobster_tail',
  'Lobster tail',
  'protein',
  'g',
  'specialty',
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
  'c1000000-0000-4000-a000-000000000022',
  'chicken_eggs_large',
  'Large chicken eggs',
  'protein',
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
  'c1000000-0000-4000-a000-000000000023',
  'paneer',
  'Paneer',
  'dairy',
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
  'c1000000-0000-4000-a000-000000000024',
  'tofu_extra_firm',
  'Extra-firm tofu',
  'protein',
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
  'c1000000-0000-4000-a000-000000000025',
  'chickpeas_canned',
  'Canned chickpeas',
  'legume',
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
  'c1000000-0000-4000-a000-000000000026',
  'lentils_cooked',
  'Cooked lentils',
  'legume',
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

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000001',
  'chicken_breast_boneless_skinless',
  'c1000000-0000-4000-a000-000000000001',
  'chicken',
  'Boneless Skinless Chicken Breast',
  'chicken',
  'breast',
  'whole_muscle',
  'boneless',
  'skinless',
  null,
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000002',
  'chicken_thigh_boneless_skinless',
  'c1000000-0000-4000-a000-000000000002',
  'chicken',
  'Boneless Skinless Chicken Thighs',
  'chicken',
  'thigh',
  'whole_muscle',
  'boneless',
  'skinless',
  null,
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000003',
  'chicken_thigh_bone_in_skin_on',
  'c1000000-0000-4000-a000-000000000003',
  'chicken',
  'Bone-In Skin-On Chicken Thighs',
  'chicken',
  'thigh',
  'whole_muscle',
  'bone_in',
  'skin_on',
  null,
  'lb',
  'commonly_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000004',
  'chicken_wings',
  'c1000000-0000-4000-a000-000000000004',
  'chicken',
  'Chicken Wings',
  'chicken',
  'wing',
  'whole_muscle',
  'bone_in',
  'skin_on',
  null,
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000005',
  'ground_chicken',
  'c1000000-0000-4000-a000-000000000005',
  'chicken',
  'Ground Chicken',
  'chicken',
  'ground',
  'ground',
  'not_applicable',
  'not_applicable',
  null,
  'lb',
  'commonly_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000006',
  'ground_turkey_93_7',
  'c1000000-0000-4000-a000-000000000006',
  'turkey',
  '93/7 Ground Turkey',
  'turkey',
  'ground',
  'ground',
  'not_applicable',
  'not_applicable',
  '93/7',
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000007',
  'ground_beef_80_20',
  'c1000000-0000-4000-a000-000000000007',
  'beef',
  '80/20 Ground Beef',
  'cattle',
  'ground',
  'ground',
  'not_applicable',
  'not_applicable',
  '80/20',
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000008',
  'ground_beef_90_10',
  'c1000000-0000-4000-a000-000000000008',
  'beef',
  '90/10 Ground Beef',
  'cattle',
  'ground',
  'ground',
  'not_applicable',
  'not_applicable',
  '90/10',
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000009',
  'ground_beef_93_7',
  'c1000000-0000-4000-a000-000000000009',
  'beef',
  '93/7 Ground Beef',
  'cattle',
  'ground',
  'ground',
  'not_applicable',
  'not_applicable',
  '93/7',
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000010',
  'beef_ribeye_steak',
  'c1000000-0000-4000-a000-000000000010',
  'beef',
  'Ribeye Steak',
  'cattle',
  'ribeye',
  'steak',
  'boneless',
  'not_applicable',
  null,
  'lb',
  'commonly_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000011',
  'beef_new_york_strip_steak',
  'c1000000-0000-4000-a000-000000000011',
  'beef',
  'New York Strip Steak',
  'cattle',
  'new_york_strip',
  'steak',
  'boneless',
  'not_applicable',
  null,
  'lb',
  'commonly_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000012',
  'beef_top_sirloin_steak',
  'c1000000-0000-4000-a000-000000000012',
  'beef',
  'Top Sirloin Steak',
  'cattle',
  'top_sirloin',
  'steak',
  'boneless',
  'not_applicable',
  null,
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000013',
  'beef_flank_steak',
  'c1000000-0000-4000-a000-000000000013',
  'beef',
  'Flank Steak',
  'cattle',
  'flank',
  'steak',
  'boneless',
  'not_applicable',
  null,
  'lb',
  'commonly_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000014',
  'beef_tenderloin',
  'c1000000-0000-4000-a000-000000000014',
  'beef',
  'Beef Tenderloin',
  'cattle',
  'tenderloin',
  'roast_or_steak',
  'boneless',
  'not_applicable',
  null,
  'lb',
  'retailer_dependent',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000015',
  'beef_chuck_roast',
  'c1000000-0000-4000-a000-000000000015',
  'beef',
  'Chuck Roast',
  'cattle',
  'chuck',
  'roast',
  'boneless',
  'not_applicable',
  null,
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000016',
  'beef_stew_meat',
  'c1000000-0000-4000-a000-000000000016',
  'beef',
  'Beef Stew Meat',
  'cattle',
  'stew',
  'cubed',
  'boneless',
  'not_applicable',
  null,
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000017',
  'atlantic_salmon_fillet',
  'c1000000-0000-4000-a000-000000000017',
  'fish',
  'Atlantic Salmon Fillet',
  'atlantic_salmon',
  'fillet',
  'fillet',
  'boneless',
  'variable',
  null,
  'lb',
  'commonly_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000018',
  'cod_fillet',
  'c1000000-0000-4000-a000-000000000018',
  'fish',
  'Cod Fillet',
  'cod',
  'fillet',
  'fillet',
  'boneless',
  'skinless',
  null,
  'lb',
  'commonly_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000019',
  'tilapia_fillet',
  'c1000000-0000-4000-a000-000000000019',
  'fish',
  'Tilapia Fillet',
  'tilapia',
  'fillet',
  'fillet',
  'boneless',
  'skinless',
  null,
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000020',
  'shrimp_raw_peeled_deveined',
  'c1000000-0000-4000-a000-000000000020',
  'shellfish',
  'Raw Peeled and Deveined Shrimp',
  'shrimp',
  'tail_on_or_off',
  'peeled_deveined_raw',
  'not_applicable',
  'not_applicable',
  null,
  'lb',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000021',
  'lobster_tail',
  'c1000000-0000-4000-a000-000000000021',
  'shellfish',
  'Lobster Tail',
  'lobster',
  'tail',
  'tail',
  'not_applicable',
  'not_applicable',
  null,
  'count',
  'specialty',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000022',
  'chicken_eggs_large',
  'c1000000-0000-4000-a000-000000000022',
  'egg',
  'Large Chicken Eggs',
  'chicken',
  'whole_egg',
  'shell_egg',
  'not_applicable',
  'not_applicable',
  null,
  'count',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000023',
  'paneer',
  'c1000000-0000-4000-a000-000000000023',
  'paneer',
  'Paneer',
  null,
  null,
  'block',
  'not_applicable',
  'not_applicable',
  null,
  'oz',
  'commonly_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000024',
  'tofu_extra_firm',
  'c1000000-0000-4000-a000-000000000024',
  'tofu',
  'Extra-Firm Tofu',
  null,
  null,
  'extra_firm_block',
  'not_applicable',
  'not_applicable',
  null,
  'package',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000025',
  'chickpeas_canned',
  'c1000000-0000-4000-a000-000000000025',
  'legume',
  'Canned Chickpeas',
  null,
  null,
  'canned_drained',
  'not_applicable',
  'not_applicable',
  null,
  'package',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.protein_products (
  id, canonical_key, ingredient_id, protein_family, display_name, species, cut, form,
  bone_state, skin_state, fat_descriptor, typical_purchase_unit, availability_class,
  active, created_at, updated_at
) values (
  'c2000000-0000-4000-a000-000000000026',
  'lentils_cooked',
  'c1000000-0000-4000-a000-000000000026',
  'legume',
  'Cooked Lentils',
  null,
  null,
  'cooked',
  'not_applicable',
  'not_applicable',
  null,
  'oz',
  'widely_available',
  true,
  '2026-09-19T00:00:00.000Z',
  '2026-09-19T00:00:00.000Z'
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
  updated_at = excluded.updated_at;

insert into public.ingredient_aliases (
  id, ingredient_id, normalized_alias, display_alias
) values (
  'c3000000-0000-4000-a000-000000000001',
  'c1000000-0000-4000-a000-000000000010',
  'ribeye',
  'ribeye'
)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  display_alias = excluded.display_alias;

insert into public.ingredient_aliases (
  id, ingredient_id, normalized_alias, display_alias
) values (
  'c3000000-0000-4000-a000-000000000002',
  'c1000000-0000-4000-a000-000000000010',
  'rib eye',
  'rib eye'
)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  display_alias = excluded.display_alias;

insert into public.ingredient_aliases (
  id, ingredient_id, normalized_alias, display_alias
) values (
  'c3000000-0000-4000-a000-000000000003',
  'c1000000-0000-4000-a000-000000000010',
  'ribeye steak',
  'ribeye steak'
)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  display_alias = excluded.display_alias;

insert into public.ingredient_aliases (
  id, ingredient_id, normalized_alias, display_alias
) values (
  'c3000000-0000-4000-a000-000000000004',
  'c1000000-0000-4000-a000-000000000001',
  'boneless skinless chicken breast',
  'boneless skinless chicken breast'
)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  display_alias = excluded.display_alias;

insert into public.ingredient_aliases (
  id, ingredient_id, normalized_alias, display_alias
) values (
  'c3000000-0000-4000-a000-000000000005',
  'c1000000-0000-4000-a000-000000000017',
  'atlantic salmon',
  'atlantic salmon'
)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  display_alias = excluded.display_alias;

insert into public.ingredient_aliases (
  id, ingredient_id, normalized_alias, display_alias
) values (
  'c3000000-0000-4000-a000-000000000006',
  'c1000000-0000-4000-a000-000000000020',
  'peeled deveined shrimp',
  'peeled deveined shrimp'
)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  display_alias = excluded.display_alias;

insert into public.ingredient_aliases (
  id, ingredient_id, normalized_alias, display_alias
) values (
  'c3000000-0000-4000-a000-000000000007',
  'c1000000-0000-4000-a000-000000000024',
  'extra firm tofu',
  'extra firm tofu'
)
on conflict (normalized_alias) do update set
  ingredient_id = excluded.ingredient_id,
  display_alias = excluded.display_alias;

insert into public.retailer_availability_evidence (
  id, ingredient_id, protein_product_id, retailer, confidence, region, product_form,
  source_url, verified_at, notes
) values (
  'c4000000-0000-4000-a000-000000000001',
  null,
  'c2000000-0000-4000-a000-000000000001',
  'costco',
  'likely',
  'US',
  'boneless skinless breast tray',
  null,
  null,
  'Typically stocked in membership warehouse meat cases; not live inventory.'
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
  updated_at = timezone('utc', now());

insert into public.retailer_availability_evidence (
  id, ingredient_id, protein_product_id, retailer, confidence, region, product_form,
  source_url, verified_at, notes
) values (
  'c4000000-0000-4000-a000-000000000002',
  null,
  'c2000000-0000-4000-a000-000000000010',
  'whole_foods',
  'likely',
  'US',
  'ribeye steak',
  null,
  null,
  'Commonly offered in butcher case; confidence is not verified.'
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
  updated_at = timezone('utc', now());

insert into public.retailer_availability_evidence (
  id, ingredient_id, protein_product_id, retailer, confidence, region, product_form,
  source_url, verified_at, notes
) values (
  'c4000000-0000-4000-a000-000000000003',
  null,
  'c2000000-0000-4000-a000-000000000007',
  'walmart',
  'likely',
  'US',
  '80/20 ground beef',
  null,
  null,
  null
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
  updated_at = timezone('utc', now());

insert into public.retailer_availability_evidence (
  id, ingredient_id, protein_product_id, retailer, confidence, region, product_form,
  source_url, verified_at, notes
) values (
  'c4000000-0000-4000-a000-000000000004',
  null,
  'c2000000-0000-4000-a000-000000000017',
  'trader_joes',
  'likely',
  'US',
  'atlantic salmon fillet',
  null,
  null,
  null
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
  updated_at = timezone('utc', now());

insert into public.retailer_availability_evidence (
  id, ingredient_id, protein_product_id, retailer, confidence, region, product_form,
  source_url, verified_at, notes
) values (
  'c4000000-0000-4000-a000-000000000005',
  null,
  'c2000000-0000-4000-a000-000000000021',
  'whole_foods',
  'unknown',
  'US',
  'lobster tail',
  null,
  null,
  'Specialty seafood; coverage varies by store.'
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
  updated_at = timezone('utc', now());

insert into public.retailer_availability_evidence (
  id, ingredient_id, protein_product_id, retailer, confidence, region, product_form,
  source_url, verified_at, notes
) values (
  'c4000000-0000-4000-a000-000000000006',
  null,
  'c2000000-0000-4000-a000-000000000024',
  'trader_joes',
  'verified',
  'US',
  'extra firm tofu',
  'https://www.traderjoes.com/home/products/pdp/organic-sprouted-tofu-extra-firm-072169',
  '2026-03-01T12:00:00.000Z',
  'Product page evidence for a specific tofu form — not a homepage.'
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
  updated_at = timezone('utc', now());

insert into public.ingredient_substitutions (
  id, source_ingredient_id, substitute_ingredient_id, compatibility, notes, approved
) values (
  'c5000000-0000-4000-a000-000000000001',
  'c1000000-0000-4000-a000-000000000019',
  'c1000000-0000-4000-a000-000000000018',
  'recipe_dependent',
  'Mild white fish swap may work in some preparations; not automatic.',
  true
)
on conflict (id) do update set
  source_ingredient_id = excluded.source_ingredient_id,
  substitute_ingredient_id = excluded.substitute_ingredient_id,
  compatibility = excluded.compatibility,
  notes = excluded.notes,
  approved = excluded.approved,
  updated_at = timezone('utc', now());
