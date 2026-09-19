# ADR-028: Ingredient economy as a first-class weekly planning objective

## Status

Accepted — 2026-09-19

## Context

Production PLAN-012 grocery lists exposed weeks that were culinarily valid but
operationally terrible: ~80–100 distinct grocery rows, many specialty one-offs, and
fractional perishable quantities used once. PLAN-012 is a deterministic accountant —
hiding ingredients in the UI would not fix the upstream plan.

Detailed recipes resolve only for the selected weekly repertoire (efficiency), so the
planner cannot know exact grocery demand during initial strategy selection.

## Decision

1. **Two-stage ingredient economy**
   - **Stage A (predictive):** Culinary Meal Architect / heuristic
     `MealConcept.ingredientFootprint` provides lightweight planning metadata.
   - **Stage B (exact):** After selected recipe resolution, measure weighted grocery
     complexity (`grocery-complexity-policy-v1`) and attempt bounded repertoire repair
     when the week is `excessive`.

2. **Soft objectives, hard variety protection**
   - Reward ingredient reuse across distinct meal forms/cuisines.
   - Soft-penalize one-off specialty and high-waste perishables.
   - Pantry staples contribute near-zero burden.
  - Soft unique-candidate guidance remains for lunch/dinner split diagnostics, but
    the **hard unique-meal count is fixed at 4** (V1 meal-prep). Efficiency must not
    collapse the week below four distinct core meals; variety no longer expands the
    repertoire size — it only changes diversity/overlap pressure between those four.
   - Stage B soft-band (`excessive`) triggers bounded repair. After repair exhausts,
     generation **soft-accepts** non-pathological weeks (diagnostics retained) and
     hard-fails only above an absolute ceiling (~90 unique / specialty-heavy baskets).

3. **PLAN-012 stays accountant-only**
   - Improves semantic canonicalization, categories, display ceilings, and unit/identity
     validation (`grocery-aggregation-policy-v2`).
   - Does not drop specialty ingredients or replace meals to beautify the list.

4. **Future carryover**
   - Leftover disposition metadata is planning-only for now.
   - Grocery checklist completion must not destroy continuity needed for a future
     pantry/carryover planner.

## Consequences

- Weekly strategy prompt `weekly-strategy-ranked-v1.5.0` aligns with V1 four-meal shape
  (ADR-029). Ingredient-economy scoring is first-class in repertoire selection.
  Soft unique guidance remains for lunch/dinner diagnostics; hard unique count is 4.
- Generate My Plan may replace high-burden selected meals after recipe resolution.
- Diagnostics report weighted complexity / one-off counts for production tuning.
