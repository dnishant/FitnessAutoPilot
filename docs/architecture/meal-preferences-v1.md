# Meal preferences v1

PLAN-001 captures food preference **intent** after nutrition-target onboarding. It does not generate meals.

## Signals

| Field | Semantics |
| --- | --- |
| `cuisine_preferences` | Positive cuisine signals, including `surprise_me` |
| `protein_preferences` | Positive protein signals |
| `experience_preferences` | Soft ranking / meal-style signals |
| `allergies` | Hard safety exclusions |
| `dietary_restrictions` | Hard planning exclusions |
| `disliked_foods` | Strong negative preferences |
| `variety_level` | `simple` / `balanced` / `high` planning intent |

Empty selections are valid. Option values live in `@fitness-autopilot/contracts`.

## Persistence

One current record per user on `user_profiles`. Completion is `meal_preferences_completed_at IS NOT NULL`. Variety is not defaulted in the database so incomplete users are not skipped.
