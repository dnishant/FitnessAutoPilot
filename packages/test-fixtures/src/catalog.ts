import type {
  Food,
  Recipe,
  RecipeIngredient,
  UserProfile,
} from "@fitness-autopilot/contracts";

export const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";

export function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: TEST_USER_ID,
    dateOfBirth: "1990-06-15",
    biologicalSex: "female",
    heightCm: 165,
    weightKg: 70,
    fitnessExperience: "intermediate",
    dietaryPreference: "omnivore",
    cuisinePreferences: ["indian", "american"],
    allergies: [],
    dislikedFoods: [],
    preferredFoods: ["chicken"],
    mealPrepAvailability: "weekends",
    cookingSkill: "intermediate",
    cookingEquipment: ["stovetop", "microwave", "blender"],
    maxMealPrepMinutes: 45,
    safetyRestrictions: [],
    ...overrides,
  };
}

export const foods: Food[] = [
  {
    id: "22222222-2222-2222-2222-222222220001",
    name: "Chicken breast, cooked",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 165,
    proteinGPer100g: 31,
    carbsGPer100g: 0,
    fatGPer100g: 3.6,
    dietaryTags: ["omnivore", "halal"],
    allergenTags: [],
  },
  {
    id: "22222222-2222-2222-2222-222222220002",
    name: "Cooked white rice",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 130,
    proteinGPer100g: 2.7,
    carbsGPer100g: 28,
    fatGPer100g: 0.3,
    dietaryTags: ["vegan", "vegetarian", "gluten_free"],
    allergenTags: [],
  },
  {
    id: "22222222-2222-2222-2222-222222220003",
    name: "Olive oil",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 884,
    proteinGPer100g: 0,
    carbsGPer100g: 0,
    fatGPer100g: 100,
    dietaryTags: ["vegan", "vegetarian"],
    allergenTags: [],
  },
  {
    id: "22222222-2222-2222-2222-222222220004",
    name: "Greek yogurt, plain nonfat",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 59,
    proteinGPer100g: 10,
    carbsGPer100g: 3.6,
    fatGPer100g: 0.4,
    dietaryTags: ["vegetarian"],
    allergenTags: ["dairy"],
  },
  {
    id: "22222222-2222-2222-2222-222222220005",
    name: "Banana",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 89,
    proteinGPer100g: 1.1,
    carbsGPer100g: 23,
    fatGPer100g: 0.3,
    dietaryTags: ["vegan", "vegetarian"],
    allergenTags: [],
  },
  {
    id: "22222222-2222-2222-2222-222222220006",
    name: "Whey protein powder",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 400,
    proteinGPer100g: 80,
    carbsGPer100g: 8,
    fatGPer100g: 5,
    dietaryTags: ["vegetarian"],
    allergenTags: ["dairy"],
  },
  {
    id: "22222222-2222-2222-2222-222222220007",
    name: "Rolled oats",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 389,
    proteinGPer100g: 17,
    carbsGPer100g: 66,
    fatGPer100g: 7,
    dietaryTags: ["vegan", "vegetarian"],
    allergenTags: ["gluten"],
  },
  {
    id: "22222222-2222-2222-2222-222222220008",
    name: "Whole egg",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 143,
    proteinGPer100g: 13,
    carbsGPer100g: 0.7,
    fatGPer100g: 9.5,
    dietaryTags: ["vegetarian"],
    allergenTags: ["egg"],
  },
  {
    id: "22222222-2222-2222-2222-222222220009",
    name: "Avocado",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 160,
    proteinGPer100g: 2,
    carbsGPer100g: 9,
    fatGPer100g: 15,
    dietaryTags: ["vegan", "vegetarian"],
    allergenTags: [],
  },
  {
    id: "22222222-2222-2222-2222-222222220010",
    name: "Whole wheat bread",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 247,
    proteinGPer100g: 13,
    carbsGPer100g: 41,
    fatGPer100g: 4,
    dietaryTags: ["vegan", "vegetarian"],
    allergenTags: ["gluten", "wheat"],
  },
  {
    id: "22222222-2222-2222-2222-222222220011",
    name: "Paneer",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 265,
    proteinGPer100g: 18,
    carbsGPer100g: 1.2,
    fatGPer100g: 20,
    dietaryTags: ["vegetarian"],
    allergenTags: ["dairy"],
  },
  {
    id: "22222222-2222-2222-2222-222222220012",
    name: "Cooked lentils (dal)",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 116,
    proteinGPer100g: 9,
    carbsGPer100g: 20,
    fatGPer100g: 0.4,
    dietaryTags: ["vegan", "vegetarian", "halal"],
    allergenTags: [],
  },
  {
    id: "22222222-2222-2222-2222-222222220013",
    name: "Mixed vegetables",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 40,
    proteinGPer100g: 2,
    carbsGPer100g: 7,
    fatGPer100g: 0.2,
    dietaryTags: ["vegan", "vegetarian"],
    allergenTags: [],
  },
  {
    id: "22222222-2222-2222-2222-222222220014",
    name: "Black beans, cooked",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 132,
    proteinGPer100g: 8.9,
    carbsGPer100g: 23.7,
    fatGPer100g: 0.5,
    dietaryTags: ["vegan", "vegetarian"],
    allergenTags: [],
  },
  {
    id: "22222222-2222-2222-2222-222222220015",
    name: "Peanut butter",
    brand: null,
    source: "dev_seed",
    sourceFoodId: null,
    caloriesPer100g: 588,
    proteinGPer100g: 25,
    carbsGPer100g: 20,
    fatGPer100g: 50,
    dietaryTags: ["vegan", "vegetarian"],
    allergenTags: ["peanut"],
  },
];

