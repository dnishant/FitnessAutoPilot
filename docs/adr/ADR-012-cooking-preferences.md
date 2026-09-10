# ADR-012: Cooking and meal-prep preference intent on the user profile

## Status

Accepted

## Context

PLAN-001 already stores food preference intent, including `variety_level`, on `user_profiles`. The future weekly planner also needs cooking and meal-prep preferences: how often someone preps, how long a session can last, how ready meals should be during the week, how long a fresh finish may take, and whether dinner prep can help a different next-day lunch.

These are preferences, not planner rules. Exact prep days, leftover enforcement, flavor similarity, recipes, and weekly generation remain out of scope.

Existing profile columns `meal_prep_availability`, `cooking_skill`, and `max_meal_prep_minutes` are generic leftovers and are not a PLAN-002 catalog.

## Decision

- Extend `user_profiles` rather than adding a competing cooking-preferences table. `user_id` remains the one current profile per user.
- Add `prep_frequency`, `max_prep_session_minutes`, `cooking_style`, `max_finish_minutes`, `use_dinner_prep_for_next_lunch`, and `cooking_preferences_completed_at`.
- Keep option catalogs in contracts (`PREP_FREQUENCY_OPTIONS`, `PREP_SESSION_TIME_OPTIONS`, `WEEKLY_COOKING_STYLE_OPTIONS`, `FINISH_TIME_OPTIONS`) so UI and validation share one source.
- Default in domain logic to once weekly, 90 minutes, ready lunches + quick fresh dinners, 10-minute finish, and dinner prep helping lunch.
- Normalize `mostly_ready` to `max_finish_minutes = 0` and `use_dinner_prep_for_next_lunch = false`. Hide those questions in the UI.
- Gate completion on `cooking_preferences_completed_at`, not database defaults, so pre-PLAN-002 users are asked for preferences.
- Do not convert `variety_level` into recipe, leftover, or cuisine counts.
- Existing `user_profiles` RLS (`auth.uid() = user_id`) covers these columns.

## Consequences

- Saving preferences updates the same profile row (`created_at` stays, `updated_at` moves).
- Future lunch strategies (`independent_meal_prep`, `piggyback_prep`, `direct_leftover`) and `MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK = 1` are documented only.
- Flavor-similarity modeling is documented only: reuse prep work aggressively, but repeat finished flavor experiences sparingly.
- Weekly planning, recipes, leftover tracking, and LLM calls remain out of scope.
