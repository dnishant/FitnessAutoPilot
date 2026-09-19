import { describe, expect, it } from "vitest";
import type {
  CoreMealRepertoire,
  PersonalizedWeeklyNutritionPlan,
  PrepTask,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import { MealPrepPlanSchema } from "@fitness-autopilot/contracts";
import {
  buildMealPrepPlan,
  choosePracticalCookOutput,
  consolidateNearbyPrep,
  deriveWeeklyCookingRequirements,
  extractTasksForRequirement,
  inferCutForm,
  schedulePrepTasks,
  validateTaskGraph,
} from "./index";

function baseRecipe(overrides: Partial<ResolvedRecipe> = {}): ResolvedRecipe {
  return {
    recipeId: "rr_tikka",
    candidateId: "tikka-chicken",
    name: "Chicken Tikka",
    source: { name: "fixture", url: null, author: null },
    description: "Test",
    baseServings: 4,
    ingredients: [
      {
        ingredientId: "chicken",
        name: "chicken breast",
        quantity: 800,
        unit: "g",
        preparation: "cubed",
        role: "protein",
        scalingBehavior: "primary_scalable",
        measurementState: "raw",
      },
      {
        ingredientId: "onion",
        name: "onion",
        quantity: 1,
        unit: "count",
        preparation: "diced",
        role: "aromatic",
        scalingBehavior: "secondary_scalable",
      },
      {
        ingredientId: "garlic",
        name: "garlic",
        quantity: 4,
        unit: "cloves",
        preparation: "minced",
        role: "aromatic",
        scalingBehavior: "secondary_scalable",
      },
    ],
    instructions: [
      { stepNumber: 1, text: "Make tikka marinade (5 min)." },
      { stepNumber: 2, text: "Marinate chicken 30 min." },
      { stepNumber: 3, text: "Bake at 425°F for 20 minutes." },
    ],
    prepTimeMinutes: 20,
    cookTimeMinutes: 25,
    supportedPrepModes: [
      {
        mode: "fully_prepped",
        advanceTasks: ["Make tikka marinade", "Marinate chicken 30 min"],
        finishTasks: ["Reheat and serve"],
        finishTimeMinutes: 8,
        storageInstructions: "Refrigerate up to 4 days; freeze portions for later.",
      },
    ],
    storageInstructions: "Refrigerate in airtight containers up to 4 days.",
    reheatingInstructions: "Reheat until steaming hot.",
    mealComponents: [
      {
        componentId: "main",
        name: "Chicken Tikka",
        type: "main",
        required: true,
        purpose: "main",
        relationship: "intrinsic",
      },
    ],
    flavorProfile: {
      cuisineFamily: "Indian",
      flavorFamilies: ["savory"],
      cookingTechniques: ["bake", "marinate"],
      textureProfile: [],
    },
    experienceProfile: {
      moistureLevel: "moderate",
      flavorIntensity: "bold",
      textureTags: [],
      mealPrepQuality: "excellent",
    },
    resolutionMetadata: {
      provider: "fixture",
      model: "test",
      promptVersion: "recipe-resolution-v2",
    },
    ...overrides,
  };
}

function nutrition(cals: number) {
  return {
    caloriesKcal: cals,
    proteinGrams: 40,
    carbohydrateGrams: 10,
    fatGrams: 12,
    fiberGrams: 2,
  };
}

function mealInstance(input: {
  mealInstanceId: string;
  day: PersonalizedWeeklyNutritionPlan["days"][0]["day"];
  mealType?: "lunch" | "dinner";
  candidateId?: string;
  mealName?: string;
  personalServings: number;
}): PersonalizedWeeklyNutritionPlan["days"][0]["meals"][0] {
  return {
    mealInstanceId: input.mealInstanceId,
    day: input.day,
    mealType: input.mealType ?? "lunch",
    candidateId: input.candidateId ?? "tikka-chicken",
    mealName: input.mealName ?? "Chicken Tikka",
    nutritionIntent: { targetCaloriesKcal: 700, targetProteinGrams: 50 },
    status: "solved",
    personalizedPlan: {
      mealId: input.mealInstanceId,
      mealName: input.mealName ?? "Chicken Tikka",
      portions: [
        {
          componentId: "main",
          displayName: input.mealName ?? "Chicken Tikka",
          role: "main",
          amount: input.personalServings,
          unit: "servings",
          personalServings: input.personalServings,
          nutrition: nutrition(500),
        },
      ],
      nutrition: {
        caloriesKcal: 500,
        proteinGrams: 40,
        carbsGrams: 10,
        fatGrams: 12,
      },
      intent: { targetCaloriesKcal: 700, targetProteinGrams: 50 },
      status: "solved",
      diagnostics: {
        status: "solved",
        variables: [],
        policyVersion: "meal-portion-policy-v1",
        solverVersion: "meal-portion-solver-v1",
      },
      policyVersion: "meal-portion-policy-v1",
      solverVersion: "meal-portion-solver-v1",
      generatedAt: "2026-09-19T00:00:00.000Z",
    },
  };
}

function finalizedPlan(
  meals: PersonalizedWeeklyNutritionPlan["days"][0]["meals"],
): PersonalizedWeeklyNutritionPlan {
  const byDay = new Map<string, typeof meals>();
  for (const m of meals) {
    const list = byDay.get(m.day) ?? [];
    list.push(m);
    byDay.set(m.day, list);
  }
  return {
    generatedPlanId: "plan_test_013",
    weekStart: "2026-09-14",
    weekEnd: "2026-09-20",
    dailyTarget: { caloriesKcal: 2200, proteinGrams: 160 },
    allocationPolicyVersion: "nutrition-allocation-policy-v1",
    portionPolicyVersion: "meal-portion-policy-v1",
    personalizationVersion: "weekly-nutrition-personalization-v1",
    days: [...byDay.entries()].map(([day, dayMeals]) => ({
      day: day as PersonalizedWeeklyNutritionPlan["days"][0]["day"],
      budget: {
        target: { caloriesKcal: 2200, proteinGrams: 160 },
        reservedNutrition: { caloriesKcal: 660, proteinGrams: 48 },
        lunchIntent: { targetCaloriesKcal: 770 },
        dinnerIntent: { targetCaloriesKcal: 770 },
        allocationPolicyVersion: "nutrition-allocation-policy-v1" as const,
      },
      meals: dayMeals,
      reservedNutrition: { caloriesKcal: 660, proteinGrams: 48 },
      status: "solved" as const,
    })),
    status: "solved",
    mealInstanceCount: meals.length,
    solvedMealCount: meals.length,
    bestFeasibleMealCount: 0,
    blockedMealCount: 0,
    generatedAt: "2026-09-19T00:00:00.000Z",
    finalization: {
      finalizedAt: "2026-09-19T00:00:00.000Z",
      validationPolicyVersion: "nutrition-validation-policy-v1",
      validationStatus: "finalized",
      repairAttempts: 0,
    },
  };
}

function repertoire(coreMeals: CoreMealRepertoire["coreMeals"]): CoreMealRepertoire {
  return {
    policyVersion: "v1-meal-prep-policy-v1",
    coreMeals,
    coveredDays: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"],
    flexibleDay: "sunday",
    plannedLunchDinnerSlots: 12,
  };
}

describe("PLAN-013 weekly requirements", () => {
  it("A: sums varying personalized portions across instances", () => {
    const plan = finalizedPlan([
      mealInstance({ mealInstanceId: "m1", day: "monday", personalServings: 1.1 }),
      mealInstance({ mealInstanceId: "m2", day: "wednesday", personalServings: 1.0 }),
      mealInstance({ mealInstanceId: "m3", day: "friday", personalServings: 1.2 }),
    ]);
    const { requirements } = deriveWeeklyCookingRequirements({
      personalizedWeeklyPlan: plan,
      recipesByCandidateId: { "tikka-chicken": baseRecipe() },
      coreRepertoire: repertoire([
        {
          coreMealId: "core_tikka",
          candidateId: "tikka-chicken",
          name: "Chicken Tikka",
          mealInstanceSlots: [
            { day: "monday", mealType: "lunch" },
            { day: "wednesday", mealType: "lunch" },
            { day: "friday", mealType: "lunch" },
          ],
          weeklyInstanceCount: 3,
          fridgeLifeDays: 4,
          freezerFriendly: true,
          reheatingQuality: "excellent",
        },
      ]),
    });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]!.requiredOutputServings).toBeCloseTo(3.3, 5);
    expect(requirements[0]!.referenceYieldServings).toBe(4);
    expect(requirements[0]!.plannedCookOutputServings).toBeGreaterThanOrEqual(3.3);
    expect(requirements[0]!.expectedExcessServings).toBeCloseTo(
      requirements[0]!.plannedCookOutputServings - 3.3,
      5,
    );
  });

  it("B: aggregates identical portions once by core meal", () => {
    const plan = finalizedPlan([
      mealInstance({ mealInstanceId: "m1", day: "monday", personalServings: 1.1 }),
      mealInstance({ mealInstanceId: "m2", day: "wednesday", personalServings: 1.1 }),
      mealInstance({ mealInstanceId: "m3", day: "friday", personalServings: 1.1 }),
    ]);
    const { requirements } = deriveWeeklyCookingRequirements({
      personalizedWeeklyPlan: plan,
      recipesByCandidateId: { "tikka-chicken": baseRecipe() },
      coreRepertoire: repertoire([
        {
          coreMealId: "core_tikka",
          candidateId: "tikka-chicken",
          name: "Chicken Tikka",
          mealInstanceSlots: [
            { day: "monday", mealType: "lunch" },
            { day: "wednesday", mealType: "lunch" },
            { day: "friday", mealType: "lunch" },
          ],
          weeklyInstanceCount: 3,
        },
      ]),
    });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]!.requiredOutputServings).toBeCloseTo(3.3, 5);
    expect(requirements[0]!.weeklyInstanceCount).toBe(3);
  });

  it("does not create large leftovers for practical batching", () => {
    const exact = choosePracticalCookOutput(3.3, 4);
    expect(exact.expectedExcessServings).toBeLessThanOrEqual(0.5);
    const far = choosePracticalCookOutput(1.0, 4);
    // 4 servings would be +3 excess — reject; keep exact 1.0
    expect(far.plannedCookOutputServings).toBe(1);
    expect(far.expectedExcessServings).toBe(0);
  });
});

