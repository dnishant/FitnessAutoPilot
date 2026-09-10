import type {
  CalorieTarget,
  CreateGoalRequest,
  DailyPlan,
  Goal,
  MealInstance,
  CookingPreferences,
  CookingPreferencesInput,
  MealPreferences,
  MealPreferencesInput,
  NutritionTarget,
  OnboardingGoalType,
  ProfileBasics,
  RmrEstimate,
  TdeeEstimate,
  UserProfile,
} from "@fitness-autopilot/contracts";
import { UserProfileSchema } from "@fitness-autopilot/contracts";
import {
  appendCalorieTarget,
  appendNutritionTarget,
  appendRmrEstimate,
  appendTdeeEstimate,
  calculateNutritionTarget,
  lbToKg,
  nutritionTargetPersistFields,
  planOneDay,
  selectCurrentCalorieTarget,
  selectCurrentNutritionTarget,
  selectCurrentRmr,
  selectCurrentTdee,
  upsertCurrentCookingPreferences,
  upsertCurrentMealPreferences,
  utcDateKey,
  type CalorieTargetDraft,
  type MacroTargetDraft,
  type NutritionTargetCalculation,
  type RmrEstimateDraft,
  type TdeeEstimateDraft,
} from "@fitness-autopilot/domain";
import { catalog, foodsById } from "@fitness-autopilot/test-fixtures";

