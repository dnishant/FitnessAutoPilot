import type {
  CanonicalFood,
  ExternalFoodRecord,
  FoodSearchResult,
  ResolvedRecipe,
  ResolvedRecipeIngredient,
} from "@fitness-autopilot/contracts";
import { RECIPE_RESOLUTION_PROMPT_VERSION } from "@fitness-autopilot/contracts";

/** Stable test UUIDs for mock foods. */
export const MOCK_FOOD_IDS = {
  chickenRaw: "11111111-1111-4111-8111-111111111101",
  chickenCooked: "11111111-1111-4111-8111-111111111102",
  yogurt: "11111111-1111-4111-8111-111111111103",
  oliveOil: "11111111-1111-4111-8111-111111111104",
  riceCooked: "11111111-1111-4111-8111-111111111105",
  riceRaw: "11111111-1111-4111-8111-111111111106",
  garlic: "11111111-1111-4111-8111-111111111107",
} as const;

const NOW = "2026-09-15T00:00:00.000Z";

export function mockCanonicalFood(
  overrides: Partial<CanonicalFood> &
    Pick<CanonicalFood, "foodId" | "canonicalName" | "description" | "nutrientsPer100g"> & {
      externalId: string;
    },
): CanonicalFood {
  return {
    foodId: overrides.foodId,
    canonicalName: overrides.canonicalName,
    source: {
      provider: "usda",
      externalId: overrides.externalId,
      dataType: overrides.source?.dataType ?? "SR Legacy",
    },
    description: overrides.description,
    nutrientsPer100g: overrides.nutrientsPer100g,
    measures: overrides.measures ?? [],
    metadata: overrides.metadata ?? { brandName: null, foodCategory: null },
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

export const MOCK_CHICKEN_RAW = mockCanonicalFood({
  foodId: MOCK_FOOD_IDS.chickenRaw,
  externalId: "171077",
  canonicalName: "Chicken, broiler, breast, boneless, skinless, raw",
  description: "Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw",
  nutrientsPer100g: {
    caloriesKcal: 120,
    proteinGrams: 22.5,
    carbohydrateGrams: 0,
    fatGrams: 2.6,
    fiberGrams: 0,
  },
  metadata: { brandName: null, foodCategory: "Poultry Products" },
});

export const MOCK_CHICKEN_COOKED = mockCanonicalFood({
  foodId: MOCK_FOOD_IDS.chickenCooked,
  externalId: "171078",
  canonicalName: "Chicken, broiler, breast, boneless, skinless, cooked, roasted",
  description: "Chicken, broiler or fryers, breast, skinless, boneless, meat only, cooked, roasted",
  nutrientsPer100g: {
    caloriesKcal: 165,
    proteinGrams: 31,
    carbohydrateGrams: 0,
    fatGrams: 3.6,
    fiberGrams: 0,
  },
});

export const MOCK_YOGURT = mockCanonicalFood({
  foodId: MOCK_FOOD_IDS.yogurt,
  externalId: "170903",
  canonicalName: "Yogurt, Greek, plain, whole milk",
  description: "Yogurt, Greek, plain, whole milk",
  nutrientsPer100g: {
    caloriesKcal: 97,
    proteinGrams: 9,
    carbohydrateGrams: 3.98,
    fatGrams: 5,
    fiberGrams: 0,
  },
});

export const MOCK_OLIVE_OIL = mockCanonicalFood({
  foodId: MOCK_FOOD_IDS.oliveOil,
  externalId: "171413",
  canonicalName: "Oil, olive, salad or cooking",
  description: "Oil, olive, salad or cooking",
  nutrientsPer100g: {
    caloriesKcal: 884,
    proteinGrams: 0,
    carbohydrateGrams: 0,
    fatGrams: 100,
    fiberGrams: 0,
  },
  measures: [
    {
      label: "tablespoon",
      amount: 1,
      unitName: "tbsp",
      gramWeight: 13.5,
    },
    {
      label: "cup",
      amount: 1,
      unitName: "cup",
      gramWeight: 216,
    },
  ],
  metadata: { brandName: null, foodCategory: "Fats and Oils" },
});

export const MOCK_RICE_COOKED = mockCanonicalFood({
  foodId: MOCK_FOOD_IDS.riceCooked,
  externalId: "168877",
  canonicalName: "Rice, white, basmati, cooked",
  description: "Rice, white, long-grain, regular, cooked",
  nutrientsPer100g: {
    caloriesKcal: 130,
    proteinGrams: 2.7,
    carbohydrateGrams: 28.2,
    fatGrams: 0.3,
    fiberGrams: 0.4,
  },
});

export const MOCK_RICE_RAW = mockCanonicalFood({
  foodId: MOCK_FOOD_IDS.riceRaw,
  externalId: "168876",
  canonicalName: "Rice, white, basmati, raw",
  description: "Rice, white, long-grain, regular, raw, unenriched",
  nutrientsPer100g: {
    caloriesKcal: 365,
    proteinGrams: 7.1,
    carbohydrateGrams: 80,
    fatGrams: 0.7,
    fiberGrams: 1.3,
  },
});

export const MOCK_GARLIC = mockCanonicalFood({
  foodId: MOCK_FOOD_IDS.garlic,
  externalId: "169230",
  canonicalName: "Garlic, raw",
  description: "Garlic, raw",
  nutrientsPer100g: {
    caloriesKcal: 149,
    proteinGrams: 6.36,
    carbohydrateGrams: 33.06,
    fatGrams: 0.5,
    fiberGrams: 2.1,
  },
  measures: [
    {
      label: "clove",
      amount: 1,
      unitName: "clove",
      gramWeight: 3,
    },
  ],
});

export function toExternalRecord(food: CanonicalFood): ExternalFoodRecord {
  return {
    canonicalName: food.canonicalName,
    source: food.source,
    description: food.description,
    nutrientsPer100g: food.nutrientsPer100g,
    measures: food.measures,
    metadata: food.metadata,
    externalId: food.source.externalId,
    provider: "usda",
  };
}

export function toSearchResult(food: CanonicalFood, score?: number): FoodSearchResult {
  return {
    externalId: food.source.externalId,
    description: food.description,
    dataType: food.source.dataType,
    brandName: food.metadata?.brandName ?? null,
    foodCategory: food.metadata?.foodCategory ?? null,
    score,
  };
}

export const BRANDED_OLIVE_DRESSING_SEARCH: FoodSearchResult = {
  externalId: "999001",
  description: "Brand X Garlic Infused Olive Oil Dressing",
  dataType: "Branded",
  brandName: "Brand X",
  foodCategory: "Dressings",
  score: 100,
};

export function makeIngredient(
  partial: Partial<ResolvedRecipeIngredient> &
    Pick<ResolvedRecipeIngredient, "ingredientId" | "name" | "quantity" | "unit" | "role">,
): ResolvedRecipeIngredient {
  return {
    scalingBehavior: "primary_scalable",
    ...partial,
  };
}

/**
 * Minimal Chicken Tikka-like PLAN-008 recipe for nutrition tests.
 */
export function makeChickenTikkaResolvedRecipe(
  overrides?: Partial<ResolvedRecipe>,
): ResolvedRecipe {
  return {
    recipeId: "recipe-tikka",
    candidateId: "tikka-chicken",
    name: "Chicken Tikka",
    source: {
      name: "Test Source",
      url: "https://example.com/tikka",
      author: "Test Author",
    },
    description: "Yogurt-marinated chicken tikka.",
    baseServings: 4,
    ingredients: [
      makeIngredient({
        ingredientId: "chicken",
        name: "boneless skinless chicken breast",
        quantity: 680,
        unit: "g",
        preparation: "cut into 1½-inch pieces",
        measurementState: "raw",
        role: "protein",
        scalingBehavior: "primary_scalable",
      }),
      makeIngredient({
        ingredientId: "yogurt",
        name: "plain whole-milk Greek yogurt",
        quantity: 120,
        unit: "g",
        measurementState: "as_purchased",
        role: "sauce",
        scalingBehavior: "secondary_scalable",
      }),
      makeIngredient({
        ingredientId: "oil",
        name: "olive oil",
        quantity: 1,
        unit: "tbsp",
        role: "fat",
        scalingBehavior: "fixed",
      }),
      makeIngredient({
        ingredientId: "garlic",
        name: "garlic",
        quantity: 3,
        unit: "clove",
        preparation: "minced",
        role: "aromatic",
        scalingBehavior: "fixed",
      }),
    ],
    instructions: [{ stepNumber: 1, text: "Marinate and cook the chicken." }],
    prepTimeMinutes: 20,
    cookTimeMinutes: 25,
    supportedPrepModes: [
      {
        mode: "fully_prepped",
        advanceTasks: ["Marinate chicken"],
        finishTasks: ["Reheat"],
        finishTimeMinutes: 10,
      },
    ],
    mealComponents: [
      {
        componentId: "main",
        name: "Chicken Tikka",
        type: "main",
        required: true,
        purpose: "Primary protein",
        relationship: "intrinsic",
      },
      {
        componentId: "rice",
        name: "basmati rice",
        type: "carb_side",
        required: false,
        purpose: "Recommended carb side",
        relationship: "recommended_side",
      },
    ],
    flavorProfile: {
      cuisineFamily: "Indian",
      flavorFamilies: ["smoky", "tangy"],
      cookingTechniques: ["marinating", "grilling"],
      textureProfile: ["tender"],
    },
    experienceProfile: {
      moistureLevel: "moderate",
      flavorIntensity: "bold",
      textureTags: ["tender"],
      mealPrepQuality: "excellent",
    },
    resolutionMetadata: {
      provider: "gemini",
      model: "test",
      promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
    },
    nutrition: {
      source: "llm_estimate",
      total: {
        caloriesKcal: 2080,
        proteinGrams: 168,
        carbohydrateGrams: 120,
        fatGrams: 96,
        fiberGrams: 16,
      },
      perServing: {
        caloriesKcal: 520,
        proteinGrams: 42,
        carbohydrateGrams: 30,
        fatGrams: 24,
        fiberGrams: 4,
      },
      confidence: "medium",
    },
    ...overrides,
  };
}

function plan009BaseRecipe(
  partial: Pick<ResolvedRecipe, "recipeId" | "candidateId" | "name" | "ingredients" | "mealComponents"> &
    Partial<ResolvedRecipe>,
): ResolvedRecipe {
  const baseServings = partial.baseServings ?? 4;
  const perServing = {
    caloriesKcal: 520,
    proteinGrams: 42,
    carbohydrateGrams: 30,
    fatGrams: 24,
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
    source: {
      name: "PLAN-008 Simple fixture",
      url: "https://example.com/plan008",
      author: "Fitness Autopilot",
    },
    description: `${partial.name} fixture for PLAN-009.`,
    baseServings,
    instructions: [{ stepNumber: 1, text: "Cook according to culinary identity." }],
    prepTimeMinutes: 20,
    cookTimeMinutes: 30,
    supportedPrepModes: [
      {
        mode: "fully_prepped",
        advanceTasks: ["Prep components"],
        finishTasks: ["Reheat and plate"],
        finishTimeMinutes: 12,
      },
    ],
    flavorProfile: {
      cuisineFamily: "test",
      flavorFamilies: ["savory"],
      cookingTechniques: ["saute"],
      textureProfile: [],
    },
    experienceProfile: {
      moistureLevel: "moderate",
      flavorIntensity: "medium",
      textureTags: [],
      mealPrepQuality: "good",
    },
    resolutionMetadata: {
      provider: "fixture",
      model: "plan-009",
      promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
    },
    nutrition: {
      source: "llm_estimate",
      total,
      perServing,
      confidence: "medium",
    },
    ...partial,
  };
}

/** Six PLAN-008 Simple repertoire recipes for PLAN-009 preview/QA. */
export function plan009SimpleResolvedRecipes(): ResolvedRecipe[] {
  return [
    makeChickenTikkaResolvedRecipe(),
    plan009BaseRecipe({
      recipeId: "recipe-kerala-beef",
      candidateId: "kerala-beef-fry",
      name: "Kerala Beef Fry",
      flavorProfile: {
        cuisineFamily: "Indian",
        regionalStyle: "Kerala",
        flavorFamilies: ["spicy", "coconut"],
        cookingTechniques: ["frying"],
        textureProfile: ["crisp"],
      },
      experienceProfile: {
        moistureLevel: "dry",
        flavorIntensity: "bold",
        textureTags: ["crisp"],
        mealPrepQuality: "excellent",
      },
      ingredients: [
        makeIngredient({
          ingredientId: "beef",
          name: "beef chuck",
          quantity: 700,
          unit: "g",
          measurementState: "raw",
          role: "protein",
        }),
        makeIngredient({
          ingredientId: "coconut-oil",
          name: "coconut oil",
          quantity: 2,
          unit: "tbsp",
          role: "fat",
        }),
        makeIngredient({
          ingredientId: "onion",
          name: "onion",
          quantity: 200,
          unit: "g",
          role: "aromatic",
        }),
        makeIngredient({
          ingredientId: "curry-leaves",
          name: "curry leaves",
          quantity: 5,
          unit: "g",
          role: "seasoning",
        }),
      ],
      mealComponents: [
        {
          componentId: "main",
          name: "Kerala Beef Fry",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
        {
          componentId: "rice",
          name: "basmati rice",
          type: "carb_side",
          required: false,
          purpose: "Side",
          relationship: "recommended_side",
        },
      ],
    }),
    plan009BaseRecipe({
      recipeId: "recipe-jerk",
      candidateId: "jamaican-jerk-chicken",
      name: "Jamaican Jerk Chicken",
      flavorProfile: {
        cuisineFamily: "Jamaican",
        regionalStyle: "Jamaica",
        flavorFamilies: ["smoky", "spicy"],
        cookingTechniques: ["grilling"],
        textureProfile: ["charred"],
      },
      experienceProfile: {
        moistureLevel: "dry",
        flavorIntensity: "bold",
        textureTags: ["charred"],
        mealPrepQuality: "good",
      },
      ingredients: [
        makeIngredient({
          ingredientId: "chicken",
          name: "chicken thighs boneless skinless",
          quantity: 800,
          unit: "g",
          measurementState: "raw",
          role: "protein",
        }),
        makeIngredient({
          ingredientId: "oil",
          name: "olive oil",
          quantity: 1,
          unit: "tbsp",
          role: "fat",
        }),
        makeIngredient({
          ingredientId: "scallion",
          name: "scallion",
          quantity: 60,
          unit: "g",
          role: "aromatic",
        }),
        makeIngredient({
          ingredientId: "allspice",
          name: "allspice",
          quantity: 2,
          unit: "g",
          role: "seasoning",
        }),
      ],
      mealComponents: [
        {
          componentId: "main",
          name: "Jerk Chicken",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
      ],
    }),
    plan009BaseRecipe({
      recipeId: "recipe-thai-curry",
      candidateId: "thai-green-curry",
      name: "Thai Green Curry with Shrimp",
      flavorProfile: {
        cuisineFamily: "Thai",
        regionalStyle: "Central Thai",
        flavorFamilies: ["herby", "coconut"],
        cookingTechniques: ["simmering"],
        textureProfile: ["saucy"],
        primarySauce: "green curry",
      },
      experienceProfile: {
        moistureLevel: "saucy",
        flavorIntensity: "bold",
        textureTags: ["saucy"],
        mealPrepQuality: "good",
      },
      ingredients: [
        makeIngredient({
          ingredientId: "shrimp",
          name: "shrimp",
          quantity: 450,
          unit: "g",
          measurementState: "raw",
          role: "protein",
        }),
        makeIngredient({
          ingredientId: "coconut-milk",
          name: "coconut milk",
          quantity: 400,
          unit: "g",
          role: "sauce",
        }),
        makeIngredient({
          ingredientId: "green-curry-paste",
          name: "green curry paste",
          quantity: 40,
          unit: "g",
          role: "seasoning",
        }),
        makeIngredient({
          ingredientId: "eggplant",
          name: "Thai eggplant",
          quantity: 200,
          unit: "g",
          role: "vegetable",
        }),
        makeIngredient({
          ingredientId: "thai-basil",
          name: "Thai basil",
          quantity: 15,
          unit: "g",
          role: "garnish",
        }),
      ],
      mealComponents: [
        {
          componentId: "main",
          name: "Green Curry",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
        {
          componentId: "rice",
          name: "jasmine rice",
          type: "carb_side",
          required: false,
          purpose: "Side",
          relationship: "recommended_side",
        },
      ],
    }),
    plan009BaseRecipe({
      recipeId: "recipe-ca-kho",
      candidateId: "ca-kho-to",
      name: "Vietnamese Cá Kho Tộ",
      flavorProfile: {
        cuisineFamily: "Vietnamese",
        regionalStyle: "Southern Vietnam",
        flavorFamilies: ["savory", "caramel"],
        cookingTechniques: ["braising"],
        textureProfile: ["glossy"],
        primarySauce: "caramel fish sauce",
      },
      experienceProfile: {
        moistureLevel: "saucy",
        flavorIntensity: "bold",
        textureTags: ["glossy"],
        mealPrepQuality: "excellent",
      },
      ingredients: [
        makeIngredient({
          ingredientId: "catfish",
          name: "catfish fillets",
          quantity: 600,
          unit: "g",
          measurementState: "raw",
          role: "protein",
        }),
        makeIngredient({
          ingredientId: "fish-sauce",
          name: "fish sauce",
          quantity: 30,
          unit: "g",
          role: "seasoning",
        }),
        makeIngredient({
          ingredientId: "caramel",
          name: "sugar",
          quantity: 20,
          unit: "g",
          role: "other",
        }),
        makeIngredient({
          ingredientId: "coconut-water",
          name: "coconut water",
          quantity: 200,
          unit: "g",
          role: "sauce",
        }),
      ],
      mealComponents: [
        {
          componentId: "main",
          name: "Cá Kho Tộ",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
        {
          componentId: "rice",
          name: "steamed rice",
          type: "carb_side",
          required: false,
          purpose: "Side",
          relationship: "recommended_side",
        },
      ],
    }),
    plan009BaseRecipe({
      recipeId: "recipe-shrimp-tacos",
      candidateId: "quick-fresh-dinner",
      name: "Chile-Lime Shrimp Tacos",
      flavorProfile: {
        cuisineFamily: "Mexican",
        regionalStyle: "Baja",
        flavorFamilies: ["citrus", "chili"],
        cookingTechniques: ["saute"],
        textureProfile: ["crisp"],
        primarySauce: "salsa",
      },
      experienceProfile: {
        moistureLevel: "moderate",
        flavorIntensity: "bold",
        textureTags: ["crisp"],
        mealPrepQuality: "good",
      },
      ingredients: [
        makeIngredient({
          ingredientId: "shrimp",
          name: "shrimp",
          quantity: 400,
          unit: "g",
          measurementState: "raw",
          role: "protein",
        }),
        makeIngredient({
          ingredientId: "tortilla",
          name: "corn tortilla",
          quantity: 8,
          unit: "piece",
          role: "carb",
        }),
        makeIngredient({
          ingredientId: "lime",
          name: "lime juice",
          quantity: 30,
          unit: "g",
          role: "acid",
        }),
        makeIngredient({
          ingredientId: "cabbage",
          name: "cabbage",
          quantity: 150,
          unit: "g",
          role: "vegetable",
        }),
        makeIngredient({
          ingredientId: "salsa",
          name: "pico de gallo",
          quantity: 80,
          unit: "g",
          role: "sauce",
        }),
        makeIngredient({
          ingredientId: "oil",
          name: "olive oil",
          quantity: 1,
          unit: "tbsp",
          role: "fat",
        }),
      ],
      mealComponents: [
        {
          componentId: "main",
          name: "Shrimp Tacos",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
        {
          componentId: "tortillas",
          name: "corn tortillas",
          type: "carb_side",
          required: true,
          purpose: "Taco vessel",
          relationship: "intrinsic",
        },
        {
          componentId: "slaw",
          name: "cabbage slaw",
          type: "vegetable_side",
          required: true,
          purpose: "Crunch",
          relationship: "intrinsic",
        },
        {
          componentId: "salsa",
          name: "salsa",
          type: "condiment",
          required: true,
          purpose: "Brightness",
          relationship: "intrinsic",
        },
      ],
    }),
  ];
}
