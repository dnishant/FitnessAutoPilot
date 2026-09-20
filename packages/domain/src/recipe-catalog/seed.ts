import type {
  CatalogRecipe,
  CatalogRecipeClassifications,
  CatalogRecipeComponent,
  CatalogRecipeIngredient,
  CatalogRecipeProvenance,
  CatalogRecipeScalingProfile,
  CatalogRecipeStep,
  CatalogRecipeStepIngredientUsage,
  CatalogRecipeStorageProfile,
  CatalogRecipeVersion,
} from "@fitness-autopilot/contracts";
import {
  SEED_INGREDIENT_IDS,
  SEED_PRODUCT_IDS,
} from "../ingredient-catalog/seed";
import type { RecipeVersionGraph } from "./validate";

const TS = "2026-09-20T00:00:00.000Z";
const PUBLISHED_AT = "2026-09-20T12:00:00.000Z";

/** Fixed UUIDs: r1 recipes, r2 versions, r3 components, r4 ingredients, r5 steps, r6 usages */
export const SEED_RECIPE_IDS = {
  eggAvocadoToast: "a1000000-0000-4000-a000-000000000001",
  groundChickenKheemaBowl: "a1000000-0000-4000-a000-000000000002",
  greekYogurtBerriesWalnuts: "a1000000-0000-4000-a000-000000000003",
} as const;

export const SEED_VERSION_IDS = {
  eggAvocadoToastV1: "a2000000-0000-4000-a000-000000000001",
  groundChickenKheemaBowlV1: "a2000000-0000-4000-a000-000000000002",
  greekYogurtBerriesWalnutsV1: "a2000000-0000-4000-a000-000000000003",
} as const;

const C = {
  // breakfast
  bMain: "a3000000-0000-4000-a000-000000000001",
  // kheema
  kKheema: "a3000000-0000-4000-a000-000000000002",
  kRice: "a3000000-0000-4000-a000-000000000003",
  kVeg: "a3000000-0000-4000-a000-000000000004",
  kSauce: "a3000000-0000-4000-a000-000000000005",
  // snack
  sMain: "a3000000-0000-4000-a000-000000000006",
} as const;

const I = {
  // breakfast
  egg: "a4000000-0000-4000-a000-000000000001",
  avocado: "a4000000-0000-4000-a000-000000000002",
  bread: "a4000000-0000-4000-a000-000000000003",
  oil: "a4000000-0000-4000-a000-000000000004",
  saltB: "a4000000-0000-4000-a000-000000000005",
  pepperB: "a4000000-0000-4000-a000-000000000006",
  // kheema
  groundChicken: "a4000000-0000-4000-a000-000000000010",
  onion: "a4000000-0000-4000-a000-000000000011",
  garlic: "a4000000-0000-4000-a000-000000000012",
  ginger: "a4000000-0000-4000-a000-000000000013",
  tomato: "a4000000-0000-4000-a000-000000000014",
  cumin: "a4000000-0000-4000-a000-000000000015",
  coriander: "a4000000-0000-4000-a000-000000000016",
  turmeric: "a4000000-0000-4000-a000-000000000017",
  garam: "a4000000-0000-4000-a000-000000000018",
  oilK: "a4000000-0000-4000-a000-000000000019",
  saltK: "a4000000-0000-4000-a000-000000000020",
  rice: "a4000000-0000-4000-a000-000000000021",
  water: "a4000000-0000-4000-a000-000000000022",
  peas: "a4000000-0000-4000-a000-000000000023",
  yogurtSauce: "a4000000-0000-4000-a000-000000000024",
  cilantro: "a4000000-0000-4000-a000-000000000025",
  lemon: "a4000000-0000-4000-a000-000000000026",
  // snack
  yogurt: "a4000000-0000-4000-a000-000000000030",
  berries: "a4000000-0000-4000-a000-000000000031",
  walnuts: "a4000000-0000-4000-a000-000000000032",
} as const;

const S = {
  b1: "a5000000-0000-4000-a000-000000000001",
  b2: "a5000000-0000-4000-a000-000000000002",
  b3: "a5000000-0000-4000-a000-000000000003",
  k1: "a5000000-0000-4000-a000-000000000010",
  k2: "a5000000-0000-4000-a000-000000000011",
  k3: "a5000000-0000-4000-a000-000000000012",
  k4: "a5000000-0000-4000-a000-000000000013",
  k5: "a5000000-0000-4000-a000-000000000014",
  k6: "a5000000-0000-4000-a000-000000000015",
  k7: "a5000000-0000-4000-a000-000000000016",
  s1: "a5000000-0000-4000-a000-000000000020",
} as const;

