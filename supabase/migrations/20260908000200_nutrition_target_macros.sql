-- Extend nutrition_targets for macro-policy-v1 without rewriting historical rows.
-- Older nutrition-target-v1 rows keep fat_min_g / fat_max_g only.

alter table public.nutrition_targets
  add column fat_g numeric check (fat_g is null or fat_g >= 0),
  add column macro_policy_name text check (macro_policy_name is null or macro_policy_name = 'macro-policy'),
  add column macro_policy_version text check (macro_policy_version is null or macro_policy_version = 'macro-policy-v1'),
  add column calorie_target_id uuid references public.calorie_targets (id);

comment on column public.nutrition_targets.fat_g is
  'Single fat target from macro-policy-v1. Older nutrition-target-v1 rows keep fat_min_g/fat_max_g only.';
comment on column public.nutrition_targets.macro_policy_version is
  'Append-only macro breakdown policy. A newer nutrition_targets row may become current; older rows stay.';
