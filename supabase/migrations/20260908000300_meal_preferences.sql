-- PLAN-001: meal preference intent on the existing user-owned profile.
-- One current preference profile per user (user_profiles.user_id is the PK).
-- Reuses cuisine_preferences, allergies, and disliked_foods.
-- Does not overload dietary_preference (omnivore/vegetarian/...) or preferred_foods.

alter table public.user_profiles
  add column if not exists protein_preferences text[] not null default '{}',
  add column if not exists dietary_restrictions text[] not null default '{}',
  add column if not exists experience_preferences text[] not null default '{}',
  add column if not exists variety_level text,
  add column if not exists meal_preferences_completed_at timestamptz;

alter table public.user_profiles
  drop constraint if exists user_profiles_variety_level_chk;

alter table public.user_profiles
  add constraint user_profiles_variety_level_chk
  check (variety_level is null or variety_level in ('simple', 'balanced', 'high'));

comment on column public.user_profiles.cuisine_preferences is
  'Positive cuisine signals, including surprise_me. Empty means no explicit preference.';
comment on column public.user_profiles.protein_preferences is
  'Positive protein signals. Omitting a protein is not a refusal.';
comment on column public.user_profiles.allergies is
  'Hard safety exclusions. Kept separate from dietary restrictions and dislikes.';
comment on column public.user_profiles.dietary_restrictions is
  'Hard planning exclusions (for example pork). Not the dietary_preference enum.';
comment on column public.user_profiles.disliked_foods is
  'Strong negative preference signals. Not a hard safety exclusion.';
comment on column public.user_profiles.experience_preferences is
  'Soft ranking signals for meal style (saucy, crispy, fresh, ...).';
comment on column public.user_profiles.variety_level is
  'Future weekly-planning intent: simple, balanced, or high. Null until meal preferences are completed.';
comment on column public.user_profiles.meal_preferences_completed_at is
  'Set when the user finishes meal-preference onboarding or later edits. Null means the step is incomplete.';

-- Existing user_profiles RLS already scopes select/insert/update to auth.uid() = user_id.
-- Meal preference columns inherit that ownership boundary.