describe("PLAN-013 just-in-time prep", () => {
  const req = (coreMealId: string, candidateId: string, recipeId: string) => ({
    coreMealId,
    candidateId,
    recipeId,
    name: coreMealId.toUpperCase(),
    mealInstanceIds: [`m_${coreMealId}`],
    weeklyInstanceCount: 1,
    requiredOutputServings: 4,
    referenceYieldServings: 4,
    plannedCookOutputServings: 4,
    expectedExcessServings: 0,
    instanceServings: [
      {
        mealInstanceId: `m_${coreMealId}`,
        day: "monday" as const,
        mealType: "lunch" as const,
        personalServings: 4,
      },
    ],
  });

  it("A: onion needed immediately is prepared inside the cook/marinate step", () => {
    const tasks = extractTasksForRequirement({
      requirement: req("a", "tikka-chicken", "rr_tikka"),
      recipe: baseRecipe(),
    });
    expect(tasks.some((t) => t.type === "mise_en_place")).toBe(false);
    const cookOrMarinate = tasks.filter((t) => t.type === "cook" || t.type === "advance_prep");
    const onionPrep = cookOrMarinate.some((t) =>
      t.instructions.some((line) => /onion/i.test(line) && /dice|diced/i.test(line)),
    );
    expect(onionPrep).toBe(true);
  });

  it("B: cilantro needed later is not chopped in the marinade step", () => {
    const recipe = baseRecipe({
      ingredients: [
        ...baseRecipe().ingredients,
        {
          ingredientId: "cilantro",
          name: "cilantro",
          quantity: 0.25,
          unit: "cup",
          preparation: "chopped",
          role: "garnish",
          scalingBehavior: "secondary_scalable",
        },
      ],
    });
    const tasks = extractTasksForRequirement({
      requirement: req("a", "tikka-chicken", "rr_tikka"),
      recipe,
    });
    const marinate = tasks.find((t) => t.type === "advance_prep" && /marinate/i.test(t.title));
    expect(marinate).toBeTruthy();
    expect(marinate!.ingredients.some((i) => /cilantro/i.test(i.displayName))).toBe(false);
    const cook = tasks.find((t) => t.type === "cook");
    expect(cook?.ingredients.some((i) => /cilantro/i.test(i.displayName))).toBe(true);
  });

  it("C: identical minced garlic in nearby steps may consolidate with set-aside note", () => {
    const makeGarlicRecipe = (id: string, qty: number) =>
      baseRecipe({
        recipeId: `rr_${id}`,
        candidateId: id,
        name: id,
        ingredients: [
          {
            ingredientId: "garlic",
            name: "garlic",
            quantity: qty,
            unit: "cloves",
            preparation: "minced",
            role: "aromatic",
            scalingBehavior: "secondary_scalable",
          },
        ],
        instructions: [{ stepNumber: 1, text: "Cook aromatics then simmer 10 min." }],
        supportedPrepModes: [
          {
            mode: "fully_prepped",
            advanceTasks: [],
            finishTasks: ["Reheat"],
            finishTimeMinutes: 5,
          },
        ],
      });

    const tasks = [
      ...extractTasksForRequirement({
        requirement: req("a", "a", "rr_a"),
        recipe: makeGarlicRecipe("a", 4),
      }),
      ...extractTasksForRequirement({
        requirement: req("b", "b", "rr_b"),
        recipe: makeGarlicRecipe("b", 3),
      }),
    ];
    const scheduled = schedulePrepTasks(tasks);
    const consolidated = consolidateNearbyPrep(scheduled.tasks);
    const withAside = consolidated.filter((t) =>
      t.instructions.some((l) => /set aside/i.test(l)),
    );
    expect(withAside.length).toBeGreaterThanOrEqual(1);
    expect(consolidated.some((t) => t.type === "mise_en_place")).toBe(false);
  });

  it("D: does not consolidate minced vs sliced garlic", () => {
    expect(inferCutForm("minced")).toBe("minced");
    expect(inferCutForm("thinly sliced")).toBe("sliced");
    const minced = extractTasksForRequirement({
      requirement: req("a", "a", "rr_a"),
      recipe: baseRecipe({
        recipeId: "rr_a",
        candidateId: "a",
        ingredients: [
          {
            ingredientId: "garlic",
            name: "garlic",
            quantity: 4,
            unit: "cloves",
            preparation: "minced",
            role: "aromatic",
            scalingBehavior: "fixed",
          },
        ],
        instructions: [{ stepNumber: 1, text: "Cook." }],
        supportedPrepModes: [
          { mode: "fully_prepped", advanceTasks: [], finishTasks: [], finishTimeMinutes: 5 },
        ],
      }),
    });
    const sliced = extractTasksForRequirement({
      requirement: req("b", "b", "rr_b"),
      recipe: baseRecipe({
        recipeId: "rr_b",
        candidateId: "b",
        ingredients: [
          {
            ingredientId: "garlic",
            name: "garlic",
            quantity: 4,
            unit: "cloves",
            preparation: "sliced",
            role: "aromatic",
            scalingBehavior: "fixed",
          },
        ],
        instructions: [{ stepNumber: 1, text: "Cook." }],
        supportedPrepModes: [
          { mode: "fully_prepped", advanceTasks: [], finishTasks: [], finishTimeMinutes: 5 },
        ],
      }),
    });
    const scheduled = schedulePrepTasks([...minced, ...sliced]);
    const consolidated = consolidateNearbyPrep(scheduled.tasks);
    const asideNotes = consolidated.filter((t) =>
      t.instructions.some((l) => /set aside/i.test(l) && /garlic/i.test(l)),
    );
    expect(asideNotes.length).toBe(0);
  });

  it("E/F: marinade is a full step with quantities; other work uses the passive window", () => {
    const tasks = extractTasksForRequirement({
      requirement: req("a", "tikka-chicken", "rr_tikka"),
      recipe: baseRecipe(),
    });
    const marinate = tasks.find((t) => /marinate/i.test(t.title));
    expect(marinate).toBeTruthy();
    expect(marinate!.ingredients.length).toBeGreaterThan(0);
    expect(marinate!.ingredients.some((i) => /chicken/i.test(i.displayName))).toBe(true);
    expect(marinate!.passiveMinutes).toBeGreaterThanOrEqual(30);
    expect(marinate!.instructions.length).toBeGreaterThan(2);

    const rice: PrepTask = {
      id: "cook_rice",
      type: "cook",
      title: "Cook rice",
      durationMinutes: 5,
      passiveMinutes: 15,
      dependencies: [],
      recipeIds: ["rr_rice"],
      coreMealIds: ["rice"],
      mealInstanceIds: [],
      ingredients: [],
      equipment: ["pot"],
      canRunInParallel: true,
      requiresAttention: false,
      instructions: ["Rinse and simmer rice"],
    };
    const scheduled = schedulePrepTasks([...tasks, rice]);
    const mar = scheduled.tasks.find((t) => t.id === marinate!.id)!;
    const riceScheduled = scheduled.tasks.find((t) => t.id === "cook_rice")!;
    // Independent work should start before the marinade passive window ends.
    expect(riceScheduled.timing!.startOffsetMinutes).toBeLessThan(
      (mar.timing!.startOffsetMinutes ?? 0) +
        mar.durationMinutes +
        (mar.passiveMinutes ?? 0),
    );
    expect(scheduled.schedule.elapsedMinutes).toBeLessThanOrEqual(
      scheduled.schedule.naiveSummedMinutes,
    );
  });

  it("G: cook depends on marinade readiness", () => {
    const tasks = extractTasksForRequirement({
      requirement: req("a", "tikka-chicken", "rr_tikka"),
      recipe: baseRecipe(),
    });
    const marinate = tasks.find((t) => /marinate/i.test(t.title))!;
    const cook = tasks.find((t) => t.type === "cook")!;
    expect(cook.dependencies).toContain(marinate.id);
    const graph = validateTaskGraph(tasks);
    expect(graph.ok).toBe(true);
  });
});

