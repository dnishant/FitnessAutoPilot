import { describe, expect, it } from "vitest";
import {
  calculateFiberTarget,
  composeCompleteMeal,
  composeWeeklyMeals,
  detectExistingMealRoles,
  FIBER_GRAMS_PER_1000_KCAL,
  FIBER_POLICY_VERSION,
  looksLikeCompoundComponent,
  makeChickenTikkaResolvedRecipe,
  makeCompletePastaResolvedRecipe,
  makeIntrinsicTacoResolvedRecipe,
  MockMealCompositionProvider,
  normalizeComponentName,
  plan009SimpleResolvedRecipes,
  validateMealCompositionProposal,
} from "../index";
import { calculateMacroTargets } from "../nutrition/macros";

describe("fiber-policy-v1", () => {
  it("calculates daily fiber from calorie target × 14 g / 1000 kcal", () => {
    const result = calculateFiberTarget({ targetCalories: 2000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fiberGrams).toBe(28);
      expect(result.value.displayFiberGrams).toBe(28);
      expect(result.value.policyVersion).toBe(FIBER_POLICY_VERSION);
      expect(FIBER_GRAMS_PER_1000_KCAL).toBe(14);
    }
  });

  it("uses half-up display rounding", () => {
    const result = calculateFiberTarget({ targetCalories: 2250 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fiberGrams).toBeCloseTo(31.5, 10);
      expect(result.value.displayFiberGrams).toBe(32);
    }
  });

  it("is included in macro-policy targets", () => {
    const macros = calculateMacroTargets({
      targetCalories: 2000,
      weightLb: 180,
      asOf: new Date("2026-09-16T00:00:00.000Z"),
    });
    expect(macros.ok).toBe(true);
    if (macros.ok) {
      expect(macros.value.fiberGrams).toBe(28);
      expect(macros.value.fiberPolicyVersion).toBe("fiber-policy-v1");
      expect(macros.value.inputSnapshot.fiberPolicyVersion).toBe("fiber-policy-v1");
    }
  });
});

