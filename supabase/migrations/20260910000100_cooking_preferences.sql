-- PLAN-002: cooking and meal-prep preference intent on the existing user-owned profile.
-- One current preference profile per user (user_profiles.user_id is the PK).
-- Does not reuse meal_prep_availability, cooking_skill, or max_meal_prep_minutes.

alter table public.user_profiles
  add column if not exists prep_frequency text,
  add column if not exists max_prep_session_minutes integer,
  add column if not exists cooking_style text,
  add column if not exists max_finish_minutes integer,
  add column if not exists use_dinner_prep_for_next_lunch boolean,
  add column if not exists cooking_preferences_completed_at timestamptz;

alter table public.user_profiles
  drop constraint if exists user_profiles_prep_frequency_chk,
  drop constraint if exists user_profiles_max_prep_session_minutes_chk,
  drop constraint if exists user_profiles_cooking_style_chk,
  drop constraint if exists user_profiles_max_finish_minutes_chk,
  drop constraint if exists user_profiles_cooking_preferences_consistency_chk;

alter table public.user_profiles
  add constraint user_profiles_prep_frequency_chk
  check (prep_frequency is null or prep_frequency in ('once_weekly', 'twice_weekly', 'throughout_week'));

alter table public.user_profiles
  add constraint user_profiles_max_prep_session_minutes_chk
  check (
    max_prep_session_minutes is null
    or max_prep_session_minutes in (45, 60, 90, 120)
  );

alter table public.user_profiles
  add constraint user_profiles_cooking_style_chk
  check (
    cooking_style is null
    or cooking_style in ('mostly_ready', 'ready_lunch_fresh_dinner', 'fresh_focused')
  );

alter table public.user_profiles
  add constraint user_profiles_max_finish_minutes_chk
  check (max_finish_minutes is null or max_finish_minutes in (0, 5, 10, 15, 20));

alter table public.user_profiles
  add constraint user_profiles_cooking_preferences_consistency_chk
  check (
    cooking_preferences_completed_at is null
    or (
      prep_frequency is not null
      and cooking_style is not null
      and max_finish_minutes is not null
      and use_dinner_prep_for_next_lunch is not null
      and (
        (
          cooking_style = 'mostly_ready'
          and max_finish_minutes = 0
          and use_dinner_prep_for_next_lunch = false
        )
        or (
          cooking_style in ('ready_lunch_fresh_dinner', 'fresh_focused')
          and max_finish_minutes in (5, 10, 15, 20)
        )
      )
    )
  );

comment on column public.user_profiles.prep_frequency is
  'PLAN-002 intent: once_weekly, twice_weekly, or throughout_week. Exact prep days are not collected.';
comment on column public.user_profiles.max_prep_session_minutes is
  'Per-session prep time in minutes (45, 60, 90, 120) or null for Flexible. Null is also used before completion.';
comment on column public.user_profiles.cooking_style is
  'Weekly cooking-style intent. Preferences, not rigid planner rules.';
comment on column public.user_profiles.max_finish_minutes is
  'Fresh-finish minutes (5/10/15/20). Persisted as 0 when cooking_style is mostly_ready.';
comment on column public.user_profiles.use_dinner_prep_for_next_lunch is
  'Whether dinner prep may help a different next-day lunch. False when mostly_ready. Does not mean leftovers by default.';
comment on column public.user_profiles.cooking_preferences_completed_at is
  'Set when the user finishes cooking-preference onboarding or later edits. Null means the step is incomplete.';

-- Future planner semantics (documented only; not implemented or stored):
-- LunchPreparationStrategy = independent_meal_prep | piggyback_prep | direct_leftover
-- MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK = 1
-- Flavor principle: reuse prep work aggressively; repeat finished flavor experiences sparingly.

-- Existing user_profiles RLS already scopes select/insert/update to auth.uid() = user_id.
-- Cooking preference columns inherit that ownership boundary.
