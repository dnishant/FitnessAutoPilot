-- Fitness Autopilot initial schema + RLS
-- UUID identifiers; user-owned tables enforce auth.uid() = user_id

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- Catalog: foods
create table public.foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  source text not null,
  source_food_id text,
  calories_per_100g numeric not null check (calories_per_100g >= 0),
  protein_g_per_100g numeric not null check (protein_g_per_100g >= 0),
  carbs_g_per_100g numeric not null check (carbs_g_per_100g >= 0),
  fat_g_per_100g numeric not null check (fat_g_per_100g >= 0),
  dietary_tags text[] not null default '{}',
  allergen_tags text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger foods_set_updated_at
before update on public.foods
for each row execute function public.set_updated_at();

-- Catalog: recipes (versioned templates)
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  recipe_key text not null,
  version integer not null check (version > 0),
  name text not null,
  description text not null default '',
  meal_types text[] not null,
  cuisine_tags text[] not null default '{}',
  dietary_tags text[] not null default '{}',
  base_servings numeric not null check (base_servings > 0),
  prep_minutes integer not null check (prep_minutes >= 0),
  cook_minutes integer not null check (cook_minutes >= 0),
  instructions text[] not null,
  cooking_equipment text[] not null default '{}',
  storage_instructions text,
  reheating_instructions text,
  status text not null check (status in ('active', 'deprecated')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (recipe_key, version)
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  food_id uuid not null references public.foods (id),
  base_quantity_g numeric not null check (base_quantity_g > 0),
  role text not null check (role in ('protein', 'carbohydrate', 'fat', 'vegetable', 'sauce', 'seasoning', 'other')),
  scalable boolean not null default false,
  min_multiplier numeric check (min_multiplier is null or min_multiplier > 0),
  max_multiplier numeric check (max_multiplier is null or max_multiplier > 0),
  preparation_note text,
  sort_order integer not null default 0 check (sort_order >= 0)
);

-- User-owned
create table public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  date_of_birth date not null,
  biological_sex text not null check (biological_sex in ('female', 'male', 'other')),
  height_cm numeric not null check (height_cm > 0 and height_cm <= 300),
  weight_kg numeric not null check (weight_kg > 0 and weight_kg <= 500),
  fitness_experience text not null,
  dietary_preference text not null,
  cuisine_preferences text[] not null default '{}',
  allergies text[] not null default '{}',
  disliked_foods text[] not null default '{}',
  preferred_foods text[] not null default '{}',
  typical_eating_habits text,
  meal_prep_availability text not null,
  cooking_skill text not null,
  cooking_equipment text[] not null default '{}',
  max_meal_prep_minutes integer not null check (max_meal_prep_minutes >= 0),
  safety_restrictions text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_type text not null check (goal_type in ('fat_loss', 'muscle_gain', 'recomposition', 'general_fitness')),
  start_date date not null,
  target_weight_kg numeric check (target_weight_kg is null or (target_weight_kg > 0 and target_weight_kg <= 500)),
  target_date date,
  desired_rate_kg_per_week numeric,
  status text not null check (status in ('active', 'completed', 'cancelled', 'superseded')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id),
  estimated_maintenance_calories integer not null check (estimated_maintenance_calories > 0),
  target_calories integer not null check (target_calories > 0),
  protein_g numeric not null check (protein_g >= 0),
  fat_min_g numeric not null check (fat_min_g >= 0),
  fat_max_g numeric not null check (fat_max_g >= 0),
  carbohydrate_g numeric not null check (carbohydrate_g >= 0),
  desired_rate_kg_per_week numeric not null,
  algorithm_name text not null,
  algorithm_version text not null,
  input_snapshot jsonb not null,
  valid_from timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  nutrition_target_id uuid not null references public.nutrition_targets (id),
  plan_date date not null,
  planned_calories integer not null check (planned_calories >= 0),
  planned_protein_g numeric not null check (planned_protein_g >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, plan_date, created_at)
);

create table public.meal_instances (
  id uuid primary key default gen_random_uuid(),
  daily_plan_id uuid not null references public.daily_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id),
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner')),
  portion_multiplier numeric not null default 1 check (portion_multiplier > 0),
  planned_calories integer not null check (planned_calories >= 0),
  planned_protein_g numeric not null check (planned_protein_g >= 0),
  planned_carbs_g numeric not null check (planned_carbs_g >= 0),
  planned_fat_g numeric not null check (planned_fat_g >= 0),
  ingredient_snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

-- Indexes
create index goals_user_id_idx on public.goals (user_id);
create index nutrition_targets_user_id_idx on public.nutrition_targets (user_id);
create index daily_plans_user_id_idx on public.daily_plans (user_id);
create index meal_instances_user_id_idx on public.meal_instances (user_id);
create index meal_instances_daily_plan_id_idx on public.meal_instances (daily_plan_id);
create index recipe_ingredients_recipe_id_idx on public.recipe_ingredients (recipe_id);

-- RLS
alter table public.user_profiles enable row level security;
alter table public.goals enable row level security;
alter table public.nutrition_targets enable row level security;
alter table public.daily_plans enable row level security;
alter table public.meal_instances enable row level security;
alter table public.foods enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;

-- User-owned policies
create policy user_profiles_select_own on public.user_profiles
  for select using (auth.uid() = user_id);
create policy user_profiles_insert_own on public.user_profiles
  for insert with check (auth.uid() = user_id);
create policy user_profiles_update_own on public.user_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy goals_select_own on public.goals
  for select using (auth.uid() = user_id);
create policy goals_insert_own on public.goals
  for insert with check (auth.uid() = user_id);
create policy goals_update_own on public.goals
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy nutrition_targets_select_own on public.nutrition_targets
  for select using (auth.uid() = user_id);
create policy nutrition_targets_insert_own on public.nutrition_targets
  for insert with check (auth.uid() = user_id);

create policy daily_plans_select_own on public.daily_plans
  for select using (auth.uid() = user_id);
create policy daily_plans_insert_own on public.daily_plans
  for insert with check (auth.uid() = user_id);

create policy meal_instances_select_own on public.meal_instances
  for select using (auth.uid() = user_id);
create policy meal_instances_insert_own on public.meal_instances
  for insert with check (auth.uid() = user_id);

-- Catalog: authenticated read; writes via service role / migrations only
create policy foods_select_authenticated on public.foods
  for select to authenticated using (true);
create policy recipes_select_authenticated on public.recipes
  for select to authenticated using (true);
create policy recipe_ingredients_select_authenticated on public.recipe_ingredients
  for select to authenticated using (true);