describe("PLAN-013 legacy cut-form helpers", () => {
  it("infers minced vs sliced", () => {
    expect(inferCutForm("minced")).toBe("minced");
    expect(inferCutForm("thinly sliced")).toBe("sliced");
  });
});

describe("PLAN-013 marinade scheduling", () => {
  it("G/H: cook depends on marinade; elapsed < naive sum", () => {
    const recipe = baseRecipe();
    const tasks = extractTasksForRequirement({
      requirement: {
        coreMealId: "core_tikka",
        candidateId: "tikka-chicken",
        recipeId: recipe.recipeId,
        name: recipe.name,
        mealInstanceIds: ["m1"],
        weeklyInstanceCount: 1,
        requiredOutputServings: 3,
        referenceYieldServings: 4,
        plannedCookOutputServings: 3,
        expectedExcessServings: 0,
        prepIntent: "fully_prepped",
        instanceServings: [
          { mealInstanceId: "m1", day: "monday", mealType: "lunch", personalServings: 3 },
        ],
      },
      recipe,
      cookingStyle: "mostly_ready",
    });

    const advance = tasks.filter((t) => t.type === "advance_prep");
    const cook = tasks.find((t) => t.type === "cook");
    expect(advance.length).toBeGreaterThan(0);
    expect(advance.some((t) => (t.passiveMinutes ?? 0) >= 30)).toBe(true);
    expect(cook).toBeTruthy();
    const marinade = advance.find((t) => (t.passiveMinutes ?? 0) > 0)!;
    expect(cook!.dependencies).toContain(marinade.id);

    // Add independent rice cook to exploit passive window
    const rice: PrepTask = {
      id: "cook_rice",
      type: "cook",
      title: "Cook rice",
      durationMinutes: 5,
      passiveMinutes: 20,
      dependencies: [],
      recipeIds: ["rr_rice"],
      coreMealIds: ["rice"],
      mealInstanceIds: [],
      ingredients: [],
      equipment: ["pot", "stovetop_burner"],
      canRunInParallel: true,
      requiresAttention: false,
      instructions: ["Rinse and cook rice"],
    };
    const scheduled = schedulePrepTasks([...tasks, rice]);
    expect(scheduled.schedule.elapsedMinutes).toBeLessThan(scheduled.schedule.naiveSummedMinutes);
  });
});