export const foodsById = new Map(foods.map((f) => [f.id, f]));

function recipe(
  idSuffix: string,
  partial: Omit<Recipe, "id" | "version" | "status" | "baseServings"> & {
    baseServings?: number;
  },
): Recipe {
  return {
    id: `33333333-3333-3333-3333-33333333${idSuffix}`,
    version: 1,
    status: "active",
    baseServings: partial.baseServings ?? 1,
    ...partial,
  };
}

function ingredient(
  recipeId: string,
  idSuffix: string,
  foodId: string,
  baseQuantityG: number,
  role: RecipeIngredient["role"],
  scalable: boolean,
  sortOrder: number,
  bounds?: { minMultiplier?: number; maxMultiplier?: number },
): RecipeIngredient {
  return {
    id: `44444444-4444-4444-4444-44444444${idSuffix}`,
    recipeId,
    foodId,
    baseQuantityG,
    role,
    scalable,
    minMultiplier: bounds?.minMultiplier,
    maxMultiplier: bounds?.maxMultiplier,
    sortOrder,
  };
}

export const chickenTikkaBowl = recipe("0001", {
  recipeKey: "chicken-tikka-rice-bowl",
  name: "Chicken tikka rice bowl",
  description: "Spiced chicken with rice and vegetables.",
  mealTypes: ["lunch", "dinner"],
  cuisineTags: ["indian"],
  dietaryTags: ["omnivore", "halal"],
  prepMinutes: 15,
  cookMinutes: 20,
  instructions: ["Cook rice", "Sear chicken with spices", "Assemble bowl"],
  cookingEquipment: ["stovetop"],
});

export const chickenTikkaIngredients: RecipeIngredient[] = [
  ingredient(chickenTikkaBowl.id, "0001", foods[0]!.id, 150, "protein", true, 1, {
    minMultiplier: 0.6,
    maxMultiplier: 2.2,
  }),
  ingredient(chickenTikkaBowl.id, "0002", foods[1]!.id, 180, "carbohydrate", true, 2, {
    minMultiplier: 0.4,
    maxMultiplier: 2.5,
  }),
  ingredient(chickenTikkaBowl.id, "0003", foods[12]!.id, 100, "vegetable", false, 3),
  ingredient(chickenTikkaBowl.id, "0004", foods[2]!.id, 8, "fat", true, 4, {
    minMultiplier: 0.25,
    maxMultiplier: 2,
  }),
];

export const proteinSmoothie = recipe("0002", {
  recipeKey: "protein-smoothie",
  name: "Protein smoothie",
  description: "Yogurt and whey smoothie with banana.",
  mealTypes: ["breakfast", "snack"],
  cuisineTags: ["american"],
  dietaryTags: ["vegetarian"],
  prepMinutes: 5,
  cookMinutes: 0,
  instructions: ["Blend all ingredients until smooth"],
  cookingEquipment: ["blender"],
});

export const proteinSmoothieIngredients: RecipeIngredient[] = [
  ingredient(proteinSmoothie.id, "0011", foods[5]!.id, 30, "protein", true, 1, {
    minMultiplier: 0.5,
    maxMultiplier: 2.5,
  }),
  ingredient(proteinSmoothie.id, "0012", foods[3]!.id, 150, "protein", true, 2, {
    minMultiplier: 0.5,
    maxMultiplier: 2,
  }),
  ingredient(proteinSmoothie.id, "0013", foods[4]!.id, 100, "carbohydrate", true, 3, {
    minMultiplier: 0.5,
    maxMultiplier: 2,
  }),
];