function recipe(
  id: string,
  canonicalKey: string,
  section: CatalogRecipe["section"],
  versionId: string,
): CatalogRecipe {
  return {
    id,
    canonicalKey,
    section,
    currentPublishedVersionId: versionId,
    createdAt: TS,
    updatedAt: TS,
  };
}

function publishedVersion(
  partial: Omit<
    CatalogRecipeVersion,
    "status" | "kitchenTestStatus" | "createdAt" | "publishedAt"
  > &
    Partial<Pick<CatalogRecipeVersion, "lunchSuitability" | "dinnerSuitability">>,
): CatalogRecipeVersion {
  return {
    ...partial,
    status: "published",
    kitchenTestStatus: "not_tested",
    createdAt: TS,
    publishedAt: PUBLISHED_AT,
  };
}

function buildBreakfast(): RecipeVersionGraph {
  const recipeId = SEED_RECIPE_IDS.eggAvocadoToast;
  const versionId = SEED_VERSION_IDS.eggAvocadoToastV1;
  const components: CatalogRecipeComponent[] = [
    {
      id: C.bMain,
      recipeVersionId: versionId,
      name: "Toast assembly",
      kind: "main",
      displayOrder: 0,
      adjustable: false,
    },
  ];
  const ingredients: CatalogRecipeIngredient[] = [
    {
      id: I.egg,
      recipeVersionId: versionId,
      componentId: C.bMain,
      canonicalIngredientId: SEED_INGREDIENT_IDS.largeChickenEggs,
      proteinProductId: SEED_PRODUCT_IDS.largeChickenEggs,
      quantity: 2,
      unit: "count",
      preparation: "cracked",
      optional: false,
      displayOrder: 0,
    },
    {
      id: I.avocado,
      recipeVersionId: versionId,
      componentId: C.bMain,
      canonicalIngredientId: SEED_INGREDIENT_IDS.avocado,
      quantity: 80,
      unit: "g",
      preparation: "sliced",
      optional: false,
      displayOrder: 1,
    },
    {
      id: I.bread,
      recipeVersionId: versionId,
      componentId: C.bMain,
      canonicalIngredientId: SEED_INGREDIENT_IDS.wholeGrainBread,
      quantity: 2,
      unit: "count",
      optional: false,
      displayOrder: 2,
    },
    {
      id: I.oil,
      recipeVersionId: versionId,
      componentId: C.bMain,
      canonicalIngredientId: SEED_INGREDIENT_IDS.oliveOil,
      quantity: 5,
      unit: "ml",
      optional: false,
      displayOrder: 3,
    },
    {
      id: I.saltB,
      recipeVersionId: versionId,
      componentId: C.bMain,
      canonicalIngredientId: SEED_INGREDIENT_IDS.kosherSalt,
      quantity: 1,
      unit: "g",
      optional: false,
      displayOrder: 4,
    },
    {
      id: I.pepperB,
      recipeVersionId: versionId,
      componentId: C.bMain,
      canonicalIngredientId: SEED_INGREDIENT_IDS.blackPepper,
      quantity: 0.5,
      unit: "g",
      optional: false,
      displayOrder: 5,
    },
  ];
  const steps: CatalogRecipeStep[] = [
    {
      id: S.b1,
      recipeVersionId: versionId,
      componentId: C.bMain,
      order: 1,
      title: "Toast bread",
      instruction:
        "Toast 2 slices of whole-grain bread until golden and firm enough to hold toppings.",
      activeMinutes: 3,
      equipment: ["toaster"],
    },
    {
      id: S.b2,
      recipeVersionId: versionId,
      componentId: C.bMain,
      order: 2,
      title: "Cook eggs",
      instruction:
        "Warm olive oil in a nonstick skillet over medium heat. Crack in 2 large eggs and cook to desired doneness (about 3 minutes for set whites).",
      activeMinutes: 4,
      equipment: ["nonstick_skillet", "spatula"],
    },
    {
      id: S.b3,
      recipeVersionId: versionId,
      componentId: C.bMain,
      order: 3,
      title: "Assemble",
      instruction:
        "Slice avocado. Top each toast slice with avocado, one egg, then salt and black pepper.",
      activeMinutes: 3,
      equipment: ["knife", "cutting_board"],
    },
  ];
  const usages: CatalogRecipeStepIngredientUsage[] = [
    { id: "a6000000-0000-4000-a000-000000000001", recipeStepId: S.b1, recipeIngredientId: I.bread, quantity: 2, unit: "count", action: "toast" },
    { id: "a6000000-0000-4000-a000-000000000002", recipeStepId: S.b2, recipeIngredientId: I.oil, quantity: 5, unit: "ml", action: "heat" },
    { id: "a6000000-0000-4000-a000-000000000003", recipeStepId: S.b2, recipeIngredientId: I.egg, quantity: 2, unit: "count", action: "cook" },
    { id: "a6000000-0000-4000-a000-000000000004", recipeStepId: S.b3, recipeIngredientId: I.avocado, quantity: 80, unit: "g", action: "slice_and_top" },
    { id: "a6000000-0000-4000-a000-000000000005", recipeStepId: S.b3, recipeIngredientId: I.saltB, quantity: 1, unit: "g", action: "season" },
    { id: "a6000000-0000-4000-a000-000000000006", recipeStepId: S.b3, recipeIngredientId: I.pepperB, quantity: 0.5, unit: "g", action: "season" },
  ];
  const classifications: CatalogRecipeClassifications = {
    recipeVersionId: versionId,
    cuisines: ["american"],
    flavorProfiles: ["savory", "mild"],
    experiencePreferences: ["fresh", "light_refreshing"],
    cookingMethods: ["stovetop", "assembly"],
    allergens: ["egg", "gluten"],
    dietaryAttributes: ["vegetarian", "high_protein", "contains_gluten"],
    requiredEquipment: ["toaster", "nonstick_skillet", "spatula", "knife", "cutting_board"],
  };
  const scaling: CatalogRecipeScalingProfile = {
    recipeVersionId: versionId,
    method: "linear",
    minimumServings: 1,
    maximumServings: 4,
    servingIncrement: 1,
    notes: "Scale eggs and toast slices together.",
  };
  const storage: CatalogRecipeStorageProfile = {
    recipeVersionId: versionId,
    prepStyle: "cook_fresh",
    refrigerationSupported: false,
    freezingSupported: false,
    storeComponentsSeparately: false,
    notes: "Best assembled and eaten fresh; storage horizons not reviewed.",
  };
  const provenance: CatalogRecipeProvenance = {
    recipeVersionId: versionId,
    type: "editor_authored",
    sourceCreator: "Fitness Autopilot culinary reference",
    reviewedBy: undefined,
    kitchenTestedAt: undefined,
  };
  return {
    recipe: recipe(recipeId, "egg_avocado_whole_grain_toast", "breakfast", versionId),
    version: publishedVersion({
      id: versionId,
      recipeId,
      version: 1,
      title: "Egg, Avocado and Whole-Grain Toast",
      description:
        "Simple breakfast assembly with exact large-egg protein product, avocado, and whole-grain toast.",
      referenceServings: 1,
      activeMinutes: 10,
      passiveMinutes: 0,
    }),
    components,
    ingredients,
    steps,
    usages,
    classifications,
    scaling,
    storage,
    provenance,
  };
}

