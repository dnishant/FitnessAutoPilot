-- PLAN-009: Canonical food provenance + ingredient→food mapping cache
-- Shared catalog data (authenticated read; service-role write), not user-owned.

alter table public.foods
  add column if not exists description text,
  add column if not exists fiber_g_per_100g numeric check (fiber_g_per_100g is null or fiber_g_per_100g >= 0),
  add column if not exists data_type text,
  add column if not exists food_category text;

comment on column public.foods.description is
  'Provider food description (e.g. USDA FDC description) for provenance/debug.';
comment on column public.foods.fiber_g_per_100g is
  'Optional fiber per 100g when cleanly available from the provider.';
comment on column public.foods.data_type is
  'Provider data type (e.g. Foundation, SR Legacy, Branded).';
comment on column public.foods.food_category is
  'Provider food category label when available.';

create unique index if not exists foods_source_external_id_uidx
  on public.foods (source, source_food_id)
  where source_food_id is not null;

create table if not exists public.ingredient_food_mappings (
  id uuid primary key default gen_random_uuid(),
  resolution_key text not null,
  normalized_ingredient_name text not null,
  measurement_state text
    check (
      measurement_state is null
      or measurement_state in ('raw', 'cooked', 'as_purchased', 'prepared', 'unknown')
    ),
  food_id uuid not null references public.foods (id),
  confidence text not null check (confidence in ('high', 'medium')),
  resolution_method text not null
    check (resolution_method in ('deterministic', 'semantic_disambiguation', 'manual', 'builtin')),
  policy_version text not null default 'food-resolution-v1',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (resolution_key)
);

create trigger ingredient_food_mappings_set_updated_at
before update on public.ingredient_food_mappings
for each row execute function public.set_updated_at();

alter table public.ingredient_food_mappings enable row level security;

create policy ingredient_food_mappings_select_authenticated
  on public.ingredient_food_mappings
  for select
  to authenticated
  using (true);

comment on table public.ingredient_food_mappings is
  'PLAN-009 cached mappings from normalized culinary ingredient keys to canonical foods.';
