import type {
  MealCompositionProposal,
  MealCompositionRequest,
  ResolvedRecipe,
} from "../../contracts/index.ts";
import { makeChickenTikkaResolvedRecipe, plan009SimpleResolvedRecipes } from "../food-resolution/fixtures.ts";
import { detectRolesForCompositionRequest } from "./candidate-role-detection.ts";
import { subjectCandidateFromRequest } from "./prompt.ts";
import type { MealCompositionProvider } from "./provider.ts";
import { missingRolesFromProfile } from "./role-detection.ts";

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
    const candidate = subjectCandidateFromRequest(request);
    const override = this.overrides.get(candidate.candidateId);
    if (override) return override;

    const detected = detectRolesForCompositionRequest({
      candidate,
      recipe: request.recipe,
    });
    const missing = missingRolesFromProfile(detected.profile, {
      proteinPresence: detected.profile.hasPrimaryProtein ? "meaningful" : "low",
      carbohydratePresence: detected.profile.hasMeaningfulCarbohydrate ? "meaningful" : "low",
      fiberPresence: detected.profile.hasMeaningfulFiberSource ? "meaningful" : "low",
    });

    if (missing.length === 0) {
      return {
        mealName: candidate.name,
        alreadySatisfiedRoles: ["main", "carbohydrate", "vegetable", "sauce_condiment"],
        missingRoles: [],
        addedComponents: [],
        compositionSummary: "Already complete.",
        noAdditionsNeeded: true,
      };
    }

    const cuisine = [
      request.cuisineFamily ?? candidate.cuisineFamily,
      request.regionalStyle ?? candidate.regionalStyle ?? "",
      candidate.name,
    ]
      .join(" ")
      .toLowerCase();
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
      if (cuisine.includes("kerala") || /beef fry/i.test(candidate.name)) {
        added.push({
          name: "cabbage thoran",
          role: "vegetable",
          relationship: "required_companion",
          reason: "Traditional Kerala coconut vegetable side",
          definitionKind: "recipe_component",
        });
      } else if (cuisine.includes("indian")) {
        added.push({
          name: "kachumber",
          role: "vegetable",
          relationship: "required_companion",
          reason: "Fresh cucumber-onion-tomato salad traditionally served with Indian grills",
          definitionKind: "recipe_component",
        });
      } else if (cuisine.includes("jamaican") || cuisine.includes("caribbean")) {
        added.push({
          name: "steamed cabbage",
          role: "vegetable",
          relationship: "recommended",
          reason: "Simple cabbage side that balances jerk heat",
          definitionKind: "recipe_component",
        });
      } else {
        added.push({
          name: "quick pickled vegetables",
          role: "vegetable",
          relationship: "recommended",
          reason: "Fresh pickled vegetables complement the main",
          definitionKind: "recipe_component",
        });
      }
    }

    if (missing.includes("sauce_condiment")) {
      if (cuisine.includes("indian")) {
        if (cuisine.includes("kerala") || /beef fry/i.test(candidate.name)) {
          added.push({
            name: "cucumber pachadi",
            role: "sauce_condiment",
            relationship: "recommended",
            reason: "Cooling yogurt-cucumber accompaniment for Kerala dry fries",
            definitionKind: "recipe_component",
          });
        } else {
          added.push({
            name: "mint-yogurt chutney",
            role: "sauce_condiment",
            relationship: "recommended",
            reason: "Cooling yogurt condiment traditionally served with tikka and dry fries",
            definitionKind: "recipe_component",
          });
        }
      }
    }

    return {
      mealName: `${candidate.name}`,
      alreadySatisfiedRoles: ["main"],
      missingRoles: missing,
      addedComponents: added,
      compositionSummary: `Complete ${candidate.name} with culturally appropriate companions.`,
      noAdditionsNeeded: added.length === 0,
    };
  }
}
