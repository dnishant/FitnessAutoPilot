-- V1 RMR onboarding: append-only rmr_estimates + defer unused profile fields.
-- Does not drop existing profile columns or rewrite historical migrations.

-- Planning-only profile fields are no longer required to complete V1 onboarding.
-- Existing rows keep their values. New RMR-only profiles may leave these null.
alter table public.user_profiles
  alter column fitness_experience drop not null,
  alter column dietary_preference drop not null,
  alter column meal_prep_availability drop not null,
  alter column cooking_skill drop not null,
  alter column max_meal_prep_minutes drop not null;

-- Current weight remains user_profiles.weight_kg (conceptual current_weight_kg).
create table public.rmr_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rmr_kcal integer not null check (rmr_kcal > 0),
  source text not null check (source in ('user_reported_dexa', 'estimated_mifflin_st_jeor')),
  algorithm_name text,
  algorithm_version text,
  input_snapshot jsonb,
  reported_or_measured_at date,
  calculated_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint rmr_estimates_estimated_algorithm_chk check (
    (
      source = 'estimated_mifflin_st_jeor'
      and algorithm_name = 'mifflin_st_jeor'
      and algorithm_version = 'rmr-v1'
      and input_snapshot is not null
      and reported_or_measured_at is null
    )
    or (
      source = 'user_reported_dexa'
      and algorithm_name is null
      and algorithm_version is null
      and input_snapshot is null
      and reported_or_measured_at is not null
    )
  )
);

create index rmr_estimates_user_id_calculated_at_idx
  on public.rmr_estimates (user_id, calculated_at desc, created_at desc);

alter table public.rmr_estimates enable row level security;

create policy rmr_estimates_select_own on public.rmr_estimates
  for select using (auth.uid() = user_id);
create policy rmr_estimates_insert_own on public.rmr_estimates
  for insert with check (auth.uid() = user_id);

-- No update/delete policies: history is append-only for authenticated users.
comment on table public.rmr_estimates is
  'Append-only RMR records. A newer row may become current; older rows stay.';
comment on column public.user_profiles.weight_kg is
  'Current body weight in kilograms (conceptual current_weight_kg).';
