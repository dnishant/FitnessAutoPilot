import { json, requireUser, getServiceClient } from "../_shared/http.ts";
import { completeOnboarding } from "../_shared/domain/nutrition/onboarding-flow.ts";
import { nutritionTargetPersistFields } from "../_shared/domain/nutrition/macros.ts";
import { cookingPreferenceDbColumns } from "../_shared/domain/nutrition/cooking-preferences.ts";
import { mealPreferenceDbColumns } from "../_shared/domain/nutrition/meal-preferences.ts";
import { lbToKg } from "../_shared/domain/common/units.ts";

function mapRmr(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    rmrKcal: Number(row.rmr_kcal),
    source: row.source,
    algorithmName: row.algorithm_name,
    algorithmVersion: row.algorithm_version,
    inputSnapshot: row.input_snapshot,
    reportedOrMeasuredAt: row.reported_or_measured_at
      ? String(row.reported_or_measured_at).slice(0, 10)
      : null,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
  };
}

function mapTdee(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    tdeeKcal: Number(row.tdee_kcal),
    source: row.source,
    wearable: row.wearable,
    wearableCaloriesKcal: Number(row.wearable_calories_kcal),
    rmrKcalUsed: row.rmr_kcal_used == null ? null : Number(row.rmr_kcal_used),
    algorithmName: row.algorithm_name,
    algorithmVersion: row.algorithm_version,
    inputSnapshot: row.input_snapshot,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
  };
}

function mapProfile(row: Record<string, unknown>) {
  return {
    userId: row.user_id,
    dateOfBirth: String(row.date_of_birth).slice(0, 10),
    biologicalSex: row.biological_sex,
    heightCm: Number(row.height_cm),
    weightKg: Number(row.weight_kg),
  };
}

function mapCalorieTarget(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    tdeeEstimateId: row.tdee_estimate_id,
    tdeeKcal: Number(row.tdee_kcal),
    bodyWeightKg: Number(row.body_weight_kg),
    bodyWeightLb: Number(row.body_weight_lb),
    pace: row.pace,
    targetRatePerWeek: Number(row.target_rate_per_week),
    targetLbPerWeek: Number(row.target_lb_per_week),
    weeklyCalorieAdjustment: Number(row.weekly_calorie_adjustment),
    dailyCalorieAdjustment: Number(row.daily_calorie_adjustment),
    targetCalories: Number(row.target_calories),
    policyName: row.policy_name,
    policyVersion: row.policy_version,
    inputSnapshot: row.input_snapshot,
    createdAt: row.created_at,
  };
}

function mapNutritionTarget(row: Record<string, unknown>) {
  const fatG = Number(row.fat_g ?? row.fat_min_g);
  return {
    id: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    calorieTargetId: row.calorie_target_id ?? undefined,
    estimatedMaintenanceCalories: Number(row.estimated_maintenance_calories),
    targetCalories: Number(row.target_calories),
    proteinG: Number(row.protein_g),
    fatG,
    fatMinG: Number(row.fat_min_g),
    fatMaxG: Number(row.fat_max_g),
    carbohydrateG: Number(row.carbohydrate_g),
    desiredRateKgPerWeek: Number(row.desired_rate_kg_per_week),
    algorithmName: row.algorithm_name,
    algorithmVersion: row.algorithm_version,
    macroPolicyName: row.macro_policy_name ?? undefined,
    macroPolicyVersion: row.macro_policy_version ?? undefined,
    inputSnapshot: row.input_snapshot,
    validFrom: row.valid_from,
    createdAt: row.created_at,
  };
}

