# Cooking preferences v1

PLAN-002 captures cooking and meal-prep **intent** after PLAN-001 food preferences. It does not generate meals, leftovers, or prep schedules.

## Signals

| Field | Semantics |
| --- | --- |
| `prep_frequency` | `once_weekly` / `twice_weekly` / `throughout_week`. Exact prep days are not collected. |
| `max_prep_session_minutes` | Per-session limit: `45`, `60`, `90`, `120`, or `null` (Flexible). For two weekly sessions this is per session, not a weekly total. |
| `cooking_style` | `mostly_ready` / `ready_lunch_fresh_dinner` / `fresh_focused`. Preferences, not rigid rules. |
| `max_finish_minutes` | Fresh finish: `5` / `10` / `15` / `20`. Persisted as `0` when `cooking_style` is `mostly_ready`. |
| `use_dinner_prep_for_next_lunch` | Dinner time may help a *different* next-day lunch. Default `true` for fresh styles. Forced `false` for `mostly_ready`. |

Empty or omitted fields receive domain defaults before validation. Option values live in `@fitness-autopilot/contracts`.

`variety_level` from PLAN-001 stays `simple` / `balanced` / `high` intent. It is not converted into recipe, leftover, or cuisine counts here.

## Persistence

One current record per user on `user_profiles`. Completion is `cooking_preferences_completed_at IS NOT NULL`. Cooking columns are not defaulted in the database so incomplete users are not skipped.

## Future planner semantics (document only)

These types and policies are **not implemented** in PLAN-002.

```ts
type LunchPreparationStrategy =
  | "independent_meal_prep"
  | "piggyback_prep"
  | "direct_leftover";

const MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK = 1;
```

- `independent_meal_prep`: lunch made during the main prep session.
- `piggyback_prep`: a different lunch prepared partly while dinner is being made.
- `direct_leftover`: essentially the same dinner eaten as next-day lunch.

Dinner prep helping lunch does **not** mean dinner automatically becomes tomorrow's lunch. A later planner may assemble a different lunch, prepare components for another cuisine, use idle oven or stove time, reuse grains or chopped vegetables, or occasionally use direct leftovers.

### Flavor principle

Reuse prep work aggressively, but repeat finished flavor experiences sparingly. Changing protein alone does not create meaningful variety:

- chicken tikka → paneer tikka = potentially very similar
- fajitas → fajita bowl = very similar
- chicken tikka → Thai basil chicken = meaningfully different

A later planner may consider cuisine family, sauce/flavor family, seasoning profile, cooking method, texture, moisture, and neighboring-meal similarity.

### Combined future inputs

A later planner may combine nutrition targets + food preferences + variety + prep frequency + prep time + cooking style + finish time + `useDinnerPrepForNextLunch`. Example for Balanced + one 90-minute prep + ready lunches + 10-minute finish + dinner prep helping lunch:

- some lunches fully prepared
- some dinners partially prepped then finished fresh
- some different next-day lunches made via piggyback prep
- at most one direct leftover lunch per week
