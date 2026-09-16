import type {
  MealCompositionProposal,
  MealCompositionRequest,
  ResolvedRecipe,
} from "../../contracts/index.ts";
import { makeChickenTikkaResolvedRecipe, plan009SimpleResolvedRecipes } from "../food-resolution/fixtures.ts";
import type { MealCompositionProvider } from "./provider.ts";
import { detectExistingMealRoles, missingRolesFromProfile } from "./role-detection.ts";

export { makeChickenTikkaResolvedRecipe, plan009SimpleResolvedRecipes };

/** Already-complete meal: protein + carb + veg + sauce intrinsic. */
export function makeCompletePastaResolvedRecipe(): ResolvedRecipe {
  const base = makeChickenTikkaResolvedRecipe({
    recipeId: "recipe-pasta",
    candidateId: "pasta-complete",
    name: "Chicken Pasta Primavera",
    description: "Pasta with chicken, vegetables, and sauce.",
    ingredients: [
      {
        ingredientId: "pasta",
        name: "penne pasta",
        quantity: 400,
        unit: "g",
        role: "carbohydrate",
        scalingBehavior: "primary_scalable",
        measurementState: "raw",
      },
      {
        ingredientId: "chicken",
        name: "chicken breast",
        quantity: 500,
        unit: "g",
        role: "protein",
        scalingBehavior: "primary_scalable",
        measurementState: "raw",
      },
      {
        ingredientId: "broccoli",
        name: "broccoli florets",
        quantity: 250,
        unit: "g",
        role: "vegetable",
        scalingBehavior: "secondary_scalable",
      },
      {
        ingredientId: "sauce",
        name: "tomato basil sauce",
        quantity: 300,
        unit: "g",
        role: "sauce",
        scalingBehavior: "secondary_scalable",
      },
    ],
    mealComponents: [
      {
        componentId: "main",
        name: "Chicken Pasta Primavera",
        type: "main",
        required: true,
        purpose: "Complete pasta dish",
        relationship: "intrinsic",
      },
    ],
    flavorProfile: {
      cuisineFamily: "Italian",
      flavorFamilies: ["savory", "herby"],
      cookingTechniques: ["saute", "boil"],
      textureProfile: ["al dente"],
      primarySauce: "tomato basil",
    },
    experienceProfile: {
      moistureLevel: "saucy",
      flavorIntensity: "medium",
      textureTags: ["al dente"],
      mealPrepQuality: "good",
    },
  });
  return base;
}

