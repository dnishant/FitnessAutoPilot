-- PLAN-008: deprecate use_dinner_prep_for_next_lunch as a user-facing preference.
-- Shared / dinner→lunch / cross-week prep reuse is now an automatic planner optimization.
-- Keep the column for backwards compatibility with existing completed preference rows.
-- Application code ignores the value for planning and writes storage-compat defaults
-- (false for mostly_ready, true for fresh styles) to satisfy the existing consistency check.

comment on column public.user_profiles.use_dinner_prep_for_next_lunch is
  'DEPRECATED (PLAN-008): ignored by planning. Retained for DB compatibility. Shared prep reuse is automatic. False when cooking_style is mostly_ready (storage check); true for fresh styles.';
