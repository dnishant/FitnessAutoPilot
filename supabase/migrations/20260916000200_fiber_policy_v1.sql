-- PLAN-009.5: daily fiber target (fiber-policy-v1) on nutrition_targets.
-- Append-only: historical rows keep fiber_g null until a new target is written.

alter table public.nutrition_targets
  add column if not exists fiber_g numeric check (fiber_g is null or fiber_g >= 0),
  add column if not exists fiber_policy_name text check (
    fiber_policy_name is null or fiber_policy_name = 'fiber-policy'
  ),
  add column if not exists fiber_policy_version text check (
    fiber_policy_version is null or fiber_policy_version = 'fiber-policy-v1'
  );

comment on column public.nutrition_targets.fiber_g is
  'Daily fiber target from fiber-policy-v1 (~14 g / 1000 kcal). Not a per-meal quota.';
comment on column public.nutrition_targets.fiber_policy_version is
  'Append-only fiber policy version. Older nutrition_targets rows may omit fiber.';
