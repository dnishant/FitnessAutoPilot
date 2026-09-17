import type {
  ConsumerMealComponent,
  ConsumerMealSlot,
  ConsumerWeeklyPlan,
  PersonalizedWeeklyNutritionPlan,
  RankedWeeklyStrategy,
  MealConcept,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";

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

      if (personalized?.personalizedPlan && personalized.status !== "blocked") {
        const plan = personalized.personalizedPlan;
        personalizedNutrition = plan.nutrition;
        const byId = new Map(plan.portions.map((p) => [p.componentId, p]));
        const byName = new Map(
          plan.portions.map((p) => [p.displayName.toLowerCase(), p]),
        );
        components = plan.portions.map((portion) => {
          const existing =
            byId.get(portion.componentId) &&
            baseComponents.find((c) => c.componentId === portion.componentId);
          const byNameMatch = baseComponents.find(
            (c) => c.displayName.toLowerCase() === portion.displayName.toLowerCase(),
          );
          const match = existing ?? byNameMatch;
          return {
            componentId: match?.componentId ?? portion.componentId,
            displayName: match?.displayName ?? portion.displayName,
            role: match?.role ?? portion.role,
            amount: portion.amount,
            unit: portion.unit,
          };
        });
        // If concept had extra components without portions, keep names without amounts.
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
        void byName;
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
