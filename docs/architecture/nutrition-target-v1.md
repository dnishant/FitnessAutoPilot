# nutrition-target-v1 — assumptions

This document states **product policy**, not medical certainty.

Algorithm name/version: `nutrition-target-v1`

## Inputs

From profile + goal:

- biological sex (`female` | `male` | `other` — `other` uses male Mifflin constants as a conservative placeholder; documented limitation)
- date of birth → age in whole years at calculation time
- height (cm), weight (kg)
- fitness experience / activity proxy
- goal type + optional desired rate of weight change (kg/week)
- safety eligibility must be `allowed`

## Steps

1. **BMR** — Mifflin–St Jeor:
   - male: `10*kg + 6.25*cm - 5*age + 5`
   - female: `10*kg + 6.25*cm - 5*age - 161`
2. **TDEE** — BMR × activity multiplier from experience enum (constants in code).
3. **Goal adjustment**
   - `fat_loss`: default −0.5 kg/week → ≈ −550 kcal/day (clamped)
   - `muscle_gain`: default +0.25 kg/week → ≈ +275 kcal/day
   - `recomposition` / `general_fitness`: maintenance (0)
   - Explicit desired rate overrides default within clamps.
4. **Calorie floor/ceiling** — never below 1200 (female) / 1500 (male/other) or above TDEE±1000 in v1.
5. **Protein** — `1.6 g/kg` current body weight, clamped 80–220 g.
6. **Fat** — 20–35% of target calories → gram min/max.
7. **Carbs** — remaining calories after protein + midpoint fat, / 4.
8. Return version string + full input snapshot.

## Safety

If eligibility is restricted, do not emit a target; return `restricted`.

## Non-goals

- Not a clinical TDEE assessment
- No body-fat-adjusted BMR in v1
- No menstrual cycle / adaptive thermogenesis modeling
