-- V1 wearable TDEE: append-only tdee_estimates.
-- Does not drop existing profile/goal columns or rewrite historical migrations.
-- Goals continue to use public.goals (muscle_gain / fat_loss / recomposition).

create table public.tdee_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tdee_kcal integer not null check (tdee_kcal > 0),
  source text not null check (source in ('whoop_daily_calories', 'apple_watch_active_plus_rmr')),
  wearable text not null check (wearable in ('apple_watch', 'whoop')),
  wearable_calories_kcal integer not null check (wearable_calories_kcal > 0),
  rmr_kcal_used integer check (rmr_kcal_used is null or rmr_kcal_used > 0),
  algorithm_name text,
  algorithm_version text,
  input_snapshot jsonb not null,
  calculated_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint tdee_estimates_source_algorithm_chk check (
    (
      source = 'whoop_daily_calories'
      and wearable = 'whoop'
      and algorithm_name is null
      and algorithm_version is null
      and rmr_kcal_used is null
    )
    or (
      source = 'apple_watch_active_plus_rmr'
      and wearable = 'apple_watch'
      and algorithm_name = 'apple_watch_active_plus_rmr'
      and algorithm_version = 'tdee-v1'
      and rmr_kcal_used is not null
    )
  )
);

create index tdee_estimates_user_id_calculated_at_idx
  on public.tdee_estimates (user_id, calculated_at desc, created_at desc);

alter table public.tdee_estimates enable row level security;

create policy tdee_estimates_select_own on public.tdee_estimates
  for select using (auth.uid() = user_id);
create policy tdee_estimates_insert_own on public.tdee_estimates
  for insert with check (auth.uid() = user_id);

-- No update/delete policies: history is append-only for authenticated users.
comment on table public.tdee_estimates is
  'Append-only TDEE records from Whoop daily calories or Apple Watch active calories + RMR.';
