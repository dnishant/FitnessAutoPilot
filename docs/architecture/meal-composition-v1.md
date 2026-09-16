# Meal composition v1 (pipeline split)

## Role

Describe the **complete lunch or dinner plate** for a ranked candidate, then resolve detailed component recipes only for meals that actually make the week.

```
PLAN-005 Culinary Discovery
        ↓
PLAN-006 Ranking + Dedup
        ↓
Lightweight meal composition (`meal-composition-v2`)
        ↓
PLAN-007 / 007.1 Weekly strategy
        ↓
PLAN-008 Detailed main recipes (selected only)
        ↓
Selected component recipe resolution (`component-recipe-v1`)
        ↓
PLAN-009 Canonical USDA nutrition
        ↓
future PLAN-010 Portion solver
```

Composition answers: *What belongs on this plate?*  
It does **not** answer: *How is each side cooked, what USDA food is it, or how many grams should this user eat?*

Policy version remains `meal-composition-v1`. Prompt version is `meal-composition-v2`.

## Responsibility split

| Layer | Owns |
| --- | --- |
| PLAN-005 / 006 | Ranked main-dish candidates |
| Lightweight composition | Complete-meal *concept* (names, roles, intrinsic vs added) |
| PLAN-007 / 007.1 | Weekly selection + scheduling from composed plates |
| PLAN-008 | Detailed main recipes for selected candidates |
| Selected component resolution | Compound side recipes + atomic staple identities (PLAN-009.5 HOW path) |
| PLAN-009 | Canonical USDA nutrition for selected detailed recipes |
| PLAN-010 | Personalized quantities / solver bounds |

## What vs how

`MealConcept` is the idea of the plate:

```
Chicken Tikka + Basmati Rice + Kachumber + Mint Yogurt Chutney
```

It contains no ingredient quantities, instructions, USDA foods, nutrition, or personalized portions.

`CompleteMeal` is the selected-only detailed result: main recipe + resolved component definitions. Compound sides (kachumber, chutney, thoran) get structured recipes; atomic staples (basmati rice) stay identity-only until the portion solver.

Intrinsic components already present on the candidate (taco tortillas + slaw + salsa; curry vegetables in the sauce) are preserved. The engine must not add a second carb, vegetable, or sauce when those roles are already covered.

## Policy versions

| Policy | Version |
| --- | --- |
| Meal composition | `meal-composition-v1` |
| Lightweight composition prompt | `meal-composition-v2` |
| Component recipe prompt | `component-recipe-v1` |
| Fiber target | `fiber-policy-v1` (~14 g / 1000 kcal daily) |
| Weekly strategy prompt | `weekly-strategy-ranked-v1.3.0` |

## Key types

- `MealConcept` / `MealConceptComponent` — lightweight complete plate
- `CompleteMeal` / `CompleteMealComponent` — selected detailed plate (distinct from `ResolvedRecipe`)
- `MealCompositionProvider` — culinary concept proposal only
- `ComponentRecipeProvider` — selected-only side/sauce recipes
- `ComponentDefinition` — `atomic_food` \| `recipe_component` (no fake USDA compounds)

## Weekly strategy

PLAN-007 receives `mealConceptsByCandidateId`. Unique ranked candidates are composed once (bounded concurrency). The planner uses plate composition for variety, flavor similarity, prep complexity, and component reuse.

Ingredient/component reuse is **not** meal repetition. Chicken Tikka and Kerala Beef Fry may share basmati rice while remaining distinct culinary experiences. Reuse is a positive prep-efficiency signal when culinary fit remains good; it is not forced merely because names match.

Component explosion (many unique sides with little reuse) is a diagnostic `componentComplexitySignal` (`compact_reusable` \| `mixed` \| `high_unique_sides`). It is not a rigid numeric quota.

## Fiber

Daily fiber is derived deterministically from the calorie target (`fiber-policy-v1`).  
It is **not** a per-meal quota. Lightweight composition may notice a vegetable/fiber *opportunity*; trusted fiber grams remain downstream.

## Edge / preview

- Edge Function: `compose-meals`
  - `stage=concepts` — unique ranked candidates → `MealConcept`
  - `stage=selected_resolution` — selected concepts → `CompleteMeal`
- Uses the same CORS + in-function JWT pattern as `resolve-recipes` (`serveWithCors`, `verify_jwt = false` in `config.toml`)
- Deploy before using the hosted preview:

```bash
pnpm sync:edge
npx supabase functions deploy compose-meals --project-ref <project-ref>
# GEMINI_API_KEY must already be set on that project (same as resolve-recipes)
```

Confirm `EXPO_PUBLIC_SUPABASE_URL` points at that same project (`https://<project-ref>.supabase.co`).

- Dev CLI: `pnpm compose:meals:dev`
- Mobile preview: `/meal-composition-preview`
  - Local planner (`EXPO_PUBLIC_USE_LOCAL_PLANNER=true`) uses `MockMealCompositionProvider` (no Edge call)
  - Remote mode calls hosted `compose-meals` with `stage=concepts`
- Weekly strategy preview composes unique ranked plates, then calls PLAN-007

## Concurrency

Default composition concurrency: `2`. Unique ranked candidates only — a repeated candidate is composed once.
