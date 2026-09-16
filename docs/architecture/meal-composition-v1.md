# Meal composition v1 (PLAN-009.5)

## Role

Turn a PLAN-008 `ResolvedRecipe` (+ optional PLAN-009 nutrition context) into a **CompleteMeal**: the culturally coherent plate, not personalized portions.

```
PLAN-008 Recipe → PLAN-009 Nutrition → PLAN-009.5 Composition → PLAN-010 Portions
```

PLAN-009.5 answers: *What else belongs on this lunch/dinner plate?*  
It does **not** answer: *How many grams of each component should this user eat?*

## Responsibility split

| Layer | Owns |
| --- | --- |
| PLAN-008 | Intrinsic recipe structure (`mealComponents` for executing the dish) |
| PLAN-009.5 | Plate completion — add only missing culinary companions |
| PLAN-010 | Personalized quantities / solver bounds |

## Policy versions

| Policy | Version |
| --- | --- |
| Meal composition | `meal-composition-v1` |
| Composition prompt | `meal-composition-v1` |
| Fiber target | `fiber-policy-v1` (~14 g / 1000 kcal daily) |

## Key types

- `CompleteMeal` — distinct from `ResolvedRecipe`
- `CompleteMealComponent` — role, relationship, source, quantityMode, definitionKind
- `MealCompositionProvider` — culinary proposal only (no authoritative nutrition)
- `ComponentDefinition` — `atomic_food` \| `recipe_component` (no fake USDA compounds)

## Fiber

Daily fiber is derived deterministically from the calorie target (`fiber-policy-v1`).  
It is **not** a per-meal quota. Composition only ensures sensible fiber *opportunities*.

## Edge / preview

- Edge Function: `compose-meals`
- Dev CLI: `pnpm compose:meals:dev`
- Mobile preview: `/meal-composition-preview` (local mode uses `MockMealCompositionProvider`)

## Concurrency

Default composition concurrency: `2`. Unique main recipes only (6 unique → ~6 calls, not 14 slots).