function buildKheemaBowl(): RecipeVersionGraph {
  const recipeId = SEED_RECIPE_IDS.groundChickenKheemaBowl;
  const versionId = SEED_VERSION_IDS.groundChickenKheemaBowlV1;
  const components: CatalogRecipeComponent[] = [
    { id: C.kKheema, recipeVersionId: versionId, name: "Ground Chicken Kheema", kind: "main", displayOrder: 0, adjustable: true },
    { id: C.kRice, recipeVersionId: versionId, name: "Rice", kind: "carbohydrate", displayOrder: 1, adjustable: true },
    { id: C.kVeg, recipeVersionId: versionId, name: "Vegetables", kind: "vegetable", displayOrder: 2, adjustable: true },
    { id: C.kSauce, recipeVersionId: versionId, name: "Yogurt Sauce", kind: "sauce", displayOrder: 3, adjustable: true },
  ];
  const ingredients: CatalogRecipeIngredient[] = [
    { id: I.groundChicken, recipeVersionId: versionId, componentId: C.kKheema, canonicalIngredientId: SEED_INGREDIENT_IDS.groundChicken, proteinProductId: SEED_PRODUCT_IDS.groundChicken, quantity: 450, unit: "g", preparation: "raw", optional: false, displayOrder: 0 },
    { id: I.onion, recipeVersionId: versionId, componentId: C.kKheema, canonicalIngredientId: SEED_INGREDIENT_IDS.yellowOnion, quantity: 150, unit: "g", preparation: "finely diced", optional: false, displayOrder: 1 },
    { id: I.garlic, recipeVersionId: versionId, componentId: C.kKheema, canonicalIngredientId: SEED_INGREDIENT_IDS.garlic, quantity: 12, unit: "g", preparation: "minced", optional: false, displayOrder: 2 },
    { id: I.ginger, recipeVersionId: versionId, componentId: C.kKheema, canonicalIngredientId: SEED_INGREDIENT_IDS.freshGinger, quantity: 10, unit: "g", preparation: "minced", optional: false, displayOrder: 3 },
    { id: I.tomato, recipeVersionId: versionId, componentId: C.kKheema, canonicalIngredientId: SEED_INGREDIENT_IDS.romaTomato, quantity: 200, unit: "g", preparation: "diced", optional: false, displayOrder: 4 },
    { id: I.cumin, recipeVersionId: versionId, componentId: C.kKheema, canonicalIngredientId: SEED_INGREDIENT_IDS.groundCumin, quantity: 4, unit: "g", optional: false, displayOrder: 5 },
    { id: I.coriander, recipeVersionId: versionId, componentId: C.kKheema, canonicalIngredientId: SEED_INGREDIENT_IDS.groundCoriander, quantity: 4, unit: "g", optional: false, displayOrder: 6 },
    { id: I.turmeric, recipeVersionId: versionId, componentId: C.kKheema, canonicalIngredientId: SEED_INGREDIENT_IDS.groundTurmeric, quantity: 2, unit: "g", optional: false, displayOrder: 7 },
    { id: I.garam, recipeVersionId: versionId, componentId: C.kKheema, canonicalIngredientId: SEED_INGREDIENT_IDS.garamMasala, quantity: 3, unit: "g", optional: false, displayOrder: 8 },
    { id: I.oilK, recipeVersionId: versionId, componentId: C.kKheema, canonicalIngredientId: SEED_INGREDIENT_IDS.oliveOil, quantity: 15, unit: "ml", optional: false, displayOrder: 9 },
    { id: I.saltK, recipeVersionId: versionId, componentId: C.kKheema, canonicalIngredientId: SEED_INGREDIENT_IDS.kosherSalt, quantity: 6, unit: "g", optional: false, displayOrder: 10 },
    { id: I.rice, recipeVersionId: versionId, componentId: C.kRice, canonicalIngredientId: SEED_INGREDIENT_IDS.longGrainWhiteRice, quantity: 180, unit: "g", preparation: "rinsed", optional: false, displayOrder: 11 },
    { id: I.water, recipeVersionId: versionId, componentId: C.kRice, canonicalIngredientId: SEED_INGREDIENT_IDS.water, quantity: 360, unit: "ml", optional: false, displayOrder: 12 },
    { id: I.peas, recipeVersionId: versionId, componentId: C.kVeg, canonicalIngredientId: SEED_INGREDIENT_IDS.frozenGreenPeas, quantity: 120, unit: "g", optional: false, displayOrder: 13 },
    { id: I.yogurtSauce, recipeVersionId: versionId, componentId: C.kSauce, canonicalIngredientId: SEED_INGREDIENT_IDS.plainGreekYogurt, quantity: 100, unit: "g", optional: false, displayOrder: 14 },
    { id: I.cilantro, recipeVersionId: versionId, componentId: C.kSauce, canonicalIngredientId: SEED_INGREDIENT_IDS.freshCilantro, quantity: 10, unit: "g", preparation: "chopped", optional: true, displayOrder: 15 },
    { id: I.lemon, recipeVersionId: versionId, componentId: C.kSauce, canonicalIngredientId: SEED_INGREDIENT_IDS.lemonJuice, quantity: 15, unit: "ml", optional: false, displayOrder: 16 },
  ];
  const steps: CatalogRecipeStep[] = [
    { id: S.k1, recipeVersionId: versionId, componentId: C.kKheema, order: 1, title: "Prep aromatics", instruction: "Finely dice onion. Mince garlic and ginger. Dice tomato. Keep each pile separate.", activeMinutes: 10, equipment: ["knife", "cutting_board"] },
    { id: S.k2, recipeVersionId: versionId, componentId: C.kRice, order: 2, title: "Cook rice", instruction: "Combine rinsed rice and water in a saucepan. Bring to a boil, cover, reduce heat to low, and simmer until water is absorbed (about 15 minutes). Rest covered 5 minutes.", activeMinutes: 5, passiveMinutes: 20, equipment: ["saucepan", "lid"] },
    { id: S.k3, recipeVersionId: versionId, componentId: C.kKheema, order: 3, title: "Bloom spices", instruction: "Heat olive oil in a wide skillet over medium heat. Add onion and cook until translucent (5 minutes). Stir in garlic and ginger for 1 minute. Add cumin, coriander, and turmeric; stir 30 seconds until fragrant.", activeMinutes: 7, equipment: ["skillet", "spatula"] },
    { id: S.k4, recipeVersionId: versionId, componentId: C.kKheema, order: 4, title: "Brown ground chicken", instruction: "Add ground chicken. Break into small pieces and cook until no pink remains (6–8 minutes). Season with salt.", activeMinutes: 8, equipment: ["skillet", "spatula"] },
    { id: S.k5, recipeVersionId: versionId, componentId: C.kKheema, order: 5, title: "Simmer with tomato", instruction: "Stir in diced tomato and garam masala. Simmer until tomato softens and mixture is saucy (5 minutes).", activeMinutes: 5, equipment: ["skillet"] },
    { id: S.k6, recipeVersionId: versionId, componentId: C.kVeg, order: 6, title: "Finish peas", instruction: "Fold frozen green peas into the kheema and cook until heated through (2–3 minutes).", activeMinutes: 3, equipment: ["skillet"] },
    { id: S.k7, recipeVersionId: versionId, componentId: C.kSauce, order: 7, title: "Sauce and serve", instruction: "Stir lemon juice into Greek yogurt. Optionally fold in chopped cilantro. Serve kheema over rice with yogurt sauce on the side (keep sauce separate for storage).", activeMinutes: 3, equipment: ["bowl", "spoon"] },
  ];
  const usages: CatalogRecipeStepIngredientUsage[] = [
    { id: "a6000000-0000-4000-a000-000000000010", recipeStepId: S.k1, recipeIngredientId: I.onion, quantity: 150, unit: "g", action: "dice" },
    { id: "a6000000-0000-4000-a000-000000000011", recipeStepId: S.k1, recipeIngredientId: I.garlic, quantity: 12, unit: "g", action: "mince" },
    { id: "a6000000-0000-4000-a000-000000000012", recipeStepId: S.k1, recipeIngredientId: I.ginger, quantity: 10, unit: "g", action: "mince" },
    { id: "a6000000-0000-4000-a000-000000000013", recipeStepId: S.k1, recipeIngredientId: I.tomato, quantity: 200, unit: "g", action: "dice" },
    { id: "a6000000-0000-4000-a000-000000000014", recipeStepId: S.k2, recipeIngredientId: I.rice, quantity: 180, unit: "g", action: "cook" },
    { id: "a6000000-0000-4000-a000-000000000015", recipeStepId: S.k2, recipeIngredientId: I.water, quantity: 360, unit: "ml", action: "cook" },
    { id: "a6000000-0000-4000-a000-000000000016", recipeStepId: S.k3, recipeIngredientId: I.oilK, quantity: 15, unit: "ml", action: "heat" },
    { id: "a6000000-0000-4000-a000-000000000017", recipeStepId: S.k3, recipeIngredientId: I.onion, quantity: 150, unit: "g", action: "saute" },
    { id: "a6000000-0000-4000-a000-000000000018", recipeStepId: S.k3, recipeIngredientId: I.garlic, quantity: 12, unit: "g", action: "saute" },
    { id: "a6000000-0000-4000-a000-000000000019", recipeStepId: S.k3, recipeIngredientId: I.ginger, quantity: 10, unit: "g", action: "saute" },
    { id: "a6000000-0000-4000-a000-000000000020", recipeStepId: S.k3, recipeIngredientId: I.cumin, quantity: 4, unit: "g", action: "bloom" },
    { id: "a6000000-0000-4000-a000-000000000021", recipeStepId: S.k3, recipeIngredientId: I.coriander, quantity: 4, unit: "g", action: "bloom" },
    { id: "a6000000-0000-4000-a000-000000000022", recipeStepId: S.k3, recipeIngredientId: I.turmeric, quantity: 2, unit: "g", action: "bloom" },
    { id: "a6000000-0000-4000-a000-000000000023", recipeStepId: S.k4, recipeIngredientId: I.groundChicken, quantity: 450, unit: "g", action: "brown" },
    { id: "a6000000-0000-4000-a000-000000000024", recipeStepId: S.k4, recipeIngredientId: I.saltK, quantity: 6, unit: "g", action: "season" },
    { id: "a6000000-0000-4000-a000-000000000025", recipeStepId: S.k5, recipeIngredientId: I.tomato, quantity: 200, unit: "g", action: "simmer" },
    { id: "a6000000-0000-4000-a000-000000000026", recipeStepId: S.k5, recipeIngredientId: I.garam, quantity: 3, unit: "g", action: "season" },
    { id: "a6000000-0000-4000-a000-000000000027", recipeStepId: S.k6, recipeIngredientId: I.peas, quantity: 120, unit: "g", action: "heat" },
    { id: "a6000000-0000-4000-a000-000000000028", recipeStepId: S.k7, recipeIngredientId: I.yogurtSauce, quantity: 100, unit: "g", action: "mix" },
    { id: "a6000000-0000-4000-a000-000000000029", recipeStepId: S.k7, recipeIngredientId: I.lemon, quantity: 15, unit: "ml", action: "mix" },
    { id: "a6000000-0000-4000-a000-000000000030", recipeStepId: S.k7, recipeIngredientId: I.cilantro, quantity: 10, unit: "g", action: "optional_fold" },
  ];

  // Fix: onion/garlic/ginger/tomato are used in prep AND cook — that double-counts!
  // Per domain rules: sum of usages must equal authoritative quantity.
  // Preparation before usage: prep step can note preparation without consuming quantity,
  // OR we only count the cooking usage. The story says "Ingredient preparation must appear before usage"
  // and "A split ingredient may have multiple usages" when totals reconcile.
  // So prep steps should NOT also list full quantity if cook uses full quantity.
  // Fix usages: prep steps use action notes but we should only have one accounting path.
  // Better approach: remove quantity from prep for aromatics that are fully used later —
  // OR split: prep doesn't create usages; only cooking steps create usages.
  // I'll rebuild kheema usages without double-counting prep.

  const usagesFixed: CatalogRecipeStepIngredientUsage[] = [
    { id: "a6000000-0000-4000-a000-000000000010", recipeStepId: S.k2, recipeIngredientId: I.rice, quantity: 180, unit: "g", action: "cook" },
    { id: "a6000000-0000-4000-a000-000000000011", recipeStepId: S.k2, recipeIngredientId: I.water, quantity: 360, unit: "ml", action: "cook" },
    { id: "a6000000-0000-4000-a000-000000000012", recipeStepId: S.k3, recipeIngredientId: I.oilK, quantity: 15, unit: "ml", action: "heat" },
    { id: "a6000000-0000-4000-a000-000000000013", recipeStepId: S.k3, recipeIngredientId: I.onion, quantity: 150, unit: "g", action: "saute" },
    { id: "a6000000-0000-4000-a000-000000000014", recipeStepId: S.k3, recipeIngredientId: I.garlic, quantity: 12, unit: "g", action: "saute" },
    { id: "a6000000-0000-4000-a000-000000000015", recipeStepId: S.k3, recipeIngredientId: I.ginger, quantity: 10, unit: "g", action: "saute" },
    { id: "a6000000-0000-4000-a000-000000000016", recipeStepId: S.k3, recipeIngredientId: I.cumin, quantity: 4, unit: "g", action: "bloom" },
    { id: "a6000000-0000-4000-a000-000000000017", recipeStepId: S.k3, recipeIngredientId: I.coriander, quantity: 4, unit: "g", action: "bloom" },
    { id: "a6000000-0000-4000-a000-000000000018", recipeStepId: S.k3, recipeIngredientId: I.turmeric, quantity: 2, unit: "g", action: "bloom" },
    { id: "a6000000-0000-4000-a000-000000000019", recipeStepId: S.k4, recipeIngredientId: I.groundChicken, quantity: 450, unit: "g", action: "brown" },
    { id: "a6000000-0000-4000-a000-000000000020", recipeStepId: S.k4, recipeIngredientId: I.saltK, quantity: 6, unit: "g", action: "season" },
    { id: "a6000000-0000-4000-a000-000000000021", recipeStepId: S.k5, recipeIngredientId: I.tomato, quantity: 200, unit: "g", action: "simmer" },
    { id: "a6000000-0000-4000-a000-000000000022", recipeStepId: S.k5, recipeIngredientId: I.garam, quantity: 3, unit: "g", action: "season" },
    { id: "a6000000-0000-4000-a000-000000000023", recipeStepId: S.k6, recipeIngredientId: I.peas, quantity: 120, unit: "g", action: "heat" },
    { id: "a6000000-0000-4000-a000-000000000024", recipeStepId: S.k7, recipeIngredientId: I.yogurtSauce, quantity: 100, unit: "g", action: "mix" },
    { id: "a6000000-0000-4000-a000-000000000025", recipeStepId: S.k7, recipeIngredientId: I.lemon, quantity: 15, unit: "ml", action: "mix" },
    { id: "a6000000-0000-4000-a000-000000000026", recipeStepId: S.k7, recipeIngredientId: I.cilantro, quantity: 10, unit: "g", action: "optional_fold" },
  ];
  void usages;

  const classifications: CatalogRecipeClassifications = {
    recipeVersionId: versionId,
    cuisines: ["indian"],
    flavorProfiles: ["savory", "aromatic", "rich"],
    experiencePreferences: ["saucy_flavorful", "comforting", "spicy"],
    cookingMethods: ["stovetop"],
    allergens: ["dairy"],
    dietaryAttributes: ["high_protein", "contains_meat", "contains_dairy"],
    requiredEquipment: ["knife", "cutting_board", "saucepan", "lid", "skillet", "spatula", "bowl", "spoon"],
  };
  return {
    recipe: recipe(recipeId, "ground_chicken_kheema_bowl", "meal", versionId),
    version: publishedVersion({
      id: versionId,
      recipeId,
      version: 1,
      title: "Ground Chicken Kheema Bowl",
      description:
        "Spiced ground-chicken bowl with rice, peas, and a yogurt sauce. Culinary reference formulation — not a claim of regional authenticity.",
      referenceServings: 4,
      activeMinutes: 41,
      passiveMinutes: 20,
      lunchSuitability: "preferred",
      dinnerSuitability: "preferred",
    }),
    components,
    ingredients,
    steps,
    usages: usagesFixed,
    classifications,
    scaling: {
      recipeVersionId: versionId,
      method: "linear",
      minimumServings: 2,
      maximumServings: 8,
      servingIncrement: 1,
      notes: "Scale protein and rice together; keep sauce separate when storing.",
    },
    storage: {
      recipeVersionId: versionId,
      prepStyle: "batch_cook",
      refrigerationSupported: true,
      freezingSupported: false,
      storeComponentsSeparately: true,
      notes: "Store yogurt sauce separately from hot components. Freezer horizon not reviewed — freezingSupported remains false.",
    },
    provenance: {
      recipeVersionId: versionId,
      type: "editor_authored",
      sourceCreator: "Fitness Autopilot culinary reference",
    },
  };
}