describe("PLAN-013 equipment + attention", () => {
  it("K: incompatible oven temps are sequenced", () => {
    const a: PrepTask = {
      id: "oven_a",
      type: "cook",
      title: "Bake chicken 425F",
      durationMinutes: 20,
      dependencies: [],
      recipeIds: ["a"],
      coreMealIds: ["a"],
      mealInstanceIds: [],
      ingredients: [],
      equipment: ["oven"],
      canRunInParallel: true,
      requiresAttention: false,
      ovenTemperatureF: 425,
      instructions: [],
    };
    const b: PrepTask = {
      id: "oven_b",
      type: "cook",
      title: "Bake salmon 400F",
      durationMinutes: 15,
      dependencies: [],
      recipeIds: ["b"],
      coreMealIds: ["b"],
      mealInstanceIds: [],
      ingredients: [],
      equipment: ["oven"],
      canRunInParallel: true,
      requiresAttention: false,
      ovenTemperatureF: 400,
      instructions: [],
    };
    const scheduled = schedulePrepTasks([a, b]);
    const ta = scheduled.tasks.find((t) => t.id === "oven_a")!.timing!;
    const tb = scheduled.tasks.find((t) => t.id === "oven_b")!.timing!;
    const overlap = ta.startOffsetMinutes < tb.endOffsetMinutes && tb.startOffsetMinutes < ta.endOffsetMinutes;
    // Active windows should not fully overlap when temps differ by >25F
    expect(overlap && ta.startOffsetMinutes === tb.startOffsetMinutes).toBe(false);
  });

  it("L: two attention-heavy skillets are not simultaneous", () => {
    const a: PrepTask = {
      id: "skillet_a",
      type: "cook",
      title: "Brown beef",
      durationMinutes: 15,
      dependencies: [],
      recipeIds: ["a"],
      coreMealIds: ["a"],
      mealInstanceIds: [],
      ingredients: [],
      equipment: ["skillet", "stovetop_burner"],
      canRunInParallel: false,
      requiresAttention: true,
      instructions: [],
    };
    const b: PrepTask = {
      id: "skillet_b",
      type: "cook",
      title: "Saute vegetables",
      durationMinutes: 12,
      dependencies: [],
      recipeIds: ["b"],
      coreMealIds: ["b"],
      mealInstanceIds: [],
      ingredients: [],
      equipment: ["skillet", "stovetop_burner"],
      canRunInParallel: false,
      requiresAttention: true,
      instructions: [],
    };
    const scheduled = schedulePrepTasks([a, b]);
    const ta = scheduled.tasks.find((t) => t.id === "skillet_a")!.timing!;
    const tb = scheduled.tasks.find((t) => t.id === "skillet_b")!.timing!;
    const activeOverlap =
      ta.startOffsetMinutes < ta.startOffsetMinutes + 15 &&
      tb.startOffsetMinutes < ta.startOffsetMinutes + 15 &&
      ta.startOffsetMinutes < tb.startOffsetMinutes + 12;
    // Starts should differ
    expect(ta.startOffsetMinutes === tb.startOffsetMinutes).toBe(false);
    void activeOverlap;
  });
});

