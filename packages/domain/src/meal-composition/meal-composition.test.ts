import { describe, expect, it } from "vitest";
import {
  calculateFiberTarget,
  composeCompleteMeal,
  composeMealConcept,
  composeMealConcepts,
  composeRankedRepertoireForWeeklyStrategy,
  composeWeeklyMeals,
  detectExistingCandidateRoles,
  detectExistingMealRoles,
  FIBER_GRAMS_PER_1000_KCAL,
  FIBER_POLICY_VERSION,
  looksLikeCompoundComponent,
  namesLikelyEquivalent,
  makeChickenTikkaResolvedRecipe,
  makeCompletePastaResolvedRecipe,
  makeIntrinsicTacoResolvedRecipe,
  makeRankedCandidate,
  MockComponentRecipeProvider,
  MockMealCompositionProvider,
  normalizeComponentName,
  pipelineDiagnostics,
  plan009SimpleResolvedRecipes,
  resolveSelectedCompleteMeals,
  resolveSelectedPipelineMeals,
  SHRIMP_TACOS,
  CHICKEN_TIKKA,
  KERALA_BEEF_FRY,
  JAMAICAN_JERK_CHICKEN,
  THAI_GREEN_CURRY,
  sampleRankedWeeklyStrategyRequest,
  summarizeMealConceptRepertoire,
  validateMealCompositionProposal,
  buildRankedWeeklyStrategyPrompt,
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
        mealUnderstanding: {
          mealForm: "main_only",
          isStandaloneMeal: false,
          dishSummary: "Dry grilled chicken needing companions",
          howItIsEaten: "With rice and salad",
          existingComponents: [{ name: "Chicken Tikka", role: "main", integration: "integrated_in_dish" }],
          satisfiedNeeds: ["protein_structure"],
          missingNeeds: ["carbohydrate_accompaniment", "fresh_vegetable_accompaniment"],
          additionsRecommended: true,
          confidence: "high",
        },
        alreadySatisfiedRoles: ["main"],
        missingRoles: ["carbohydrate", "vegetable"],
        addedComponents: [
          {
            name: "basmati rice",
            role: "carbohydrate",
            relationship: "required_companion",
            reason: "Traditional starch",
            culinaryReason: "Needs starch companion",
            satisfiesMissingNeed: "carbohydrate_accompaniment",
            definitionKind: "atomic_food",
            preparation: "steamed",
            measurementState: "cooked",
          },
          {
            name: "kachumber",
            role: "vegetable",
            relationship: "required_companion",
            reason: "Fresh salad",
            culinaryReason: "Needs fresh vegetable companion",
            satisfiesMissingNeed: "fresh_vegetable_accompaniment",
            definitionKind: "recipe_component",
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
        mealUnderstanding: {
          mealForm: "main_only",
          isStandaloneMeal: false,
          dishSummary: "Main needing sauce",
          howItIsEaten: "With condiment",
          existingComponents: [{ name: "Chicken Tikka", role: "main", integration: "integrated_in_dish" }],
          satisfiedNeeds: ["protein_structure"],
          missingNeeds: ["moisture_sauce"],
          additionsRecommended: true,
          confidence: "high",
        },
        alreadySatisfiedRoles: ["main"],
        missingRoles: ["sauce_condiment"],
        addedComponents: [
          {
            name: "peanut chutney",
            role: "sauce_condiment",
            relationship: "recommended",
            reason: "test",
            culinaryReason: "test",
            satisfiesMissingNeed: "moisture_sauce",
            definitionKind: "recipe_component",
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
        mealUnderstanding: {
          mealForm: "main_only",
          isStandaloneMeal: false,
          dishSummary: "x",
          howItIsEaten: "x",
          existingComponents: [],
          satisfiedNeeds: ["protein_structure"],
          missingNeeds: ["carbohydrate_accompaniment"],
          additionsRecommended: true,
          confidence: "high",
        },
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
        mealUnderstanding: {
          mealForm: "main_only",
          isStandaloneMeal: false,
          dishSummary: "x",
          howItIsEaten: "x",
          existingComponents: [],
          satisfiedNeeds: ["protein_structure"],
          missingNeeds: ["fresh_vegetable_accompaniment"],
          additionsRecommended: true,
          confidence: "high",
        },
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

  it("does not collapse distinct cabbage sides into one identity", () => {
    expect(namesLikelyEquivalent("cabbage slaw", "slaw")).toBe(true);
    expect(namesLikelyEquivalent("cabbage thoran", "steamed cabbage")).toBe(false);
  });
});

describe("lightweight meal-composition-v2", () => {
  it("composes ranked candidates before weekly strategy and omits recipe details", async () => {
    const provider = new MockMealCompositionProvider();
    const request = sampleRankedWeeklyStrategyRequest({
      lunchCandidates: [makeRankedCandidate(CHICKEN_TIKKA, 1), makeRankedCandidate(KERALA_BEEF_FRY, 2)],
      dinnerCandidates: [makeRankedCandidate(JAMAICAN_JERK_CHICKEN, 1)],
    });
    const composed = await composeRankedRepertoireForWeeklyStrategy({
      request,
      provider,
      providerMeta: { provider: "mock" },
    });
    expect(composed.concepts.conceptCount).toBe(3);
    const prompt = buildRankedWeeklyStrategyPrompt(composed.request);
    expect(prompt.userPrompt).toMatch(/basmati rice/i);
    expect(prompt.userPrompt).toMatch(/kachumber/i);
    expect(prompt.systemInstruction).toContain("Ingredient/component reuse is NOT meal repetition");
    const tikka = composed.concepts.conceptsByCandidateId[CHICKEN_TIKKA.candidateId]!;
    const serialized = JSON.stringify(tikka);
    expect(serialized).not.toMatch(/recipeIngredients|instructions|"quantity":/);
    expect(tikka.components.every((c) => !("instructions" in c) && !("definition" in c))).toBe(true);
  });

  it("does not generate detailed recipes for unselected candidates", async () => {
    const provider = new MockMealCompositionProvider();
    const ranked = [
      CHICKEN_TIKKA,
      KERALA_BEEF_FRY,
      JAMAICAN_JERK_CHICKEN,
      THAI_GREEN_CURRY,
      SHRIMP_TACOS,
    ].map((candidate, index) => makeRankedCandidate(candidate, index + 1));
    const extra = Array.from({ length: 5 }, (_, index) =>
      makeRankedCandidate(
        {
          ...CHICKEN_TIKKA,
          candidateId: `extra-${index}`,
          name: `Extra Grill ${index}`,
          dishFormat: "tikka kebab",
        },
        index + 6,
      ),
    );
    const all = [...ranked, ...extra];
    const composed = await composeMealConcepts({
      rankedCandidates: all,
      provider,
    });
    expect(composed.result.uniqueCandidateIds).toHaveLength(10);
    const selected = ranked.slice(0, 4).map((item) => item.candidate.candidateId);
    const recipes = Object.fromEntries(
      selected.map((id) => {
        const rankedItem = all.find((item) => item.candidate.candidateId === id)!;
        return [id, makeChickenTikkaResolvedRecipe({ candidateId: id, name: rankedItem.candidate.name })];
      }),
    );
    const componentProvider = new MockComponentRecipeProvider();
    const recipeCalls: string[] = [];
    const resolved = await resolveSelectedPipelineMeals({
      strategy: {
        days: (
          ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const
        ).map((day, i) => {
          const id = selected[i % selected.length]!;
          const name = all.find((item) => item.candidate.candidateId === id)!.candidate.name;
          return {
            day,
            lunch: {
              day,
              mealType: "lunch" as const,
              candidateId: id,
              name,
              prepIntent: "fully_prepped" as const,
              planningReason: "Selected for selected-only resolution test.",
            },
            dinner: {
              day,
              mealType: "dinner" as const,
              candidateId: id,
              name,
              prepIntent: "quick_fresh_finish" as const,
              planningReason: "Selected for selected-only resolution test.",
            },
          };
        }),
        uniqueCandidateIds: selected,
        flexibleDay: "sunday" as const,
        strategySummary: {
          varietyApproach: "test",
          prepApproach: "test",
          ingredientReuseApproach: "test",
        },
        metadata: { provider: "test", model: "test", promptVersion: "weekly-strategy-ranked-v1.5.0" },
      },
      concepts: composed.result,
      candidatesById: new Map(all.map((item) => [item.candidate.candidateId, item.candidate])),
      recipeResolver: {
        async resolve(request) {
          recipeCalls.push(request.candidate.candidateId);
          return recipes[request.candidate.candidateId]!;
        },
      },
      componentRecipeProvider: componentProvider,
    });
    expect(recipeCalls.sort()).toEqual([...selected].sort());
    expect(recipeCalls).toHaveLength(4);
    expect(Object.keys(resolved.completeMeals.mealsByCandidateId).sort()).toEqual([...selected].sort());
    expect(componentProvider.calls.length).toBeGreaterThan(0);
    expect(componentProvider.calls.every((call) => selected.includes(call.candidate.candidateId))).toBe(
      true,
    );
    expect(
      extra.every(
        (item) =>
          !componentProvider.calls.some((call) => call.candidate.candidateId === item.candidate.candidateId),
      ),
    ).toBe(true);
    expect(resolved.uniqueMainRecipesResolved).toBe(4);
    expect(resolved.uniqueComponentRecipesResolved).toBeGreaterThan(0);
  });

  it("treats shrimp tacos as already complete when recipe structure is complete", async () => {
    const provider = new MockMealCompositionProvider();
    const recipe = makeIntrinsicTacoResolvedRecipe();
    const detected = detectExistingCandidateRoles(SHRIMP_TACOS);
    // Candidate-only detection must not invent placeholders.
    expect(detected.existingComponents).toHaveLength(1);
    expect(detected.existingComponents.every((c) => c.role === "main")).toBe(true);

    const result = await composeMealConcept(
      {
        mealType: "dinner",
        candidate: SHRIMP_TACOS,
        recipe,
        allergies: [],
        dietaryRestrictions: [],
        dislikes: [],
      },
      { provider },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.components.filter((c) => c.source === "composition_engine")).toHaveLength(0);
    expect(provider.calls).toHaveLength(0);
  });

  it("exposes basmati rice reuse across two Indian meals", async () => {
    const provider = new MockMealCompositionProvider();
    const composed = await composeMealConcepts({
      rankedCandidates: [makeRankedCandidate(CHICKEN_TIKKA, 1), makeRankedCandidate(KERALA_BEEF_FRY, 2)],
      provider,
    });
    const reuse = composed.result.componentReuse.find((entry) =>
      /basmati rice/i.test(entry.name),
    );
    expect(reuse?.usedByCandidateIds).toEqual(
      expect.arrayContaining([CHICKEN_TIKKA.candidateId, KERALA_BEEF_FRY.candidateId]),
    );
    const request = sampleRankedWeeklyStrategyRequest({
      lunchCandidates: [makeRankedCandidate(CHICKEN_TIKKA, 1)],
      dinnerCandidates: [makeRankedCandidate(KERALA_BEEF_FRY, 1)],
      mealConceptsByCandidateId: composed.result.conceptsByCandidateId,
    });
    expect(buildRankedWeeklyStrategyPrompt(request).userPrompt).toMatch(/Basmati Rice/i);
  });

  it("distinguishes compact reusable plates from a large unique-side collection", () => {
    const compact = summarizeMealConceptRepertoire([
      {
        candidateId: "a",
        name: "Chicken Tikka",
        main: {
          componentId: "main",
          role: "main",
          name: "Chicken Tikka",
          relationship: "intrinsic",
          source: "candidate",
          reason: "main",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:chicken tikka",
        },
        components: [
          {
            componentId: "rice",
            role: "carbohydrate",
            name: "basmati rice",
            relationship: "required_companion",
            source: "composition_engine",
            reason: "starch",
            definitionKind: "atomic_food",
            normalizedComponentKey: "carbohydrate:basmati rice",
          },
          {
            componentId: "salad",
            role: "vegetable",
            name: "kachumber",
            relationship: "required_companion",
            source: "composition_engine",
            reason: "salad",
            definitionKind: "recipe_component",
            normalizedComponentKey: "vegetable:kachumber",
          },
        ],
        compositionProfile: {
          hasPrimaryProtein: true,
          hasMeaningfulCarbohydrate: true,
          hasMeaningfulVegetableOrFruit: true,
          hasMeaningfulFiberSource: true,
          hasSauceOrMoistureComponent: false,
          addedComponentRoles: ["carbohydrate", "vegetable"],
        },
        metadata: {
          promptVersion: "meal-composition-v2",
          policyVersion: "meal-composition-v1",
          createdAt: "2026-09-16T00:00:00.000Z",
        },
      },
      {
        candidateId: "b",
        name: "Kerala Beef Fry",
        main: {
          componentId: "main",
          role: "main",
          name: "Kerala Beef Fry",
          relationship: "intrinsic",
          source: "candidate",
          reason: "main",
          definitionKind: "recipe_component",
          normalizedComponentKey: "main:kerala beef fry",
        },
        components: [
          {
            componentId: "rice",
            role: "carbohydrate",
            name: "basmati rice",
            relationship: "required_companion",
            source: "composition_engine",
            reason: "starch",
            definitionKind: "atomic_food",
            normalizedComponentKey: "carbohydrate:basmati rice",
          },
          {
            componentId: "thoran",
            role: "vegetable",
            name: "cabbage thoran",
            relationship: "required_companion",
            source: "composition_engine",
            reason: "veg",
            definitionKind: "recipe_component",
            normalizedComponentKey: "vegetable:cabbage thoran",
          },
        ],
        compositionProfile: {
          hasPrimaryProtein: true,
          hasMeaningfulCarbohydrate: true,
          hasMeaningfulVegetableOrFruit: true,
          hasMeaningfulFiberSource: true,
          hasSauceOrMoistureComponent: false,
          addedComponentRoles: ["carbohydrate", "vegetable"],
        },
        metadata: {
          promptVersion: "meal-composition-v2",
          policyVersion: "meal-composition-v1",
          createdAt: "2026-09-16T00:00:00.000Z",
        },
      },
    ]);
    expect(compact.complexitySignal).toBe("compact_reusable");
    expect(compact.reusedComponents).toBeGreaterThan(0);

    const uniqueSides = Array.from({ length: 6 }, (_, index) => ({
      candidateId: `m${index}`,
      name: `Main ${index}`,
      main: {
        componentId: "main",
        role: "main" as const,
        name: `Main ${index}`,
        relationship: "intrinsic" as const,
        source: "candidate" as const,
        reason: "main",
        definitionKind: "recipe_component" as const,
        normalizedComponentKey: `main:main ${index}`,
      },
      components: ["a", "b", "c"].map((suffix) => ({
        componentId: `${suffix}-${index}`,
        role: "vegetable" as const,
        name: `Unique side ${suffix} ${index}`,
        relationship: "recommended" as const,
        source: "composition_engine" as const,
        reason: "unique",
        definitionKind: "recipe_component" as const,
        normalizedComponentKey: `vegetable:unique side ${suffix} ${index}`,
      })),
      compositionProfile: {
        hasPrimaryProtein: true,
        hasMeaningfulCarbohydrate: false,
        hasMeaningfulVegetableOrFruit: true,
        hasMeaningfulFiberSource: true,
        hasSauceOrMoistureComponent: false,
        addedComponentRoles: ["vegetable" as const],
      },
      metadata: {
        promptVersion: "meal-composition-v2" as const,
        policyVersion: "meal-composition-v1" as const,
        createdAt: "2026-09-16T00:00:00.000Z",
      },
    }));
    const exploded = summarizeMealConceptRepertoire(uniqueSides);
    expect(exploded.complexitySignal).toBe("high_unique_sides");
    expect(exploded.uniqueComponents).toBe(18);
    expect(exploded.reusedComponents).toBe(0);
  });

  it("composes a repeated candidate once", async () => {
    const provider = new MockMealCompositionProvider();
    const ranked = [
      makeRankedCandidate(CHICKEN_TIKKA, 1),
      makeRankedCandidate(CHICKEN_TIKKA, 2),
      makeRankedCandidate(CHICKEN_TIKKA, 3),
    ];
    const composed = await composeMealConcepts({ rankedCandidates: ranked, provider });
    expect(composed.result.uniqueCandidateIds).toEqual([CHICKEN_TIKKA.candidateId]);
    expect(composed.result.conceptCount).toBe(1);
    expect(provider.calls.length).toBeLessThanOrEqual(1);
  });

  it("records composition → selection diagnostics", async () => {
    const provider = new MockMealCompositionProvider();
    const ranked = [CHICKEN_TIKKA, SHRIMP_TACOS, KERALA_BEEF_FRY].map((c, i) =>
      makeRankedCandidate(c, i + 1),
    );
    const composed = await composeMealConcepts({ rankedCandidates: ranked, provider });
    const selected = [CHICKEN_TIKKA.candidateId, KERALA_BEEF_FRY.candidateId];
    const detailed = await resolveSelectedCompleteMeals({
      concepts: composed.result.conceptsByCandidateId,
      selectedCandidateIds: selected,
    });
    const diagnostics = pipelineDiagnostics({
      rankedCandidates: 3,
      concepts: composed.result,
      selectedCandidateIds: selected,
      uniqueMainRecipesResolved: detailed.uniqueMainRecipesResolved,
      uniqueComponentRecipesResolved: detailed.uniqueComponentRecipesResolved,
    });
    expect(diagnostics.uniqueCandidatesComposed).toBe(3);
    expect(diagnostics.weeklyCandidatesSelected).toBe(2);
    expect(diagnostics.candidateTrace.find((row) => row.candidateId === SHRIMP_TACOS.candidateId)?.selected).toBe(
      false,
    );
    expect(
      diagnostics.candidateTrace.find((row) => row.candidateId === CHICKEN_TIKKA.candidateId)?.selected,
    ).toBe(true);
  });
});