describe("PLAN-009.5 role detection", () => {
  it("detects Chicken Tikka as protein-forward with PLAN-008 rice companion", () => {
    const recipe = makeChickenTikkaResolvedRecipe();
    const detected = detectExistingMealRoles(recipe);
    expect(detected.profile.hasPrimaryProtein).toBe(true);
    expect(detected.profile.hasMeaningfulCarbohydrate).toBe(true);
    expect(detected.profile.hasMeaningfulVegetableOrFruit).toBe(false);
    expect(detected.existingComponents.some((c) => c.name === "basmati rice")).toBe(true);
  });

  it("detects intrinsic taco components without needing additions", () => {
    const recipe = makeIntrinsicTacoResolvedRecipe();
    const detected = detectExistingMealRoles(recipe);
    expect(detected.profile.hasPrimaryProtein).toBe(true);
    expect(detected.profile.hasMeaningfulCarbohydrate).toBe(true);
    expect(detected.profile.hasMeaningfulVegetableOrFruit).toBe(true);
    expect(detected.profile.hasSauceOrMoistureComponent).toBe(true);
  });

  it("does not treat 1 tbsp aromatic as meaningful vegetable", () => {
    const recipe = makeChickenTikkaResolvedRecipe({
      ingredients: [
        {
          ingredientId: "chicken",
          name: "chicken",
          quantity: 500,
          unit: "g",
          role: "protein",
          scalingBehavior: "primary_scalable",
        },
        {
          ingredientId: "onion",
          name: "onion",
          quantity: 1,
          unit: "tbsp",
          role: "aromatic",
          scalingBehavior: "fixed",
        },
      ],
      mealComponents: [
        {
          componentId: "main",
          name: "Chicken",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
      ],
    });
    const detected = detectExistingMealRoles(recipe);
    expect(detected.profile.hasMeaningfulVegetableOrFruit).toBe(false);
  });
});

describe("PLAN-009.5 composition", () => {
  it("adds culturally appropriate roles for incomplete Chicken Tikka", async () => {
    const provider = new MockMealCompositionProvider();
    const recipe = makeChickenTikkaResolvedRecipe({
      experienceProfile: {
        moistureLevel: "dry",
        flavorIntensity: "bold",
        textureTags: ["tender"],
        mealPrepQuality: "excellent",
      },
    });
    const result = await composeCompleteMeal(
      {
        mealType: "lunch",
        recipe,
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
      },
      { provider, resolveAddedComponents: false, providerMeta: { provider: "mock" } },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const added = result.value.components.filter((c) => c.source === "composition_engine");
    expect(added.some((c) => c.role === "vegetable")).toBe(true);
    expect(added.some((c) => c.role === "sauce_condiment")).toBe(true);
    expect(added.every((c) => c.quantityMode === "solver_determined")).toBe(true);
    expect(added.every((c) => !("caloriesKcal" in c))).toBe(true);
    const kachumber = added.find((c) => /kachumber/i.test(c.name));
    expect(kachumber?.definitionKind).toBe("recipe_component");
    expect(kachumber?.definition?.kind).toBe("recipe_component");
  });

  it("does not expand an already-complete pasta meal", async () => {
    const provider = new MockMealCompositionProvider();
    const result = await composeCompleteMeal(
      {
        mealType: "dinner",
        recipe: makeCompletePastaResolvedRecipe(),
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
      },
      { provider, resolveAddedComponents: false },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.components.filter((c) => c.source === "composition_engine")).toHaveLength(
      0,
    );
    expect(provider.calls.length).toBe(0);
  });

  it("does not add another tortilla when intrinsic carb exists", async () => {
    const provider = new MockMealCompositionProvider();
    const result = await composeCompleteMeal(
      {
        mealType: "dinner",
        recipe: makeIntrinsicTacoResolvedRecipe(),
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
      },
      { provider, resolveAddedComponents: false },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const carbs = result.value.components.filter((c) => c.role === "carbohydrate");
    expect(carbs.every((c) => c.source !== "composition_engine")).toBe(true);
    expect(
      result.value.components.filter((c) => c.source === "composition_engine"),
    ).toHaveLength(0);
  });

  it("represents atomic rice distinctly from compound kachumber", async () => {
    expect(looksLikeCompoundComponent("kachumber")).toBe(true);
    expect(looksLikeCompoundComponent("basmati rice")).toBe(false);
    const provider = new MockMealCompositionProvider({
      "tikka-chicken": {
        mealName: "Chicken Tikka plate",
        alreadySatisfiedRoles: ["main"],
        missingRoles: ["carbohydrate", "vegetable"],
        addedComponents: [
          {
            name: "basmati rice",
            role: "carbohydrate",
            relationship: "required_companion",
            reason: "Traditional starch",
            definitionKind: "atomic_food",
            preparation: "steamed",
            measurementState: "cooked",
          },
          {
            name: "kachumber",
            role: "vegetable",
            relationship: "required_companion",
            reason: "Fresh salad",
            definitionKind: "recipe_component",
            recipeIngredients: [
              { name: "cucumber", quantity: 100, unit: "g" },
              { name: "tomato", quantity: 80, unit: "g" },
            ],
          },
        ],
        compositionSummary: "Rice + kachumber",
      },
    });
    // Remove PLAN-008 rice so mock carb addition is allowed.
    const recipe = makeChickenTikkaResolvedRecipe({
      mealComponents: [
        {
          componentId: "main",
          name: "Chicken Tikka",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
      ],
      experienceProfile: {
        moistureLevel: "dry",
        flavorIntensity: "bold",
        textureTags: [],
        mealPrepQuality: "excellent",
      },
    });
    const result = await composeCompleteMeal(
      { mealType: "lunch", recipe, allergies: [], dietaryRestrictions: [], dislikes: [] },
      { provider, resolveAddedComponents: false },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rice = result.value.components.find((c) => c.name === "basmati rice");
    const kachumber = result.value.components.find((c) => c.name === "kachumber");
    expect(rice?.definitionKind).toBe("atomic_food");
    expect(kachumber?.definitionKind).toBe("recipe_component");
  });

  it("propagates allergy hard constraints", async () => {
    const provider = new MockMealCompositionProvider({
      "tikka-chicken": {
        mealName: "Chicken Tikka",
        alreadySatisfiedRoles: ["main"],
        missingRoles: ["sauce_condiment"],
        addedComponents: [
          {
            name: "peanut chutney",
            role: "sauce_condiment",
            relationship: "recommended",
            reason: "test",
            definitionKind: "recipe_component",
            recipeIngredients: [
              { name: "peanuts", quantity: 50, unit: "g" },
              { name: "chili", quantity: 5, unit: "g" },
            ],
          },
        ],
        compositionSummary: "bad",
      },
    });
    const recipe = makeChickenTikkaResolvedRecipe({
      mealComponents: [
        {
          componentId: "main",
          name: "Chicken Tikka",
          type: "main",
          required: true,
          purpose: "Main",
          relationship: "intrinsic",
        },
      ],
      experienceProfile: {
        moistureLevel: "dry",
        flavorIntensity: "bold",
        textureTags: [],
        mealPrepQuality: "excellent",
      },
    });
    const result = await composeCompleteMeal(
      {
        mealType: "lunch",
        recipe,
        allergies: ["peanut"],
        dietaryRestrictions: [],
        dislikes: [],
      },
      { provider, resolveAddedComponents: false },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("HARD_CONSTRAINT_CONFLICT");
    }
  });

  it("rejects AI nutrition and personalized quantities on proposals", () => {
    const recipe = makeChickenTikkaResolvedRecipe();
    const detected = detectExistingMealRoles(recipe);
    const validated = validateMealCompositionProposal(
      {
        mealName: "x",
        alreadySatisfiedRoles: ["main"],
        missingRoles: [],
        addedComponents: [
          {
            name: "basmati rice",
            role: "carbohydrate",
            relationship: "required_companion",
            reason: "x",
            definitionKind: "atomic_food",
            caloriesKcal: 200,
            grams: 150,
          },
        ],
        compositionSummary: "x",
      },
      {
        mealType: "dinner",
        recipe,
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
        compositionContext: { existingRoles: { ...detected.profile, hasMeaningfulCarbohydrate: false } },
      },
    );
    expect(validated.ok).toBe(false);
  });

  it("rejects fake USDA atomic for compound kachumber", () => {
    const recipe = makeChickenTikkaResolvedRecipe();
    const detected = detectExistingMealRoles(recipe);
    const validated = validateMealCompositionProposal(
      {
        mealName: "x",
        alreadySatisfiedRoles: ["main"],
        missingRoles: ["vegetable"],
        addedComponents: [
          {
            name: "kachumber",
            role: "vegetable",
            relationship: "required_companion",
            reason: "x",
            definitionKind: "atomic_food",
          },
        ],
        compositionSummary: "x",
      },
      {
        mealType: "dinner",
        recipe,
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
        compositionContext: {
          existingRoles: { ...detected.profile, hasMeaningfulVegetableOrFruit: false },
        },
      },
    );
    expect(validated.ok).toBe(false);
    if (!validated.ok) {
      expect(validated.error.message).toMatch(/recipe_component/);
    }
  });

  it("dedupes weekly equivalent component keys across meals", async () => {
    const provider = new MockMealCompositionProvider();
    const recipes = plan009SimpleResolvedRecipes().slice(0, 2).map((r) =>
      makeChickenTikkaResolvedRecipe({
        ...r,
        experienceProfile: {
          ...r.experienceProfile,
          moistureLevel: "dry",
        },
        flavorProfile: {
          ...r.flavorProfile,
          cuisineFamily: "Indian",
        },
      }),
    );
    // Force both to need vegetable+sauce with same mock names via cuisine.
    const weekly = await composeWeeklyMeals({
      recipes,
      provider,
      resolveAddedComponents: false,
      targetCalories: 2000,
      allergies: [],
      dietaryRestrictions: [],
      dislikes: [],
      providerMeta: { provider: "mock" },
      slotCount: 4,
    });
    expect(weekly.result.fiberTarget?.displayFiberGrams).toBe(28);
    expect(weekly.result.policyVersions.fiber).toBe("fiber-policy-v1");
    expect(weekly.result.diagnostics.uniqueMainRecipes).toBe(2);
    // Shared kachumber / chutney keys should collapse.
    const vegKeys = Object.keys(weekly.result.sharedComponentsByKey).filter((k) =>
      k.startsWith("vegetable:"),
    );
    expect(vegKeys.length).toBeLessThanOrEqual(2);
  });

  it("composes unique mains once for six-dish week", async () => {
    const provider = new MockMealCompositionProvider();
    const recipes = plan009SimpleResolvedRecipes();
    const weekly = await composeWeeklyMeals({
      recipes,
      provider,
      resolveAddedComponents: false,
      targetCalories: 2250,
      slotCount: 14,
      allergies: [],
      dietaryRestrictions: [],
      dislikes: [],
    });
    expect(weekly.result.mealCount).toBe(6);
    expect(weekly.result.diagnostics.uniqueMainRecipes).toBe(6);
    expect(weekly.result.diagnostics.compositionProviderCalls).toBeLessThanOrEqual(6);
    expect(weekly.failures).toHaveLength(0);
  });
});

describe("component identity", () => {
  it("normalizes names for dedup", () => {
    expect(normalizeComponentName("Mint-Yogurt Chutney")).toBe("mint yogurt chutney");
  });
});
