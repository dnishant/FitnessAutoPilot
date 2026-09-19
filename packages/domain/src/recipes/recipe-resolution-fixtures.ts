import type {
  CulinaryDiscoveryCandidate,
  RankedWeeklyStrategy,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import { RECIPE_RESOLUTION_PROMPT_VERSION } from "@fitness-autopilot/contracts";
import {
  CHICKEN_TIKKA,
  JAMAICAN_JERK_CHICKEN,
  KERALA_BEEF_FRY,
  THAI_GREEN_CURRY,
} from "./candidate-ranking-fixtures";
import { makeRankedCandidate } from "../planning/ranked-weekly-strategy-fixtures";

/**
 * V1 Simple weekly strategy repertoire (12 slots → 4 unique core meals):
 * Chicken Tikka ×3, Kerala Beef Fry ×3, Jamaican Jerk Chicken ×3,
 * Thai Green Curry with Shrimp ×3. Sunday is flexible (unplanned).
 */
export const PLAN008_SIMPLE_CANDIDATES: CulinaryDiscoveryCandidate[] = [
  CHICKEN_TIKKA,
  KERALA_BEEF_FRY,
  JAMAICAN_JERK_CHICKEN,
  {
    ...THAI_GREEN_CURRY,
    name: "Thai Green Curry with Shrimp",
  },
];

export const PLAN008_SIMPLE_UNIQUE_IDS = [
  "tikka-chicken",
  "kerala-beef-fry",
  "jamaican-jerk-chicken",
  "thai-green-curry",
] as const;

export function plan008SimpleCandidateLookup(): Map<string, CulinaryDiscoveryCandidate> {
  return new Map(PLAN008_SIMPLE_CANDIDATES.map((c) => [c.candidateId, c]));
}

export function plan008SimpleRankedPools() {
  const lunch = PLAN008_SIMPLE_CANDIDATES.map((c, i) => makeRankedCandidate(c, i + 1));
  const dinner = [...lunch].reverse().map((c, i) => ({ ...c, rank: i + 1 }));
  return { lunchCandidates: lunch, dinnerCandidates: dinner };
}

/**
 * Fixed V1 strategy: 4 core meals × 12 lunch/dinner slots across 6 days.
 */
export function plan008SimpleWeeklyStrategy(): RankedWeeklyStrategy {
  const slot = (
    day:
      | "monday"
      | "tuesday"
      | "wednesday"
      | "thursday"
      | "friday"
      | "saturday",
    mealType: "lunch" | "dinner",
    candidateId: (typeof PLAN008_SIMPLE_UNIQUE_IDS)[number],
    name: string,
  ) => ({
    day,
    mealType,
    candidateId,
    name,
    prepIntent: mealType === "lunch" ? ("fully_prepped" as const) : ("quick_fresh_finish" as const),
    lunchPreparationStrategy:
      mealType === "lunch" ? ("independent_meal_prep" as const) : undefined,
    planningReason: `V1 Simple repertoire slot for ${name}.`,
  });

  const days = [
    {
      day: "monday" as const,
      lunch: slot("monday", "lunch", "tikka-chicken", "Chicken Tikka"),
      dinner: slot("monday", "dinner", "kerala-beef-fry", "Kerala Beef Fry"),
    },
    {
      day: "tuesday" as const,
      lunch: slot("tuesday", "lunch", "jamaican-jerk-chicken", "Jamaican Jerk Chicken"),
      dinner: slot("tuesday", "dinner", "thai-green-curry", "Thai Green Curry with Shrimp"),
    },
    {
      day: "wednesday" as const,
      lunch: slot("wednesday", "lunch", "tikka-chicken", "Chicken Tikka"),
      dinner: slot("wednesday", "dinner", "kerala-beef-fry", "Kerala Beef Fry"),
    },
    {
      day: "thursday" as const,
      lunch: slot("thursday", "lunch", "jamaican-jerk-chicken", "Jamaican Jerk Chicken"),
      dinner: slot("thursday", "dinner", "thai-green-curry", "Thai Green Curry with Shrimp"),
    },
    {
      day: "friday" as const,
      lunch: slot("friday", "lunch", "tikka-chicken", "Chicken Tikka"),
      dinner: slot("friday", "dinner", "jamaican-jerk-chicken", "Jamaican Jerk Chicken"),
    },
    {
      day: "saturday" as const,
      lunch: slot("saturday", "lunch", "kerala-beef-fry", "Kerala Beef Fry"),
      dinner: slot("saturday", "dinner", "thai-green-curry", "Thai Green Curry with Shrimp"),
    },
  ];

  return {
    days,
    uniqueCandidateIds: [...PLAN008_SIMPLE_UNIQUE_IDS],
    flexibleDay: "sunday",
    coreRepertoire: {
      policyVersion: "v1-meal-prep-policy-v1",
      coveredDays: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ],
      flexibleDay: "sunday",
      plannedLunchDinnerSlots: 12,
      coreMeals: PLAN008_SIMPLE_UNIQUE_IDS.map((id) => {
        const name =
          PLAN008_SIMPLE_CANDIDATES.find((c) => c.candidateId === id)?.name ?? id;
        const mealInstanceSlots = days.flatMap((d) => {
          const slots: Array<{ day: typeof d.day; mealType: "lunch" | "dinner" }> = [];
          if (d.lunch.candidateId === id) slots.push({ day: d.day, mealType: "lunch" });
          if (d.dinner.candidateId === id) slots.push({ day: d.day, mealType: "dinner" });
          return slots;
        });
        return {
          coreMealId: id,
          candidateId: id,
          name,
          mealInstanceSlots,
          weeklyInstanceCount: mealInstanceSlots.length,
        };
      }),
    },
    strategySummary: {
      varietyApproach: "Four core meals with intentional repeats across six covered days.",
      prepApproach: "Batch-friendly lunches with prep-compatible dinners; Sunday flexible.",
      ingredientReuseApproach: "Shared prep opportunities across the four-meal repertoire.",
    },
    metadata: {
      provider: "fixture",
      model: "plan-008-simple-v1",
      promptVersion: "weekly-strategy-ranked-v1.5.0",
    },
  };
}

