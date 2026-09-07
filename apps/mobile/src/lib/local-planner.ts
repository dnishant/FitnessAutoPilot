import type {
  CreateGoalRequest,
  DailyPlan,
  Goal,
  MealInstance,
  NutritionTarget,
  UserProfile,
} from "@fitness-autopilot/contracts";
import {
  calculateNutritionTarget,
  planOneDay,
  type NutritionTargetCalculation,
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
  profile: UserProfile | null;
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
    goal: null,
    nutritionTarget: null,
    dailyPlan: null,
  };
  memory.set(userId, store);
  return store;
}

export function localSaveProfile(userId: string, profile: UserProfile): UserProfile {
  const store = memory.get(userId);
  if (!store) {
    throw new Error("Local user missing");
  }
  const next = { ...profile, userId };
  store.profile = next;
  return next;
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
  store.dailyPlan = null;
  return goal;
}

export function localGeneratePlan(userId: string, planDate?: string): {
  nutritionTarget: NutritionTarget;
  dailyPlan: DailyPlan;
} {
  const store = memory.get(userId);
  if (!store?.profile || !store.goal) {
    throw new Error("Profile and goal are required before generating a plan.");
  }

  const calculated = calculateNutritionTarget(store.profile, store.goal);
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
    profile: store.profile,
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