/** Tacos with intrinsic tortilla + slaw + salsa ingredients. */
export function makeIntrinsicTacoResolvedRecipe(): ResolvedRecipe {
  return makeChickenTikkaResolvedRecipe({
    recipeId: "recipe-tacos-intrinsic",
    candidateId: "tacos-intrinsic",
    name: "Chile-Lime Shrimp Tacos",
    description: "Shrimp tacos with tortillas, slaw, and salsa.",
    ingredients: [
      {
        ingredientId: "shrimp",
        name: "shrimp",
        quantity: 400,
        unit: "g",
        role: "protein",
        scalingBehavior: "primary_scalable",
        measurementState: "raw",
      },
      {
        ingredientId: "tortilla",
        name: "corn tortilla",
        quantity: 8,
        unit: "piece",
        role: "carb",
        scalingBehavior: "ratio_bound",
      },
      {
        ingredientId: "cabbage",
        name: "cabbage slaw",
        quantity: 150,
        unit: "g",
        role: "vegetable",
        scalingBehavior: "secondary_scalable",
      },
      {
        ingredientId: "salsa",
        name: "pico de gallo salsa",
        quantity: 100,
        unit: "g",
        role: "sauce",
        scalingBehavior: "fixed",
      },
    ],
    mealComponents: [
      {
        componentId: "main",
        name: "Shrimp Tacos",
        type: "main",
        required: true,
        purpose: "Taco assembly",
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
        purpose: "Crunch and fiber",
        relationship: "intrinsic",
      },
      {
        componentId: "salsa",
        name: "salsa",
        type: "condiment",
        required: true,
        purpose: "Moisture and brightness",
        relationship: "intrinsic",
      },
    ],
    flavorProfile: {
      cuisineFamily: "Mexican",
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
  });
}

/**
 * Deterministic mock provider for tests — culinary fixtures, no live Gemini.
 */
export class MockMealCompositionProvider implements MealCompositionProvider {
  readonly calls: MealCompositionRequest[] = [];
  private readonly overrides: Map<string, MealCompositionProposal>;

  constructor(overrides?: Record<string, MealCompositionProposal>) {
    this.overrides = new Map(Object.entries(overrides ?? {}));
  }

  async compose(request: MealCompositionRequest): Promise<MealCompositionProposal> {
    this.calls.push(request);
    const override = this.overrides.get(request.recipe.candidateId);
    if (override) return override;

    const detected = detectExistingMealRoles(request.recipe, request.recipeNutrition);
    const missing = missingRolesFromProfile(detected.profile, detected.nutritionSignals);

    if (missing.length === 0) {
      return {
        mealName: request.recipe.name,
        alreadySatisfiedRoles: ["main", "carbohydrate", "vegetable", "sauce_condiment"],
        missingRoles: [],
        addedComponents: [],
        compositionSummary: "Already complete.",
        noAdditionsNeeded: true,
      };
    }

    const cuisine = (
      request.cuisineFamily ?? request.recipe.flavorProfile.cuisineFamily
    ).toLowerCase();
    const added: MealCompositionProposal["addedComponents"] = [];

    if (missing.includes("carbohydrate")) {
      const riceName = cuisine.includes("thai") || cuisine.includes("viet")
        ? "jasmine rice"
        : cuisine.includes("jamaican") || cuisine.includes("caribbean")
          ? "rice and peas"
          : "basmati rice";
      if (riceName === "rice and peas") {
        added.push({
          name: riceName,
          role: "carbohydrate",
          relationship: "required_companion",
          reason: "Traditional Caribbean starch accompaniment",
          definitionKind: "recipe_component",
          recipeIngredients: [
            { name: "long-grain rice", quantity: 200, unit: "g", role: "carbohydrate" },
            { name: "pigeon peas", quantity: 100, unit: "g", role: "legume" },
            { name: "coconut milk", quantity: 100, unit: "g", role: "sauce" },
          ],
        });
      } else {
        added.push({
          name: riceName,
          role: "carbohydrate",
          relationship: "required_companion",
          reason: "Traditional starch accompaniment for this cuisine",
          definitionKind: "atomic_food",
          preparation: "steamed",
          measurementState: "cooked",
        });
      }
    }

    if (missing.includes("vegetable")) {
      if (cuisine.includes("indian")) {
        added.push({
          name: "kachumber",
          role: "vegetable",
          relationship: "required_companion",
          reason: "Fresh cucumber-onion-tomato salad traditionally served with Indian grills",
          definitionKind: "recipe_component",
          recipeIngredients: [
            { name: "cucumber", quantity: 150, unit: "g", role: "vegetable" },
            { name: "tomato", quantity: 100, unit: "g", role: "vegetable" },
            { name: "onion", quantity: 50, unit: "g", role: "vegetable" },
            { name: "lemon juice", quantity: 15, unit: "g", role: "acid" },
            { name: "cilantro", quantity: 10, unit: "g", role: "garnish" },
          ],
          instructions: ["Dice vegetables", "Toss with lemon and cilantro"],
        });
      } else if (cuisine.includes("jamaican") || cuisine.includes("caribbean")) {
        added.push({
          name: "festival cabbage slaw",
          role: "vegetable",
          relationship: "recommended",
          reason: "Crisp vinegar slaw balances jerk heat",
          definitionKind: "recipe_component",
          recipeIngredients: [
            { name: "cabbage", quantity: 200, unit: "g", role: "vegetable" },
            { name: "carrot", quantity: 50, unit: "g", role: "vegetable" },
            { name: "vinegar", quantity: 20, unit: "g", role: "acid" },
          ],
        });
      } else {
        added.push({
          name: "quick pickled vegetables",
          role: "vegetable",
          relationship: "recommended",
          reason: "Fresh pickled vegetables complement the main",
          definitionKind: "recipe_component",
          recipeIngredients: [
            { name: "cucumber", quantity: 100, unit: "g", role: "vegetable" },
            { name: "carrot", quantity: 80, unit: "g", role: "vegetable" },
            { name: "rice vinegar", quantity: 30, unit: "g", role: "acid" },
          ],
        });
      }
    }

    if (missing.includes("sauce_condiment")) {
      if (cuisine.includes("indian")) {
        added.push({
          name: "mint-yogurt chutney",
          role: "sauce_condiment",
          relationship: "recommended",
          reason: "Cooling yogurt condiment traditionally served with tikka and dry fries",
          definitionKind: "recipe_component",
          recipeIngredients: [
            { name: "plain yogurt", quantity: 120, unit: "g", role: "sauce" },
            { name: "mint leaves", quantity: 20, unit: "g", role: "herb" },
            { name: "cilantro", quantity: 15, unit: "g", role: "herb" },
            { name: "green chili", quantity: 5, unit: "g", role: "seasoning" },
          ],
        });
      }
    }

    return {
      mealName: `${request.recipe.name} plate`,
      alreadySatisfiedRoles: ["main"],
      missingRoles: missing,
      addedComponents: added,
      compositionSummary: `Complete ${request.recipe.name} with culturally appropriate companions.`,
      noAdditionsNeeded: added.length === 0,
    };
  }
}