function uuidFromSeed(seed: string): string {
  // Deterministic UUID-shaped id for local/demo persistence (not cryptographically random).
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const hex = (hash.toString(16) + "0".repeat(32)).slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export type LocalStore = {
  userId: string;
  email: string;
  profile: ProfileBasics | null;
  rmrHistory: RmrEstimate[];
  currentRmr: RmrEstimate | null;
  tdeeHistory: TdeeEstimate[];
  currentTdee: TdeeEstimate | null;
  calorieTargetHistory: CalorieTarget[];
  currentCalorieTarget: CalorieTarget | null;
  nutritionTargetHistory: NutritionTarget[];
  currentNutritionTarget: NutritionTarget | null;
  mealPreferences: MealPreferences | null;
  cookingPreferences: CookingPreferences | null;
  goal: Goal | null;
  nutritionTarget: (NutritionTarget & { calculation?: NutritionTargetCalculation }) | null;
  dailyPlan: DailyPlan | null;
};

const memory = new Map<string, LocalStore>();

export function getLocalStore(userId: string): LocalStore | null {
  return memory.get(userId) ?? null;
}

export function ensureLocalUser(email: string, password: string): LocalStore {
  const userId = uuidFromSeed(`user:${email.toLowerCase()}:${password}`);
  const existing = memory.get(userId);
  if (existing) {
    return existing;
  }
  const store: LocalStore = {
    userId,
    email,
    profile: null,
    rmrHistory: [],
    currentRmr: null,
    tdeeHistory: [],
    currentTdee: null,
    calorieTargetHistory: [],
    currentCalorieTarget: null,
    nutritionTargetHistory: [],
    currentNutritionTarget: null,
    mealPreferences: null,
    cookingPreferences: null,
    goal: null,
    nutritionTarget: null,
    dailyPlan: null,
  };
  memory.set(userId, store);
  return store;
}

export function localSaveProfile(userId: string, profile: ProfileBasics): ProfileBasics {
  const store = memory.get(userId);
  if (!store) {
    throw new Error("Local user missing");
  }
  const next = { ...profile, userId };
  store.profile = next;
  return next;
}

export function localSaveRmrEstimate(userId: string, draft: RmrEstimateDraft): RmrEstimate {
  const store = memory.get(userId);
  if (!store) {
    throw new Error("Local user missing");
  }
  const previous = store.rmrHistory.map((row) => ({ ...row }));
  const now = draft.calculatedAt;
  const saved: RmrEstimate = {
    id: uuidFromSeed(`rmr:${userId}:${draft.source}:${draft.rmrKcal}:${now}:${store.rmrHistory.length}`),
    userId,
    rmrKcal: draft.rmrKcal,
    source: draft.source,
    algorithmName: draft.algorithmName,
    algorithmVersion: draft.algorithmVersion,
    inputSnapshot: draft.inputSnapshot,
    reportedOrMeasuredAt: draft.reportedOrMeasuredAt,
    calculatedAt: draft.calculatedAt,
    createdAt: now,
  };
  store.rmrHistory = appendRmrEstimate(store.rmrHistory, saved);
  store.currentRmr = selectCurrentRmr(store.rmrHistory);
  // Guardrail: previous rows stay byte-for-byte intact.
  previous.forEach((row, index) => {
    const current = store.rmrHistory[index];
    if (JSON.stringify(current) !== JSON.stringify(row)) {
      throw new Error("RMR history mutation is not allowed");
    }
  });
  return saved;
}

export function localSaveTdeeEstimate(userId: string, draft: TdeeEstimateDraft): TdeeEstimate {
  const store = memory.get(userId);
  if (!store) {
    throw new Error("Local user missing");
  }
  const previous = store.tdeeHistory.map((row) => ({ ...row }));
  const now = draft.calculatedAt;
  const saved: TdeeEstimate = {
    id: uuidFromSeed(`tdee:${userId}:${draft.source}:${draft.tdeeKcal}:${now}:${store.tdeeHistory.length}`),
    userId,
    tdeeKcal: draft.tdeeKcal,
    source: draft.source,
    wearable: draft.wearable,
    wearableCaloriesKcal: draft.wearableCaloriesKcal,
    rmrKcalUsed: draft.rmrKcalUsed,
    algorithmName: draft.algorithmName,
    algorithmVersion: draft.algorithmVersion,
    inputSnapshot: draft.inputSnapshot,
    calculatedAt: draft.calculatedAt,
    createdAt: now,
  };
  store.tdeeHistory = appendTdeeEstimate(store.tdeeHistory, saved);
  store.currentTdee = selectCurrentTdee(store.tdeeHistory);
  previous.forEach((row, index) => {
    const current = store.tdeeHistory[index];
    if (JSON.stringify(current) !== JSON.stringify(row)) {
      throw new Error("TDEE history mutation is not allowed");
    }
  });
  return saved;
}

export function localSaveCalorieTarget(
  userId: string,
  draft: CalorieTargetDraft,
  refs: { goalId: string; tdeeEstimateId: string },
): CalorieTarget {
  const store = memory.get(userId);
  if (!store) {
    throw new Error("Local user missing");
  }
  const previous = store.calorieTargetHistory.map((row) => ({ ...row }));
  const now = draft.createdAt;
  const saved: CalorieTarget = {
    id: uuidFromSeed(`calorie:${userId}:${draft.pace}:${draft.targetCalories}:${now}:${store.calorieTargetHistory.length}`),
    userId,
    goalId: refs.goalId,
    tdeeEstimateId: refs.tdeeEstimateId,
    tdeeKcal: draft.tdeeKcal,
    bodyWeightKg: draft.bodyWeightKg,
    bodyWeightLb: draft.bodyWeightLb,
    pace: draft.pace,
    targetRatePerWeek: draft.targetRatePerWeek,
    targetLbPerWeek: draft.targetLbPerWeek,
    weeklyCalorieAdjustment: draft.weeklyCalorieAdjustment,
    dailyCalorieAdjustment: draft.dailyCalorieAdjustment,
    targetCalories: draft.targetCalories,
    policyName: draft.policyName,
    policyVersion: draft.policyVersion,
    inputSnapshot: draft.inputSnapshot,
    createdAt: now,
  };
  store.calorieTargetHistory = appendCalorieTarget(store.calorieTargetHistory, saved);
  store.currentCalorieTarget = selectCurrentCalorieTarget(store.calorieTargetHistory);
  previous.forEach((row, index) => {
    const current = store.calorieTargetHistory[index];
    if (JSON.stringify(current) !== JSON.stringify(row)) {
      throw new Error("Calorie target history mutation is not allowed");
    }
  });
  return saved;
}

export function localSaveNutritionTarget(
  userId: string,
  draft: MacroTargetDraft,
  refs: { goalId: string; calorieTargetId: string; tdeeKcal: number; targetLbPerWeek: number },
): NutritionTarget {
  const store = memory.get(userId);
  if (!store) {
    throw new Error("Local user missing");
  }
  const previous = store.nutritionTargetHistory.map((row) => ({ ...row }));
  const now = draft.createdAt;
  const fields = nutritionTargetPersistFields({
    macros: draft,
    tdeeKcal: refs.tdeeKcal,
    desiredRateKgPerWeek: lbToKg(refs.targetLbPerWeek),
  });
  const saved: NutritionTarget = {
    id: uuidFromSeed(`nutrition:${userId}:${draft.targetCalories}:${now}:${store.nutritionTargetHistory.length}`),
    userId,
    goalId: refs.goalId,
    calorieTargetId: refs.calorieTargetId,
    ...fields,
    validFrom: now,
    createdAt: now,
  };
  store.nutritionTargetHistory = appendNutritionTarget(store.nutritionTargetHistory, saved);
  store.currentNutritionTarget = selectCurrentNutritionTarget(store.nutritionTargetHistory);
  store.nutritionTarget = saved;
  previous.forEach((row, index) => {
    const current = store.nutritionTargetHistory[index];
    if (JSON.stringify(current) !== JSON.stringify(row)) {
      throw new Error("Nutrition target history mutation is not allowed");
    }
  });
  return saved;
}

export function localSaveMealPreferences(
  userId: string,
  next: MealPreferencesInput,
  asOf: Date = new Date(),
): MealPreferences {
  const store = memory.get(userId);
  if (!store) {
    throw new Error("Local user missing");
  }
  const saved = upsertCurrentMealPreferences({
    userId,
    current: store.mealPreferences,
    next,
    asOf,
  });
  if (!saved.ok) {
    throw new Error(saved.error.message);
  }
  store.mealPreferences = saved.value;
  return saved.value;
}

export function localSaveCookingPreferences(
  userId: string,
  next: CookingPreferencesInput,
  asOf: Date = new Date(),
): CookingPreferences {
  const store = memory.get(userId);
  if (!store) {
    throw new Error("Local user missing");
  }
  const saved = upsertCurrentCookingPreferences({
    userId,
    current: store.cookingPreferences,
    next,
    asOf,
  });
  if (!saved.ok) {
    throw new Error(saved.error.message);
  }
  store.cookingPreferences = saved.value;
  return saved.value;
}

export function localSaveOnboardingGoal(userId: string, goalType: OnboardingGoalType, asOf: Date): Goal {
  return localSaveGoal(userId, {
    goalType,
    startDate: utcDateKey(asOf),
  });
}

export function localSaveGoal(userId: string, request: CreateGoalRequest): Goal {
  const store = memory.get(userId);
  if (!store) {
    throw new Error("Local user missing");
  }
  const now = new Date().toISOString();
  if (store.goal && store.goal.status === "active") {
    store.goal = { ...store.goal, status: "superseded", updatedAt: now };
  }
  const goal: Goal = {
    id: uuidFromSeed(`goal:${userId}:${request.goalType}:${request.startDate}:${now}`),
    userId,
    goalType: request.goalType,
    startDate: request.startDate,
    targetWeightKg: request.targetWeightKg,
    targetDate: request.targetDate,
    desiredRateKgPerWeek: request.desiredRateKgPerWeek,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  store.goal = goal;
  store.nutritionTarget = null;
  store.currentNutritionTarget = null;
  store.dailyPlan = null;
  return goal;
}

export function localGeneratePlan(userId: string, planDate?: string): {
  nutritionTarget: NutritionTarget;
  dailyPlan: DailyPlan;
} {
  const store = memory.get(userId);
  const parsedProfile = store?.profile ? UserProfileSchema.safeParse(store.profile) : null;
  if (!store || !parsedProfile?.success || !store.goal) {
    throw new Error("A complete meal-planning profile and goal are required before generating a plan.");
  }
  const profile: UserProfile = parsedProfile.data;

  const calculated = calculateNutritionTarget(profile, store.goal);
  if (!calculated.ok) {
    throw new Error(calculated.error.message);
  }

  const now = new Date().toISOString();
  const nutritionTarget: NutritionTarget = {
    id: uuidFromSeed(`target:${userId}:${store.goal.id}:${calculated.value.algorithmVersion}`),
    userId,
    goalId: store.goal.id,
    estimatedMaintenanceCalories: calculated.value.estimatedMaintenanceCalories,
    targetCalories: calculated.value.targetCalories,
    proteinG: calculated.value.proteinG,
    fatMinG: calculated.value.fatMinG,
    fatMaxG: calculated.value.fatMaxG,
    carbohydrateG: calculated.value.carbohydrateG,
    desiredRateKgPerWeek: calculated.value.desiredRateKgPerWeek,
    algorithmName: calculated.value.algorithmName,
    algorithmVersion: calculated.value.algorithmVersion,
    inputSnapshot: calculated.value.inputSnapshot,
    validFrom: now,
    createdAt: now,
  };

  const planned = planOneDay({
    profile,
    nutritionTarget: calculated.value,
    catalog,
    foodsById,
  });
  if (!planned.ok) {
    throw new Error(planned.error.message);
  }

  const dailyPlanId = uuidFromSeed(`plan:${userId}:${planDate ?? now.slice(0, 10)}:${now}`);
  const meals: MealInstance[] = planned.value.meals.map((meal, index) => ({
    id: uuidFromSeed(`meal:${dailyPlanId}:${meal.mealType}:${index}`),
    dailyPlanId,
    recipeId: meal.portioned.recipe.id,
    recipeKey: meal.portioned.recipe.recipeKey,
    recipeName: meal.portioned.recipe.name,
    mealType: meal.mealType,
    portionMultiplier: 1,
    plannedCalories: meal.portioned.nutrition.caloriesKcal,
    plannedProteinG: meal.portioned.nutrition.proteinG,
    plannedCarbsG: meal.portioned.nutrition.carbsG,
    plannedFatG: meal.portioned.nutrition.fatG,
    ingredientSnapshot: meal.portioned.lines.map((line) => ({
      recipeIngredientId: line.recipeIngredientId,
      foodId: line.foodId,
      foodName: line.foodName,
      role: line.role,
      quantityG: line.quantityG,
      nutrition: line.nutrition,
    })),
    createdAt: now,
  }));

  const dailyPlan: DailyPlan = {
    id: dailyPlanId,
    userId,
    nutritionTargetId: nutritionTarget.id,
    planDate: planDate ?? now.slice(0, 10),
    plannedCalories: planned.value.plannedCalories,
    plannedProteinG: planned.value.plannedProteinG,
    meals,
    createdAt: now,
  };

  store.nutritionTarget = nutritionTarget;
  store.dailyPlan = dailyPlan;
  return { nutritionTarget, dailyPlan };
}