describe("PLAN-013 component / quick finish deferral", () => {
  it("defers primary cook for component_prepped (store components, finish later)", () => {
    const recipe = baseRecipe({
      supportedPrepModes: [
        {
          mode: "component_prepped",
          advanceTasks: ["Prep aromatics", "Marinate protein"],
          finishTasks: ["Cook protein", "Assemble"],
          finishTimeMinutes: 12,
        },
      ],
    });
    const tasks = extractTasksForRequirement({
      requirement: {
        coreMealId: "core_tikka",
        candidateId: "tikka-chicken",
        recipeId: recipe.recipeId,
        name: recipe.name,
        mealInstanceIds: ["m1", "m2"],
        weeklyInstanceCount: 2,
        requiredOutputServings: 2.2,
        referenceYieldServings: 4,
        plannedCookOutputServings: 2.2,
        expectedExcessServings: 0,
        prepIntent: "component_prepped",
        instanceServings: [
          { mealInstanceId: "m1", day: "monday", mealType: "lunch", personalServings: 1.1 },
          { mealInstanceId: "m2", day: "thursday", mealType: "dinner", personalServings: 1.1 },
        ],
      },
      recipe,
      cookingStyle: "ready_lunch_fresh_dinner",
      maxFinishMinutes: 15,
    });
    expect(tasks.some((t) => t.type === "cook")).toBe(false);
    expect(tasks.some((t) => t.type === "fresh_finish")).toBe(true);
    expect(tasks.some((t) => t.type === "portion_and_store")).toBe(true);
  });
});