export function makeResolvedRecipeFixture(
  candidate: CulinaryDiscoveryCandidate,
  overrides: Partial<ResolvedRecipe> = {},
): ResolvedRecipe {
  const baseServings = overrides.baseServings ?? 4;
  const perServing = {
    caloriesKcal: 480,
    proteinGrams: 38,
    carbohydrateGrams: 28,
    fatGrams: 22,
    fiberGrams: 4,
  };
  const total = {
    caloriesKcal: perServing.caloriesKcal * baseServings,
    proteinGrams: perServing.proteinGrams * baseServings,
    carbohydrateGrams: perServing.carbohydrateGrams * baseServings,
    fatGrams: perServing.fatGrams * baseServings,
    fiberGrams: (perServing.fiberGrams ?? 0) * baseServings,
  };

  return {
    recipeId: `rr_${candidate.candidateId}`,
    candidateId: candidate.candidateId,
    name: candidate.name,
    source: {
      name: candidate.source.name,
      url: candidate.source.url,
      author: candidate.source.author ?? null,
    },
    description: `Structured culinary resolution of ${candidate.name}.`,
    baseServings,
    ingredients: [
      {
        ingredientId: "protein",
        name: candidate.primaryProtein ?? "main protein",
        quantity: 600,
        unit: "g",
        role: "protein",
        scalingBehavior: "primary_scalable",
      },
      {
        ingredientId: "aromatics",
        name: "ginger garlic paste",
        quantity: 2,
        unit: "tbsp",
        role: "aromatic",
        scalingBehavior: "ratio_bound",
        scalingReferenceIngredientId: "protein",
      },
    ],
    instructions: [
      { stepNumber: 1, text: `Prepare aromatics and seasonings for ${candidate.name}.` },
      { stepNumber: 2, text: `Cook using ${candidate.cookingTechniques[0] ?? "standard"} technique.` },
      { stepNumber: 3, text: "Rest briefly and serve with recommended components." },
    ],
    prepTimeMinutes: 20,
    cookTimeMinutes: 25,
    supportedPrepModes: [
      {
        mode: "component_prepped",
        advanceTasks: ["Prep aromatics", "Marinate or season protein"],
        finishTasks: ["Cook protein", "Assemble with sides"],
        finishTimeMinutes: 12,
      },
    ],
    storageInstructions: "Refrigerate in airtight containers up to 3 days.",
    reheatingInstructions: "Reheat gently until steaming hot; restore texture under high heat if needed.",
    mealComponents: [
      {
        componentId: "main",
        name: candidate.name,
        type: "main",
        required: true,
        purpose: "Primary dish identity.",
        relationship: "intrinsic",
      },
      {
        componentId: "side",
        name: "Appropriate grain or bread",
        type: "carb_side",
        required: true,
        purpose: "Completes the meal without changing the main recipe.",
        relationship: "recommended_side",
      },
    ],
    flavorProfile: {
      cuisineFamily: candidate.cuisineFamily,
      regionalStyle: candidate.regionalStyle ?? null,
      flavorFamilies: candidate.flavorFamilies,
      primarySauce: null,
      cookingTechniques: candidate.cookingTechniques,
      textureProfile: candidate.textureTags,
    },
    experienceProfile: {
      moistureLevel: "moderate",
      flavorIntensity: "bold",
      textureTags: candidate.textureTags,
      mealPrepQuality: "good",
    },
    resolutionMetadata: {
      provider: "fixture",
      model: "test",
      promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
    },
    nutrition: {
      source: "llm_estimate",
      total,
      perServing,
      confidence: "medium",
    },
    optimization: {
      applied: false,
      changes: [],
    },
    ...overrides,
  };
}