function buildSnack(): RecipeVersionGraph {
  const recipeId = SEED_RECIPE_IDS.greekYogurtBerriesWalnuts;
  const versionId = SEED_VERSION_IDS.greekYogurtBerriesWalnutsV1;
  const components: CatalogRecipeComponent[] = [
    { id: C.sMain, recipeVersionId: versionId, name: "Yogurt bowl", kind: "main", displayOrder: 0, adjustable: true },
  ];
  const ingredients: CatalogRecipeIngredient[] = [
    { id: I.yogurt, recipeVersionId: versionId, componentId: C.sMain, canonicalIngredientId: SEED_INGREDIENT_IDS.plainGreekYogurt, quantity: 170, unit: "g", optional: false, displayOrder: 0 },
    { id: I.berries, recipeVersionId: versionId, componentId: C.sMain, canonicalIngredientId: SEED_INGREDIENT_IDS.mixedBerries, quantity: 80, unit: "g", optional: false, displayOrder: 1 },
    { id: I.walnuts, recipeVersionId: versionId, componentId: C.sMain, canonicalIngredientId: SEED_INGREDIENT_IDS.walnutHalves, quantity: 20, unit: "g", preparation: "roughly chopped", optional: false, displayOrder: 2 },
  ];
  const steps: CatalogRecipeStep[] = [
    {
      id: S.s1,
      recipeVersionId: versionId,
      componentId: C.sMain,
      order: 1,
      title: "Assemble",
      instruction: "Spoon Greek yogurt into a bowl. Top with mixed berries and roughly chopped walnuts. Serve immediately.",
      activeMinutes: 3,
      equipment: ["bowl", "spoon", "knife"],
    },
  ];
  const usages: CatalogRecipeStepIngredientUsage[] = [
    { id: "a6000000-0000-4000-a000-000000000040", recipeStepId: S.s1, recipeIngredientId: I.yogurt, quantity: 170, unit: "g", action: "portion" },
    { id: "a6000000-0000-4000-a000-000000000041", recipeStepId: S.s1, recipeIngredientId: I.berries, quantity: 80, unit: "g", action: "top" },
    { id: "a6000000-0000-4000-a000-000000000042", recipeStepId: S.s1, recipeIngredientId: I.walnuts, quantity: 20, unit: "g", action: "top" },
  ];
  return {
    recipe: recipe(recipeId, "greek_yogurt_berries_walnuts", "snack", versionId),
    version: publishedVersion({
      id: versionId,
      recipeId,
      version: 1,
      title: "Greek Yogurt, Berries and Walnuts",
      description: "Quick no-cook snack with portionable dairy, fruit, and tree nuts.",
      referenceServings: 1,
      activeMinutes: 3,
      passiveMinutes: 0,
    }),
    components,
    ingredients,
    steps,
    usages,
    classifications: {
      recipeVersionId: versionId,
      cuisines: ["american"],
      flavorProfiles: ["bright", "mild"],
      experiencePreferences: ["fresh", "light_refreshing"],
      cookingMethods: ["no_cook", "assembly"],
      allergens: ["dairy", "tree_nut"],
      dietaryAttributes: ["vegetarian", "high_protein", "contains_dairy"],
      requiredEquipment: ["bowl", "spoon", "knife"],
    },
    scaling: {
      recipeVersionId: versionId,
      method: "linear",
      minimumServings: 1,
      maximumServings: 4,
      servingIncrement: 1,
    },
    storage: {
      recipeVersionId: versionId,
      prepStyle: "assemble_later",
      refrigerationSupported: true,
      freezingSupported: false,
      storeComponentsSeparately: true,
      notes: "Keep components separate until serving. Freezer guidance not reviewed.",
    },
    provenance: {
      recipeVersionId: versionId,
      type: "editor_authored",
      sourceCreator: "Fitness Autopilot culinary reference",
    },
  };
}

