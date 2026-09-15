# Cooking preferences v1

PLAN-002 captures cooking and meal-prep **intent** after PLAN-001 food preferences. It does not generate meals, leftovers, or prep schedules.

## Signals

| Field | Semantics |
| --- | --- |
| `prep_frequency` | `once_weekly` / `twice_weekly` / `throughout_week`. Exact prep days are not collected. |
| `max_prep_session_minutes` | Per-session limit: `45`, `60`, `90`, `120`, or `null` (Flexible). For two weekly sessions this is per session, not a weekly total. |
| `cooking_style` | `mostly_ready` / `ready_lunch_fresh_dinner` / `fresh_focused`. Preferences, not rigid rules. |
| `max_finish_minutes` | Fresh finish: `5` / `10` / `15` / `20`. Persisted as `0` when `cooking_style` is `mostly_ready`. |
| `use_dinner_prep_for_next_lunch` | **Deprecated (PLAN-008).** Ignored by planning. Retained for DB compatibility. Fresh styles persist `true`; `mostly_ready` persists `false`. |

Empty or omitted fields receive domain defaults before validation. Option values live in `@fitness-autopilot/contracts`.

`variety_level` from PLAN-001 stays `simple` / `balanced` / `high` intent. It is not converted into recipe, leftover, or cuisine counts here.

## Persistence

One current record per user on `user_profiles`. Completion is `cooking_preferences_completed_at IS NOT NULL`. Cooking columns are not defaulted in the database so incomplete users are not skipped.

## Planner semantics (PLAN-007 / PLAN-008)

PLAN-007 implements lunch preparation strategy on weekly lunch slots as an **output decision**, not a user preference:

```ts
type LunchPreparationStrategy =
  | "independent_meal_prep"
  | "piggyback_prep"
  | "direct_leftover";

const MAX_DIRECT_LEFTOVER_LUNCHES_PER_WEEK = 1;
```

- `independent_meal_prep`: lunch made during the main prep session (default).
- `piggyback_prep`: a different lunch prepared partly while another meal is being made — only with strong shared-prep evidence.
- `direct_leftover`: essentially the same dinner eaten as a later lunch (rare).

Shared prep reuse across the week is always an automatic optimization opportunity. Users are not asked whether dinner prep may help lunch.

### Flavor principle

Reuse prep work aggressively, but repeat finished flavor experiences sparingly. Changing protein alone does not create meaningful variety:

- chicken tikka → paneer tikka = potentially very similar
- fajitas → fajita bowl = very similar
- chicken tikka → Thai basil chicken = meaningfully different

A later planner may consider cuisine family, sauce/flavor family, seasoning profile, cooking method, texture, moisture, and neighboring-meal similarity.

### Combined future inputs

A later planner may combine nutrition targets + food preferences + variety + prep frequency + prep time + cooking style + finish time + automatic shared-prep opportunities. Example for Balanced + one 90-minute prep + ready lunches + 10-minute finish:

- some lunches fully prepared
- some dinners partially prepped then finished fresh
- some different lunches made via piggyback / shared component prep
- at most one direct leftover lunch per week
