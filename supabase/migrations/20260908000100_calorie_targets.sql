-- V1 starting calorie target from goal + pace + TDEE + current weight.
-- Append-only. Does not rewrite historical migrations or add macros.

create table public.calorie_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  tdee_estimate_id uuid not null references public.tdee_estimates (id) on delete cascade,
  tdee_kcal integer not null check (tdee_kcal > 0),
  body_weight_kg numeric not null check (body_weight_kg > 0),
  body_weight_lb numeric not null check (body_weight_lb > 0),
  pace text not null check (pace in ('recommended', 'faster')),
  target_rate_per_week numeric not null,
  target_lb_per_week numeric not null,
  weekly_calorie_adjustment numeric not null,
  daily_calorie_adjustment integer not null,
  target_calories integer not null check (target_calories > 0),
  policy_name text not null check (policy_name = 'weight-change-policy'),
  policy_version text not null check (policy_version = 'weight-change-policy-v1'),
  input_snapshot jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index calorie_targets_user_id_created_at_idx
  on public.calorie_targets (user_id, created_at desc);

alter table public.calorie_targets enable row level security;

create policy calorie_targets_select_own on public.calorie_targets
  for select using (auth.uid() = user_id);
create policy calorie_targets_insert_own on public.calorie_targets
  for insert with check (auth.uid() = user_id);

comment on table public.calorie_targets is
  'Append-only starting calorie targets from weight-change-policy-v1. A newer row may become current; older rows stay.';
