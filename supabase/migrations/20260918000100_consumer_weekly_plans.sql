-- Consumer weekly plans (Generate My Plan output).
-- Append-only history: each generation inserts a new row; never overwrite WHAT WE RECOMMENDED.

create table if not exists public.consumer_weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generated_plan_id text not null,
  week_start date not null,
  week_end date not null,
  status text not null check (status in ('idle', 'generating', 'ready', 'failed')),
  plan_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint consumer_weekly_plans_user_generated_unique unique (user_id, generated_plan_id)
);

create index if not exists consumer_weekly_plans_user_created_idx
  on public.consumer_weekly_plans (user_id, created_at desc);

create index if not exists consumer_weekly_plans_user_week_idx
  on public.consumer_weekly_plans (user_id, week_start desc);

comment on table public.consumer_weekly_plans is
  'Persisted ConsumerWeeklyPlan snapshots from Generate My Plan. Append-only per generation.';
comment on column public.consumer_weekly_plans.plan_json is
  'Full ConsumerWeeklyPlan contract JSON (strategy, recipes, meals, personalized nutrition).';
comment on column public.consumer_weekly_plans.generated_plan_id is
  'Client/domain generation id; stable prescription key for this run.';

alter table public.consumer_weekly_plans enable row level security;

create policy consumer_weekly_plans_select_own
  on public.consumer_weekly_plans
  for select
  using (auth.uid() = user_id);

create policy consumer_weekly_plans_insert_own
  on public.consumer_weekly_plans
  for insert
  with check (auth.uid() = user_id);

-- No update/delete policies: historical prescriptions must not be silently mutated.