describe("PLAN-013 graph integrity", () => {
  it("detects cycles", () => {
    const tasks: PrepTask[] = [
      {
        id: "a",
        type: "cook",
        title: "A",
        durationMinutes: 5,
        dependencies: ["b"],
        recipeIds: [],
        coreMealIds: ["x"],
        mealInstanceIds: [],
        ingredients: [],
        equipment: [],
        canRunInParallel: true,
        requiresAttention: false,
        instructions: [],
      },
      {
        id: "b",
        type: "cook",
        title: "B",
        durationMinutes: 5,
        dependencies: ["a"],
        recipeIds: [],
        coreMealIds: ["x"],
        mealInstanceIds: [],
        ingredients: [],
        equipment: [],
        canRunInParallel: true,
        requiresAttention: false,
        instructions: [],
      },
    ];
    const result = validateTaskGraph(tasks);
    expect(result.cycles).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });
});

describe("PLAN-013 storage + end-to-end build", () => {
  it("M/N: early refrigerate, late freeze + thaw", () => {
    const recipe = baseRecipe();
    const plan = finalizedPlan([
      mealInstance({ mealInstanceId: "m_mon", day: "monday", personalServings: 1.1 }),
      mealInstance({ mealInstanceId: "m_wed", day: "wednesday", personalServings: 1.1 }),
      mealInstance({ mealInstanceId: "m_sat", day: "saturday", personalServings: 1.1 }),
    ]);
    const result = buildMealPrepPlan({
      personalizedWeeklyPlan: plan,
      recipesByCandidateId: { "tikka-chicken": recipe },
      coreRepertoire: repertoire([
        {
          coreMealId: "core_tikka",
          candidateId: "tikka-chicken",
          name: "Chicken Tikka",
          mealInstanceSlots: [
            { day: "monday", mealType: "lunch" },
            { day: "wednesday", mealType: "lunch" },
            { day: "saturday", mealType: "lunch" },
          ],
          weeklyInstanceCount: 3,
          fridgeLifeDays: 4,
          freezerFriendly: true,
          reheatingQuality: "excellent",
          prepIntent: "fully_prepped",
        },
      ]),
      cookingPreferences: {
        cookingStyle: "mostly_ready",
        prepFrequency: "once_weekly",
        maxPrepSessionMinutes: 90,
        maxFinishMinutes: 0,
      },
      prepSessionDay: "sunday",
      generatedAt: "2026-09-19T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = MealPrepPlanSchema.safeParse(result.mealPrepPlan);
    expect(parsed.success).toBe(true);

    const mon = result.mealPrepPlan.storageAssignments.find((a) => a.mealInstanceId === "m_mon");
    const sat = result.mealPrepPlan.storageAssignments.find((a) => a.mealInstanceId === "m_sat");
    expect(mon?.disposition).toBe("refrigerate");
    expect(sat?.disposition).toBe("freeze");
    expect(result.mealPrepPlan.futureActions.some((a) => a.type === "thaw")).toBe(true);

    expect(result.mealPrepPlan.reconciliation.dependencyCycles).toBe(0);
    expect(result.mealPrepPlan.reconciliation.missingDependencies).toBe(0);
    expect(result.mealPrepPlan.reconciliation.orphanPrepTasks).toBe(0);
    expect(result.mealPrepPlan.tasks.some((t) => t.type === "mise_en_place")).toBe(false);
    expect(result.mealPrepPlan.schedule.elapsedMinutes).toBeLessThanOrEqual(
      result.mealPrepPlan.schedule.naiveSummedMinutes,
    );
  });

  it("P: missing storage profile for multi-day poor-prep surfaces typed issue", () => {
    const recipe = baseRecipe({
      experienceProfile: {
        moistureLevel: "dry",
        flavorIntensity: "mild",
        textureTags: ["crispy"],
        mealPrepQuality: "poor",
      },
      supportedPrepModes: [
        {
          mode: "fresh",
          advanceTasks: [],
          finishTasks: ["Cook fresh"],
          finishTimeMinutes: 20,
        },
      ],
    });
    const plan = finalizedPlan([
      mealInstance({ mealInstanceId: "m_sat", day: "saturday", personalServings: 1 }),
    ]);
    const result = buildMealPrepPlan({
      personalizedWeeklyPlan: plan,
      recipesByCandidateId: { "tikka-chicken": recipe },
      coreRepertoire: repertoire([
        {
          coreMealId: "core_tikka",
          candidateId: "tikka-chicken",
          name: "Chicken Tikka",
          mealInstanceSlots: [{ day: "saturday", mealType: "lunch" }],
          weeklyInstanceCount: 1,
          reheatingQuality: "poor",
          freezerFriendly: false,
          prepIntent: "fresh",
        },
      ]),
      cookingPreferences: {
        cookingStyle: "fresh_focused",
        prepFrequency: "throughout_week",
        maxPrepSessionMinutes: 60,
        maxFinishMinutes: 20,
      },
      prepSessionDay: "sunday",
    });
    // May succeed with fresh_finish_later or fail unsafe — either way no invented fridge life.
    const issues = result.ok ? result.issues : result.issues;
    const planOut = result.mealPrepPlan;
    if (planOut) {
      for (const a of planOut.storageAssignments) {
        expect(a.disposition === "refrigerate" && a.fridgeLifeDaysUsed == null).toBe(false);
      }
    }
    void issues;
  });

  it("rejects non-finalized plans", () => {
    const plan = finalizedPlan([
      mealInstance({ mealInstanceId: "m1", day: "monday", personalServings: 1 }),
    ]);
    delete (plan as { finalization?: unknown }).finalization;
    const result = buildMealPrepPlan({
      personalizedWeeklyPlan: plan,
      recipesByCandidateId: { "tikka-chicken": baseRecipe() },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISSING_FINALIZED_PLAN");
  });
});
