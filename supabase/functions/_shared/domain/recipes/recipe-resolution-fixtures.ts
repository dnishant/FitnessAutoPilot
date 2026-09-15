import type {
  CulinaryDiscoveryCandidate,
  RankedWeeklyStrategy,
  ResolvedRecipe,
} from "../../contracts/index.ts";
import { RECIPE_RESOLUTION_PROMPT_VERSION } from "../../contracts/index.ts";
import {
  CA_KHO_TO,
  CHICKEN_TIKKA,
  JAMAICAN_JERK_CHICKEN,
  KERALA_BEEF_FRY,
  QUICK_FRESH_DINNER,
  THAI_GREEN_CURRY,
} from "./candidate-ranking-fixtures.ts";
import { makeRankedCandidate } from "../planning/ranked-weekly-strategy-fixtures.ts";

/**
 * PLAN-008 Simple weekly strategy repertoire (14 slots → 6 unique candidates):
 * Chicken Tikka ×4, Kerala Beef Fry ×3, Jamaican Jerk Chicken ×2,
 * Thai Green Curry with Shrimp ×2, Vietnamese Cá Kho Tộ ×2,
 * Chile-Lime Shrimp Tacos ×1.
 */
export const PLAN008_SIMPLE_CANDIDATES: CulinaryDiscoveryCandidate[] = [
  CHICKEN_TIKKA,
  KERALA_BEEF_FRY,
  JAMAICAN_JERK_CHICKEN,
  {
    ...THAI_GREEN_CURRY,
    name: "Thai Green Curry with Shrimp",
  },
  CA_KHO_TO,
  {
    ...QUICK_FRESH_DINNER,
    name: "Chile-Lime Shrimp Tacos",
  },
];

export const PLAN008_SIMPLE_UNIQUE_IDS = [
  "tikka-chicken",
  "kerala-beef-fry",
  "jamaican-jerk-chicken",
  "thai-green-curry",
  "ca-kho-to",
  "quick-fresh-dinner",
] as const;

export function plan008SimpleCandidateLookup(): Map<string, CulinaryDiscoveryCandidate> {
  return new Map(PLAN008_SIMPLE_CANDIDATES.map((c) => [c.candidateId, c]));
}

export function plan008SimpleRankedPools() {
  const lunch = [
    CHICKEN_TIKKA,
    KERALA_BEEF_FRY,
    JAMAICAN_JERK_CHICKEN,
    { ...THAI_GREEN_CURRY, name: "Thai Green Curry with Shrimp" },
    CA_KHO_TO,
    { ...QUICK_FRESH_DINNER, name: "Chile-Lime Shrimp Tacos" },
  ].map((c, i) => makeRankedCandidate(c, i + 1));
  const dinner = [...lunch].reverse().map((c, i) => ({ ...c, rank: i + 1 }));
  return { lunchCandidates: lunch, dinnerCandidates: dinner };
}

/**
 * Fixed 14-slot strategy matching the PLAN-008 Simple repertoire counts.
 */
export function plan008SimpleWeeklyStrategy(): RankedWeeklyStrategy {
  const slot = (
    day:
      | "monday"
      | "tuesday"
      | "wednesday"
      | "thursday"
      | "friday"
      | "saturday"
      | "sunday",
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
    planningReason: `PLAN-008 Simple repertoire slot for ${name}.`,
  });

  return {
    days: [
      {
        day: "monday",
        lunch: slot("monday", "lunch", "tikka-chicken", "Chicken Tikka"),
        dinner: slot("monday", "dinner", "kerala-beef-fry", "Kerala Beef Fry"),
      },
      {
        day: "tuesday",
        lunch: slot("tuesday", "lunch", "tikka-chicken", "Chicken Tikka"),
        dinner: slot("tuesday", "dinner", "thai-green-curry", "Thai Green Curry with Shrimp"),
      },
      {
        day: "wednesday",
        lunch: slot("wednesday", "lunch", "kerala-beef-fry", "Kerala Beef Fry"),
        dinner: slot("wednesday", "dinner", "jamaican-jerk-chicken", "Jamaican Jerk Chicken"),
      },
      {
        day: "thursday",
        lunch: slot("thursday", "lunch", "tikka-chicken", "Chicken Tikka"),
        dinner: slot("thursday", "dinner", "ca-kho-to", "Vietnamese Cá Kho Tộ"),
      },
      {
        day: "friday",
        lunch: slot("friday", "lunch", "kerala-beef-fry", "Kerala Beef Fry"),
        dinner: slot("friday", "dinner", "jamaican-jerk-chicken", "Jamaican Jerk Chicken"),
      },
      {
        day: "saturday",
        lunch: slot("saturday", "lunch", "tikka-chicken", "Chicken Tikka"),
        dinner: slot("saturday", "dinner", "thai-green-curry", "Thai Green Curry with Shrimp"),
      },
      {
        day: "sunday",
        lunch: slot("sunday", "lunch", "ca-kho-to", "Vietnamese Cá Kho Tộ"),
        dinner: slot("sunday", "dinner", "quick-fresh-dinner", "Chile-Lime Shrimp Tacos"),
      },
    ],
    uniqueCandidateIds: [...PLAN008_SIMPLE_UNIQUE_IDS],
    strategySummary: {
      varietyApproach: "Compact Simple repertoire with intentional repeats.",
      prepApproach: "Batch-friendly lunches with a few fresh-finish dinners.",
      ingredientReuseApproach: "Shared prep opportunities across the week where beneficial.",
    },
    metadata: {
      provider: "fixture",
      model: "plan-008-simple",
      promptVersion: "weekly-strategy-ranked-v1.2.0",
    },
  };
}

export function makeResolvedRecipeFixture(
  candidate: CulinaryDiscoveryCandidate,
  overrides: Partial<ResolvedRecipe> = {},
): ResolvedRecipe {
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
    baseServings: 4,
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
    ...overrides,
  };
}
