# ADR-029: V1 four-meal / six-day meal-prep product shape

## Status

Accepted — 2026-09-19

## Context

Earlier weekly strategy treated variety as a unique-dish band (Simple 5–7,
Balanced 7–9, High 9–12) across a full 7-day lunch+dinner calendar. That produced
culinarily interesting weeks that were operationally heavy: too many distinct
recipes to prep, weak intentional repetition, and a seventh day that still looked
like a prescribed meal-prep day.

Product V1 is meal-prep first: users should prep a small repertoire once and eat
it across the working week, with one intentionally flexible day.

## Decision

1. **Fixed repertoire size:** exactly **4 core meals** for every variety level.
2. **Fixed covered calendar:** **6 covered days** × lunch + dinner = **12 portions**.
3. **Flexible day:** default **Sunday** — no prescribed lunch/dinner meal-prep nutrition.
4. **Variety reinterpreted:** variety only changes diversity/overlap pressure
   between the four meals (`V1_VARIETY_DIVERSITY_POLICY`), never unique-meal count.
5. **First-class identity:** `CoreMealId` + `coreRepertoire` graph; UI and grocery
   must not infer repeats from matching names.
6. **Selection:** combinatorial four-meal set scoring (`buildV1WeeklyStrategy`)
   replaces LLM whole-week unique-band selection on Generate My Plan.
7. **Complexity policy:** `WEEKLY_VARIETY_COMPLEXITY_POLICY` unique preferred/hard
   bands are all 4 for simple/balanced/high.

## Consequences

- Contracts: `v1-meal-prep.ts`, `RankedWeeklyStrategy.days.length === 6`,
  `uniqueCandidateIds.length === 4`, optional `flexibleDay` / `coreRepertoire`.
- Consumer Plan UI leads with “4 meals · 12 portions · 6 days covered” and
  Flexible Day copy on Sunday.
- Ingredient-economy repair must preserve the 4-meal invariant and rebuild
  `coreRepertoire` / `flexibleDay` after replacements.
- Legacy Gemini 7-day ranked-strategy fixtures/tests remain for the optional
  LLM path and need a follow-up migration; Generate My Plan no longer depends on them.
