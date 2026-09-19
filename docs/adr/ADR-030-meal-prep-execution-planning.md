# ADR-030: Guided meal-prep execution (PLAN-013)

## Status

Accepted — 2026-09-19 (revised for just-in-time guided steps)

## Context

After PLAN-011 finalizes a personalized weekly nutrition plan and PLAN-012 derives
grocery demand, consumers need an executable kitchen session. Concatenating four
recipe lists — or forcing a global Mise en Place phase — fails the product promise:
“what should I do next?”

## Decision

1. **Consumer UX:** One ordered guided sequence (Step 1 → N → Done). No consumer-facing
   Mise en Place / Marinades / Cook tabs as required workflow.
2. **Just-in-time prep:** Ingredient preparation lives inside the step that uses it
   (or an immediately preceding marinate/cook step). Distant garnish prep is not
   front-loaded.
3. **Nearby consolidation only:** Identical prep (same food + cut) across nearby steps
   may share a “prep once / set aside” note. Different cuts are never merged. Global
   session-wide mise consolidation is removed.
4. **Source of truth:** Finalized personal servings, resolved recipes, core repertoire,
   cooking preferences, grocery list (soft reconciliation). Quantities always scale
   from recipe ingredients — never LLM invention.
5. **Tasks (domain):** `advance_prep` (incl. marinades), `cook`, `portion_and_store`,
   `fresh_finish`. Legacy `mise_en_place` is not emitted.
6. **Scheduling:** Deterministic DAG with passive-time overlap, oven compatibility,
   max one attention-heavy active task. Prefer clarity over minimum elapsed time.
7. **Storage + future actions:** Portion dispositions + thaw/finish/reheat for PLAN-014.
8. **Progress:** Client AsyncStorage keyed by `generatedPlanId` (current step + completed).
9. **Policy versions:** `meal-prep-policy-v1`, `culinary-prep-interpretation-v1` (JIT
   semantics within the same culinary interpretation stamp).

## Consequences

- Meal Prep overview → Start → current step (Get out / Do this / background) → complete.
- Regenerating a week creates a new prep plan; stale progress keys do not attach.
- PLAN-014 consumes `futureActions` without owning prep generation.
