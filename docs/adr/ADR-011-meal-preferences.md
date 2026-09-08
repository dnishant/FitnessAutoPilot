# ADR-011: Meal preference intent on the user profile

## Status

Accepted

## Context

After calorie and macro setup, V1 needs a fast, mostly tap-based capture of food preference intent. Future weekly planning will treat allergies, dietary restrictions, dislikes, and positive signals differently. The profile already stores cuisine preferences, allergies, and disliked foods. `dietary_preference` is an omnivore/vegetarian-style enum, and `preferred_foods` is not a protein catalog.

## Decision

- Extend `user_profiles` rather than adding a competing meal-preferences table. `user_id` remains the one current profile per user.
- Reuse `cuisine_preferences`, `allergies`, and `disliked_foods`.
- Add `protein_preferences`, `dietary_restrictions`, `experience_preferences`, `variety_level`, and `meal_preferences_completed_at`.
- Keep option catalogs in contracts (`CUISINE_OPTIONS`, `PROTEIN_OPTIONS`, `EXPERIENCE_OPTIONS`, `VARIETY_OPTIONS`) so UI and validation share one source.
- Store `variety_level` as `simple | balanced | high` intent only. Do not map it to recipe counts.
- Gate completion on `meal_preferences_completed_at`, not a database default of `balanced`, so pre-PLAN-001 users are asked for preferences.
- Existing `user_profiles` RLS (`auth.uid() = user_id`) covers these columns.

## Consequences

- Saving preferences updates the same profile row (`created_at` stays, `updated_at` moves).
- Empty arrays mean no explicit preference, not “dislike everything else.”
- Weekly planning, recipes, and LLM calls remain out of scope.
