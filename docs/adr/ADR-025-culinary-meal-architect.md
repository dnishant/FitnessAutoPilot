# ADR-025: Culinary Meal Architect + nutrition ownership

## Status

Accepted

## Context

PLAN-010 personalization correctly summed the components it received, but upstream meal composition often handed it malformed plates:

- Dish-name heuristics invented placeholders (`bowl base`, `bowl vegetables`, taco tortilla/slaw stubs).
- Complete composite recipes were embellished with redundant companions.
- Intrinsic substructure was counted independently alongside whole-recipe nutrition.
- Semantic duplicates of recommended sides survived (e.g. arugula salad variants).
- Role-structural estimate fallbacks attached invented macros to unresolved placeholders.

Composition still thought in “fill missing roles” terms (`meal-composition-v2`).

## Decision

1. **Culinary Meal Architect (`meal-composition-v3`)**  
   One structured LLM call understands the dish before proposing additions. Zero additions is first-class. Nutrition targets never drive additions.

2. **`MealUnderstanding` is required** on every proposal, with meal form, standalone judgment, existing components, satisfied/missing culinary needs, and confidence.

3. **Nutrition ownership** on every `CompleteMealComponent`:
   - `independent` — counted by PLAN-010
   - `parent_owned` — informational (recipe/prep/display only)

   Parent-owned composite XOR independent children — never both for the same food.

4. **Remove dish-format placeholder heuristics** from candidate role detection. Only real recipe/mealComponent structure informs intrinsic companions.

5. **Deterministic structural validation** after the LLM:
   - reject placeholders
   - reject semantic duplicate sides
   - reject low-confidence / contradictory understanding (one retry with feedback, then typed failure)

6. **PLAN-010 boundary unchanged** except inputs: skip `parent_owned`, block placeholders, do not invent role-structural macros for unknown required sides. Main-recipe coefficients still prefer validated `ResolvedRecipe.nutrition` (`llm_estimate`) per ADR-024; USDA remains optional verification.

7. **Consumer Your Meal UI** lists independent nutritional owners only; intrinsic substructure belongs on Recipe Detail.

## Consequences

- Prompt/policy versions: `meal-composition-v3` / `meal-composition-v2`.
- Historical plans keep their stored semantics; fresh generation uses the new path.
- Required companions without trusted nutrition block the meal rather than inventing macros.
- Novel/unseen recipes are tested via invariants, not production dish-name allowlists.