function mapCookingPreferences(row: Record<string, unknown>) {
  return {
    userId: row.user_id,
    prepFrequency: row.prep_frequency,
    maxPrepSessionMinutes: row.max_prep_session_minutes ?? null,
    cookingStyle: row.cooking_style,
    maxFinishMinutes: row.max_finish_minutes,
    useDinnerPrepForNextLunch: row.use_dinner_prep_for_next_lunch,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMealPreferences(row: Record<string, unknown>) {
  return {
    userId: row.user_id,
    cuisines: row.cuisine_preferences ?? [],
    proteinPreferences: row.protein_preferences ?? [],
    allergies: row.allergies ?? [],
    dietaryRestrictions: row.dietary_restrictions ?? [],
    dislikes: row.disliked_foods ?? [],
    experiencePreferences: row.experience_preferences ?? [],
    varietyLevel: row.variety_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGoal(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    goalType: row.goal_type,
    startDate: String(row.start_date).slice(0, 10),
    targetWeightKg: row.target_weight_kg ?? undefined,
    targetDate: row.target_date ? String(row.target_date).slice(0, 10) : undefined,
    desiredRateKgPerWeek: row.desired_rate_kg_per_week ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const completed = completeOnboarding({
    dateOfBirth: String(body.dateOfBirth ?? ""),
    biologicalSex: body.biologicalSex,
    heightCm: Number(body.heightCm),
    weightKg: Number(body.weightKg),
    source: body.source,
    reportedRmrKcal: body.reportedRmrKcal,
    reportDate: body.reportDate,
    goalType: body.goalType,
    wearable: body.wearable,
    wearableCaloriesKcal: Number(body.wearableCaloriesKcal),
    pace: body.pace,
    mealPreferences: body.mealPreferences,
    cookingPreferences: body.cookingPreferences,
    asOf: new Date(),
  });

  if (!completed.ok) {
    return json({ error: completed.error.message }, 422);
  }

  const service = getServiceClient();
  const now = new Date().toISOString();
  const preferenceColumns = {
    ...mealPreferenceDbColumns(completed.value.mealPreferences, now),
    ...cookingPreferenceDbColumns(completed.value.cookingPreferences, now),
  };
  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .upsert({
      user_id: auth.user.id,
      date_of_birth: completed.value.profile.dateOfBirth,
      biological_sex: completed.value.profile.biologicalSex,
      height_cm: completed.value.profile.heightCm,
      weight_kg: completed.value.profile.weightKg,
      ...preferenceColumns,
    })
    .select()
    .single();
  if (profileError || !profile) {
    return json({ error: profileError?.message ?? "Failed to save profile" }, 400);
  }

  const { data: rmr, error: rmrError } = await service
    .from("rmr_estimates")
    .insert({
      user_id: auth.user.id,
      rmr_kcal: completed.value.rmr.rmrKcal,
      source: completed.value.rmr.source,
      algorithm_name: completed.value.rmr.algorithmName,
      algorithm_version: completed.value.rmr.algorithmVersion,
      input_snapshot: completed.value.rmr.inputSnapshot,
      reported_or_measured_at: completed.value.rmr.reportedOrMeasuredAt,
      calculated_at: completed.value.rmr.calculatedAt,
    })
    .select()
    .single();
  if (rmrError || !rmr) {
    return json({ error: rmrError?.message ?? "Failed to save RMR" }, 400);
  }

  await service
    .from("goals")
    .update({ status: "superseded", updated_at: now })
    .eq("user_id", auth.user.id)
    .eq("status", "active");

  const { data: goal, error: goalError } = await service
    .from("goals")
    .insert({
      user_id: auth.user.id,
      goal_type: completed.value.goalType,
      start_date: completed.value.rmr.calculatedAt.slice(0, 10),
      status: "active",
    })
    .select()
    .single();
  if (goalError || !goal) {
    return json({ error: goalError?.message ?? "Failed to save goal" }, 400);
  }

  const { data: tdee, error: tdeeError } = await service
    .from("tdee_estimates")
    .insert({
      user_id: auth.user.id,
      tdee_kcal: completed.value.tdee.tdeeKcal,
      source: completed.value.tdee.source,
      wearable: completed.value.tdee.wearable,
      wearable_calories_kcal: completed.value.tdee.wearableCaloriesKcal,
      rmr_kcal_used: completed.value.tdee.rmrKcalUsed,
      algorithm_name: completed.value.tdee.algorithmName,
      algorithm_version: completed.value.tdee.algorithmVersion,
      input_snapshot: completed.value.tdee.inputSnapshot,
      calculated_at: completed.value.tdee.calculatedAt,
    })
    .select()
    .single();
  if (tdeeError || !tdee) {
    return json({ error: tdeeError?.message ?? "Failed to save TDEE" }, 400);
  }

  const { data: calorieTarget, error: calorieError } = await service
    .from("calorie_targets")
    .insert({
      user_id: auth.user.id,
      goal_id: goal.id,
      tdee_estimate_id: tdee.id,
      tdee_kcal: completed.value.calorieTarget.tdeeKcal,
      body_weight_kg: completed.value.calorieTarget.bodyWeightKg,
      body_weight_lb: completed.value.calorieTarget.bodyWeightLb,
      pace: completed.value.calorieTarget.pace,
      target_rate_per_week: completed.value.calorieTarget.targetRatePerWeek,
      target_lb_per_week: completed.value.calorieTarget.targetLbPerWeek,
      weekly_calorie_adjustment: completed.value.calorieTarget.weeklyCalorieAdjustment,
      daily_calorie_adjustment: completed.value.calorieTarget.dailyCalorieAdjustment,
      target_calories: completed.value.calorieTarget.targetCalories,
      policy_name: completed.value.calorieTarget.policyName,
      policy_version: completed.value.calorieTarget.policyVersion,
      input_snapshot: completed.value.calorieTarget.inputSnapshot,
    })
    .select()
    .single();
  if (calorieError || !calorieTarget) {
    return json({ error: calorieError?.message ?? "Failed to save calorie target" }, 400);
  }

  const nutritionFields = nutritionTargetPersistFields({
    macros: completed.value.nutritionTarget,
    tdeeKcal: completed.value.calorieTarget.tdeeKcal,
    desiredRateKgPerWeek: lbToKg(completed.value.calorieTarget.targetLbPerWeek),
  });
  const { data: nutritionTarget, error: nutritionError } = await service
    .from("nutrition_targets")
    .insert({
      user_id: auth.user.id,
      goal_id: goal.id,
      calorie_target_id: calorieTarget.id,
      estimated_maintenance_calories: nutritionFields.estimatedMaintenanceCalories,
      target_calories: nutritionFields.targetCalories,
      protein_g: nutritionFields.proteinG,
      fat_g: nutritionFields.fatG,
      fat_min_g: nutritionFields.fatMinG,
      fat_max_g: nutritionFields.fatMaxG,
      carbohydrate_g: nutritionFields.carbohydrateG,
      desired_rate_kg_per_week: nutritionFields.desiredRateKgPerWeek,
      algorithm_name: nutritionFields.algorithmName,
      algorithm_version: nutritionFields.algorithmVersion,
      macro_policy_name: nutritionFields.macroPolicyName,
      macro_policy_version: nutritionFields.macroPolicyVersion,
      input_snapshot: nutritionFields.inputSnapshot,
      valid_from: completed.value.nutritionTarget.createdAt,
    })
    .select()
    .single();
  if (nutritionError || !nutritionTarget) {
    return json({ error: nutritionError?.message ?? "Failed to save nutrition target" }, 400);
  }

  return json({
    profile: mapProfile(profile),
    rmr: mapRmr(rmr),
    tdee: mapTdee(tdee),
    goal: mapGoal(goal),
    calorieTarget: mapCalorieTarget(calorieTarget),
    nutritionTarget: mapNutritionTarget(nutritionTarget),
    mealPreferences: mapMealPreferences(profile),
    cookingPreferences: mapCookingPreferences(profile),
  });
});
