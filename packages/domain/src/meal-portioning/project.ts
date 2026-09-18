import type {
  ConsumerMealComponent,
  ConsumerMealSlot,
  ConsumerWeeklyPlan,
  PersonalizedMealNutrition,
  PersonalizedWeeklyNutritionPlan,
  RankedWeeklyStrategy,
  MealConcept,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import { DEFAULT_COUNT_BOUNDS } from "./policy";
import { isDiscreteUnitLabel, matchDiscreteStapleEstimate } from "./staple-estimates";

function finishMinutesFromRecipe(
  recipe: ResolvedRecipe | undefined,
  prepIntent: ConsumerMealSlot["prepIntent"],
): number | undefined {
  if (!recipe) return undefined;
  const match = recipe.supportedPrepModes.find((mode) => mode.mode === prepIntent);
  if (match) return match.finishTimeMinutes;
  return recipe.supportedPrepModes[0]?.finishTimeMinutes;
}

function componentsFromConcept(
  concept: MealConcept | undefined,
  fallbackName: string,
): ConsumerMealComponent[] {
  if (!concept) {
    return [{ componentId: "main", displayName: fallbackName, role: "main" }];
  }
  const rows: ConsumerMealComponent[] = [
    {
      componentId: concept.main.componentId,
      displayName: concept.main.name,
      role: concept.main.role,
    },
  ];
  for (const component of concept.components) {
    if (component.componentId === concept.main.componentId) continue;
    rows.push({
      componentId: component.componentId,
      displayName: component.name,
      role: component.role,
    });
  }
  return rows;
}

function toPersonalizedNutrition(input: {
  caloriesKcal: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  fiberGrams?: number;
}): PersonalizedMealNutrition {
  const out: PersonalizedMealNutrition = {
    caloriesKcal: input.caloriesKcal,
    proteinGrams: input.proteinGrams,
    carbsGrams: input.carbohydrateGrams,
    fatGrams: input.fatGrams,
  };
  if (input.fiberGrams != null) out.fiberGrams = input.fiberGrams;
  return out;
}

function sumComponentNutrition(
  components: readonly ConsumerMealComponent[],
): PersonalizedMealNutrition | undefined {
  const withNutrition = components.filter((c) => c.nutrition);
  if (withNutrition.length === 0) return undefined;
  let caloriesKcal = 0;
  let proteinGrams = 0;
  let carbsGrams = 0;
  let fatGrams = 0;
  let fiberGrams = 0;
  let hasFiber = false;
  for (const component of withNutrition) {
    const n = component.nutrition!;
    caloriesKcal += n.caloriesKcal;
    proteinGrams += n.proteinGrams;
    carbsGrams += n.carbsGrams;
    fatGrams += n.fatGrams;
    if (n.fiberGrams != null) {
      fiberGrams += n.fiberGrams;
      hasFiber = true;
    }
  }
  const out: PersonalizedMealNutrition = {
    caloriesKcal: Math.round(caloriesKcal),
    proteinGrams: Math.round(proteinGrams * 10) / 10,
    carbsGrams: Math.round(carbsGrams * 10) / 10,
    fatGrams: Math.round(fatGrams * 10) / 10,
  };
  if (hasFiber) out.fiberGrams = Math.round(fiberGrams * 10) / 10;
  return out;
}

/**
 * Project PersonalizedWeeklyNutritionPlan onto consumer meal slots.
 * Does not invent portions — blocked/missing personalization leaves amounts unset.
 */
export function projectPersonalizedPlanToConsumerMeals(input: {
  strategy: RankedWeeklyStrategy;
  personalizedWeeklyPlan: PersonalizedWeeklyNutritionPlan;
  conceptsByCandidateId?: Record<string, MealConcept>;
  recipesByCandidateId?: Record<string, ResolvedRecipe>;
}): ConsumerMealSlot[] {
  const byInstance = new Map<string, (typeof input.personalizedWeeklyPlan.days)[0]["meals"][0]>();
  for (const day of input.personalizedWeeklyPlan.days) {
    for (const meal of day.meals) {
      byInstance.set(meal.mealInstanceId, meal);
    }
  }

  const meals: ConsumerMealSlot[] = [];
  for (const day of input.strategy.days) {
    for (const slot of [day.lunch, day.dinner]) {
      const concept = input.conceptsByCandidateId?.[slot.candidateId];
      const recipe = input.recipesByCandidateId?.[slot.candidateId];
      const instanceId = `${input.personalizedWeeklyPlan.generatedPlanId}:${slot.day}:${slot.mealType}`;
      const personalized = byInstance.get(instanceId);
      const baseComponents = componentsFromConcept(concept, slot.name);

      let components = baseComponents;
      let personalizedNutrition = undefined;
      let personalizationStatus = personalized?.status;
      let personalizationBlockReason = personalized?.blockReason;
      let personalizationMessage = personalized?.message;

      if (personalized?.personalizedPlan && personalized.status !== "blocked") {
        const plan = personalized.personalizedPlan;
        personalizedNutrition = plan.nutrition;
        components = plan.portions.map((portion) => {
          const byNameMatch = baseComponents.find(
            (c) => c.displayName.toLowerCase() === portion.displayName.toLowerCase(),
          );
          const match =
            baseComponents.find((c) => c.componentId === portion.componentId) ?? byNameMatch;
          const discrete = isDiscreteUnitLabel(portion.unit);
          const staple = discrete ? matchDiscreteStapleEstimate(portion.displayName) : null;
          return {
            componentId: match?.componentId ?? portion.componentId,
            displayName: match?.displayName ?? portion.displayName,
            role: match?.role ?? portion.role,
            amount: portion.amount,
            unit: portion.unit,
            nutrition: toPersonalizedNutrition(portion.nutrition),
            adjustableDiscrete: discrete,
            minAmount: discrete ? DEFAULT_COUNT_BOUNDS.minCount : undefined,
            maxAmount: discrete ? DEFAULT_COUNT_BOUNDS.maxCount : undefined,
            quantityStep: discrete ? DEFAULT_COUNT_BOUNDS.quantityStep : undefined,
            // Soft hint: discrete staples with a named estimate catalog entry may be estimates.
            usedStapleEstimate: staple != null ? true : undefined,
          };
        });
        for (const base of baseComponents) {
          if (
            !components.some(
              (c) =>
                c.componentId === base.componentId ||
                c.displayName.toLowerCase() === base.displayName.toLowerCase(),
            )
          ) {
            components.push(base);
          }
        }
      }

      meals.push({
        mealInstanceId: instanceId,
        day: slot.day,
        mealType: slot.mealType,
        candidateId: slot.candidateId,
        name: slot.name,
        prepIntent: slot.prepIntent,
        finishTimeMinutes: finishMinutesFromRecipe(recipe, slot.prepIntent),
        cuisineFamily: recipe?.flavorProfile.cuisineFamily,
        flavorTags: recipe?.flavorProfile.flavorFamilies,
        experienceTags: recipe
          ? [
              recipe.experienceProfile.flavorIntensity,
              recipe.experienceProfile.moistureLevel === "saucy" ? "Saucy" : "",
            ].filter(Boolean)
          : undefined,
        components,
        personalizedNutrition,
        personalizationStatus,
        personalizationBlockReason,
        personalizationMessage,
      });
    }
  }
  return meals;
}

export function attachPersonalizedWeeklyPlan(
  plan: ConsumerWeeklyPlan,
  personalizedWeeklyPlan: PersonalizedWeeklyNutritionPlan,
  conceptsByCandidateId?: Record<string, MealConcept>,
  recipesByCandidateId?: Record<string, ResolvedRecipe>,
): ConsumerWeeklyPlan {
  if (!plan.strategy) {
    return {
      ...plan,
      generatedPlanId: personalizedWeeklyPlan.generatedPlanId,
      personalizedWeeklyPlan,
    };
  }
  return {
    ...plan,
    generatedPlanId: personalizedWeeklyPlan.generatedPlanId,
    personalizedWeeklyPlan,
    meals: projectPersonalizedPlanToConsumerMeals({
      strategy: plan.strategy,
      personalizedWeeklyPlan,
      conceptsByCandidateId: conceptsByCandidateId ?? plan.conceptsByCandidateId,
      recipesByCandidateId: recipesByCandidateId ?? plan.recipesByCandidateId,
    }),
  };
}

/**
 * Adjust a discrete component count on a meal slot and recompute meal nutrition
 * from per-component contributions (scaled linearly with count).
 */
export function applyDiscretePortionAdjustment(input: {
  meal: ConsumerMealSlot;
  componentId: string;
  amount: number;
}): ConsumerMealSlot | null {
  const target = input.meal.components.find((c) => c.componentId === input.componentId);
  if (!target?.adjustableDiscrete || target.amount == null || !target.nutrition) {
    return null;
  }
  const min = target.minAmount ?? DEFAULT_COUNT_BOUNDS.minCount;
  const max = target.maxAmount ?? DEFAULT_COUNT_BOUNDS.maxCount;
  const step = target.quantityStep ?? DEFAULT_COUNT_BOUNDS.quantityStep;
  const clamped = Math.min(max, Math.max(min, Math.round(input.amount / step) * step));
  if (!(clamped > 0)) return null;

  const scale = clamped / target.amount;
  const components = input.meal.components.map((component) => {
    if (component.componentId !== input.componentId || !component.nutrition) {
      return component;
    }
    return {
      ...component,
      amount: clamped,
      nutrition: {
        caloriesKcal: component.nutrition.caloriesKcal * scale,
        proteinGrams: component.nutrition.proteinGrams * scale,
        carbsGrams: component.nutrition.carbsGrams * scale,
        fatGrams: component.nutrition.fatGrams * scale,
        fiberGrams:
          component.nutrition.fiberGrams != null
            ? component.nutrition.fiberGrams * scale
            : undefined,
      },
    };
  });

  return {
    ...input.meal,
    components,
    personalizedNutrition: sumComponentNutrition(components) ?? input.meal.personalizedNutrition,
  };
}