export type RecipeCatalogSnapshot = {
  graphs: RecipeVersionGraph[];
};

export function createSeedRecipeCatalogSnapshot(): RecipeCatalogSnapshot {
  return {
    graphs: [buildBreakfast(), buildKheemaBowl(), buildSnack()],
  };
}

export function flattenRecipeCatalogSnapshot(snapshot: RecipeCatalogSnapshot): {
  recipes: CatalogRecipe[];
  versions: CatalogRecipeVersion[];
  components: CatalogRecipeComponent[];
  ingredients: CatalogRecipeIngredient[];
  steps: CatalogRecipeStep[];
  usages: CatalogRecipeStepIngredientUsage[];
  classifications: CatalogRecipeClassifications[];
  scalingProfiles: CatalogRecipeScalingProfile[];
  storageProfiles: CatalogRecipeStorageProfile[];
  provenances: CatalogRecipeProvenance[];
} {
  return {
    recipes: snapshot.graphs.map((g) => g.recipe),
    versions: snapshot.graphs.map((g) => g.version),
    components: snapshot.graphs.flatMap((g) => g.components),
    ingredients: snapshot.graphs.flatMap((g) => g.ingredients),
    steps: snapshot.graphs.flatMap((g) => g.steps),
    usages: snapshot.graphs.flatMap((g) => g.usages),
    classifications: snapshot.graphs.map((g) => g.classifications),
    scalingProfiles: snapshot.graphs.map((g) => g.scaling),
    storageProfiles: snapshot.graphs.map((g) => g.storage),
    provenances: snapshot.graphs.map((g) => g.provenance),
  };
}