export const greekYogurtBowl = recipe("0003", {
  recipeKey: "greek-yogurt-bowl",
  name: "Greek yogurt bowl",
  description: "High-protein yogurt bowl with banana.",
  mealTypes: ["breakfast", "snack"],
  cuisineTags: ["american", "mediterranean"],
  dietaryTags: ["vegetarian"],
  prepMinutes: 5,
  cookMinutes: 0,
  instructions: ["Add yogurt to bowl", "Top with banana"],
  cookingEquipment: [],
});

export const greekYogurtBowlIngredients: RecipeIngredient[] = [
  ingredient(greekYogurtBowl.id, "0021", foods[3]!.id, 200, "protein", true, 1, {
    minMultiplier: 0.5,
    maxMultiplier: 2.5,
  }),
  ingredient(greekYogurtBowl.id, "0022", foods[4]!.id, 80, "carbohydrate", true, 2, {
    minMultiplier: 0.5,
    maxMultiplier: 2,
  }),
];

export const overnightOats = recipe("0004", {
  recipeKey: "overnight-oats",
  name: "Overnight oats",
  description: "Oats soaked with yogurt.",
  mealTypes: ["breakfast"],
  cuisineTags: ["american"],
  dietaryTags: ["vegetarian"],
  prepMinutes: 10,
  cookMinutes: 0,
  instructions: ["Mix oats and yogurt", "Refrigerate overnight"],
  cookingEquipment: [],
  storageInstructions: "Refrigerate up to 2 days",
});

export const overnightOatsIngredients: RecipeIngredient[] = [
  ingredient(overnightOats.id, "0031", foods[6]!.id, 60, "carbohydrate", true, 1, {
    minMultiplier: 0.5,
    maxMultiplier: 2,
  }),
  ingredient(overnightOats.id, "0032", foods[3]!.id, 150, "protein", true, 2, {
    minMultiplier: 0.5,
    maxMultiplier: 2.5,
  }),
];

export const eggAvocadoToast = recipe("0005", {
  recipeKey: "egg-avocado-toast",
  name: "Egg and avocado toast",
  description: "Eggs on toast with avocado.",
  mealTypes: ["breakfast"],
  cuisineTags: ["american"],
  dietaryTags: ["vegetarian"],
  prepMinutes: 10,
  cookMinutes: 8,
  instructions: ["Toast bread", "Cook eggs", "Mash avocado and assemble"],
  cookingEquipment: ["stovetop"],
});

export const eggAvocadoToastIngredients: RecipeIngredient[] = [
  ingredient(eggAvocadoToast.id, "0041", foods[7]!.id, 100, "protein", true, 1, {
    minMultiplier: 0.5,
    maxMultiplier: 2,
  }),
  ingredient(eggAvocadoToast.id, "0042", foods[9]!.id, 60, "carbohydrate", true, 2, {
    minMultiplier: 0.5,
    maxMultiplier: 2,
  }),
  ingredient(eggAvocadoToast.id, "0043", foods[8]!.id, 50, "fat", true, 3, {
    minMultiplier: 0.4,
    maxMultiplier: 2,
  }),
];

export const chickenKeema = recipe("0006", {
  recipeKey: "chicken-keema-rice",
  name: "Chicken keema with rice",
  description: "Minced-style chicken with rice.",
  mealTypes: ["lunch", "dinner"],
  cuisineTags: ["indian"],
  dietaryTags: ["omnivore", "halal"],
  prepMinutes: 15,
  cookMinutes: 25,
  instructions: ["Cook keema", "Serve with rice"],
  cookingEquipment: ["stovetop"],
});

export const chickenKeemaIngredients: RecipeIngredient[] = [
  ingredient(chickenKeema.id, "0051", foods[0]!.id, 160, "protein", true, 1, {
    minMultiplier: 0.6,
    maxMultiplier: 2.2,
  }),
  ingredient(chickenKeema.id, "0052", foods[1]!.id, 200, "carbohydrate", true, 2, {
    minMultiplier: 0.4,
    maxMultiplier: 2.5,
  }),
  ingredient(chickenKeema.id, "0053", foods[2]!.id, 10, "fat", true, 3, {
    minMultiplier: 0.25,
    maxMultiplier: 2,
  }),
];

export const burritoBowl = recipe("0007", {
  recipeKey: "chicken-burrito-bowl",
  name: "Chicken burrito bowl",
  description: "Chicken, rice, beans, and vegetables.",
  mealTypes: ["lunch", "dinner"],
  cuisineTags: ["mexican", "american"],
  dietaryTags: ["omnivore"],
  prepMinutes: 15,
  cookMinutes: 20,
  instructions: ["Cook components", "Assemble bowl"],
  cookingEquipment: ["stovetop"],
});

export const burritoBowlIngredients: RecipeIngredient[] = [
  ingredient(burritoBowl.id, "0061", foods[0]!.id, 140, "protein", true, 1, {
    minMultiplier: 0.6,
    maxMultiplier: 2.2,
  }),
  ingredient(burritoBowl.id, "0062", foods[1]!.id, 150, "carbohydrate", true, 2, {
    minMultiplier: 0.4,
    maxMultiplier: 2.5,
  }),
  ingredient(burritoBowl.id, "0063", foods[13]!.id, 100, "carbohydrate", false, 3),
  ingredient(burritoBowl.id, "0064", foods[12]!.id, 80, "vegetable", false, 4),
];

export const paneerRiceBowl = recipe("0008", {
  recipeKey: "paneer-rice-bowl",
  name: "Paneer rice bowl",
  description: "Paneer with rice and vegetables.",
  mealTypes: ["lunch", "dinner"],
  cuisineTags: ["indian"],
  dietaryTags: ["vegetarian"],
  prepMinutes: 15,
  cookMinutes: 15,
  instructions: ["Saute paneer", "Serve with rice and vegetables"],
  cookingEquipment: ["stovetop"],
});

export const paneerRiceBowlIngredients: RecipeIngredient[] = [
  ingredient(paneerRiceBowl.id, "0071", foods[10]!.id, 120, "protein", true, 1, {
    minMultiplier: 0.5,
    maxMultiplier: 2,
  }),
  ingredient(paneerRiceBowl.id, "0072", foods[1]!.id, 180, "carbohydrate", true, 2, {
    minMultiplier: 0.4,
    maxMultiplier: 2.5,
  }),
  ingredient(paneerRiceBowl.id, "0073", foods[12]!.id, 100, "vegetable", false, 3),
];

export const dalRice = recipe("0009", {
  recipeKey: "dal-rice-yogurt",
  name: "Dal rice with yogurt",
  description: "Lentils with rice and a yogurt side.",
  mealTypes: ["lunch", "dinner"],
  cuisineTags: ["indian"],
  dietaryTags: ["vegetarian", "halal"],
  prepMinutes: 10,
  cookMinutes: 30,
  instructions: ["Cook dal", "Cook rice", "Serve with yogurt"],
  cookingEquipment: ["stovetop"],
});

export const dalRiceIngredients: RecipeIngredient[] = [
  ingredient(dalRice.id, "0081", foods[11]!.id, 200, "protein", true, 1, {
    minMultiplier: 0.5,
    maxMultiplier: 2.2,
  }),
  ingredient(dalRice.id, "0082", foods[1]!.id, 180, "carbohydrate", true, 2, {
    minMultiplier: 0.4,
    maxMultiplier: 2.5,
  }),
  ingredient(dalRice.id, "0083", foods[3]!.id, 100, "protein", true, 3, {
    minMultiplier: 0.5,
    maxMultiplier: 2,
  }),
];

export const teriyakiBowl = recipe("0010", {
  recipeKey: "teriyaki-chicken-bowl",
  name: "Teriyaki chicken bowl",
  description: "Chicken with rice and vegetables.",
  mealTypes: ["lunch", "dinner"],
  cuisineTags: ["japanese", "american"],
  dietaryTags: ["omnivore"],
  prepMinutes: 15,
  cookMinutes: 20,
  instructions: ["Cook chicken", "Steam vegetables", "Serve over rice"],
  cookingEquipment: ["stovetop"],
});

export const teriyakiBowlIngredients: RecipeIngredient[] = [
  ingredient(teriyakiBowl.id, "0091", foods[0]!.id, 150, "protein", true, 1, {
    minMultiplier: 0.6,
    maxMultiplier: 2.2,
  }),
  ingredient(teriyakiBowl.id, "0092", foods[1]!.id, 180, "carbohydrate", true, 2, {
    minMultiplier: 0.4,
    maxMultiplier: 2.5,
  }),
  ingredient(teriyakiBowl.id, "0093", foods[12]!.id, 120, "vegetable", false, 3),
];

export const catalog = [
  { recipe: proteinSmoothie, ingredients: proteinSmoothieIngredients },
  { recipe: greekYogurtBowl, ingredients: greekYogurtBowlIngredients },
  { recipe: overnightOats, ingredients: overnightOatsIngredients },
  { recipe: eggAvocadoToast, ingredients: eggAvocadoToastIngredients },
  { recipe: chickenTikkaBowl, ingredients: chickenTikkaIngredients },
  { recipe: chickenKeema, ingredients: chickenKeemaIngredients },
  { recipe: burritoBowl, ingredients: burritoBowlIngredients },
  { recipe: paneerRiceBowl, ingredients: paneerRiceBowlIngredients },
  { recipe: dalRice, ingredients: dalRiceIngredients },
  { recipe: teriyakiBowl, ingredients: teriyakiBowlIngredients },
];
