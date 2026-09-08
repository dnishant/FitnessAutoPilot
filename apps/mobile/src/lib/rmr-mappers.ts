import type {
  CalorieTarget,
  Goal,
  NutritionTarget,
  ProfileBasics,
  RmrEstimate,
  TdeeEstimate,
} from "@fitness-autopilot/contracts";

export function mapProfileRow(row: Record<string, unknown>): ProfileBasics {
  return {
    userId: String(row.user_id ?? row.userId),
    dateOfBirth: String(row.date_of_birth ?? row.dateOfBirth).slice(0, 10),
    biologicalSex: (row.biological_sex ?? row.biologicalSex) as ProfileBasics["biologicalSex"],
    heightCm: Number(row.height_cm ?? row.heightCm),
    weightKg: Number(row.weight_kg ?? row.weightKg),
  };
}

export function mapRmrRow(row: Record<string, unknown>): RmrEstimate {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.userId),
    rmrKcal: Number(row.rmr_kcal ?? row.rmrKcal),
    source: (row.source ?? "estimated_mifflin_st_jeor") as RmrEstimate["source"],
    algorithmName: (row.algorithm_name ?? row.algorithmName ?? null) as RmrEstimate["algorithmName"],
    algorithmVersion: (row.algorithm_version ??
      row.algorithmVersion ??
      null) as RmrEstimate["algorithmVersion"],
    inputSnapshot: (row.input_snapshot ?? row.inputSnapshot ?? null) as RmrEstimate["inputSnapshot"],
    reportedOrMeasuredAt: row.reported_or_measured_at
      ? String(row.reported_or_measured_at).slice(0, 10)
      : row.reportedOrMeasuredAt
        ? String(row.reportedOrMeasuredAt).slice(0, 10)
        : null,
    calculatedAt: String(row.calculated_at ?? row.calculatedAt),
    createdAt: String(row.created_at ?? row.createdAt),
  };
}

export function mapTdeeRow(row: Record<string, unknown>): TdeeEstimate {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.userId),
    tdeeKcal: Number(row.tdee_kcal ?? row.tdeeKcal),
    source: (row.source ?? "apple_watch_active_plus_rmr") as TdeeEstimate["source"],
    wearable: (row.wearable ?? "apple_watch") as TdeeEstimate["wearable"],
    wearableCaloriesKcal: Number(row.wearable_calories_kcal ?? row.wearableCaloriesKcal),
    rmrKcalUsed:
      row.rmr_kcal_used == null && row.rmrKcalUsed == null
        ? null
        : Number(row.rmr_kcal_used ?? row.rmrKcalUsed),
    algorithmName: (row.algorithm_name ?? row.algorithmName ?? null) as TdeeEstimate["algorithmName"],
    algorithmVersion: (row.algorithm_version ??
      row.algorithmVersion ??
      null) as TdeeEstimate["algorithmVersion"],
    inputSnapshot: (row.input_snapshot ?? row.inputSnapshot) as TdeeEstimate["inputSnapshot"],
    calculatedAt: String(row.calculated_at ?? row.calculatedAt),
    createdAt: String(row.created_at ?? row.createdAt),
  };
}

export function mapGoalRow(row: Record<string, unknown>): Goal {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.userId),
    goalType: (row.goal_type ?? row.goalType) as Goal["goalType"],
    startDate: String(row.start_date ?? row.startDate).slice(0, 10),
    targetWeightKg:
      row.target_weight_kg == null && row.targetWeightKg == null
        ? undefined
        : Number(row.target_weight_kg ?? row.targetWeightKg),
    targetDate: row.target_date
      ? String(row.target_date).slice(0, 10)
      : row.targetDate
        ? String(row.targetDate).slice(0, 10)
        : undefined,
    desiredRateKgPerWeek:
      row.desired_rate_kg_per_week == null && row.desiredRateKgPerWeek == null
        ? undefined
        : Number(row.desired_rate_kg_per_week ?? row.desiredRateKgPerWeek),
    status: (row.status ?? "active") as Goal["status"],
    createdAt: String(row.created_at ?? row.createdAt),
    updatedAt: String(row.updated_at ?? row.updatedAt),
  };
}

export function mapCalorieTargetRow(row: Record<string, unknown>): CalorieTarget {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.userId),
    goalId: String(row.goal_id ?? row.goalId),
    tdeeEstimateId: String(row.tdee_estimate_id ?? row.tdeeEstimateId),
    tdeeKcal: Number(row.tdee_kcal ?? row.tdeeKcal),
    bodyWeightKg: Number(row.body_weight_kg ?? row.bodyWeightKg),
    bodyWeightLb: Number(row.body_weight_lb ?? row.bodyWeightLb),
    pace: (row.pace ?? "recommended") as CalorieTarget["pace"],
    targetRatePerWeek: Number(row.target_rate_per_week ?? row.targetRatePerWeek),
    targetLbPerWeek: Number(row.target_lb_per_week ?? row.targetLbPerWeek),
    weeklyCalorieAdjustment: Number(
      row.weekly_calorie_adjustment ?? row.weeklyCalorieAdjustment,
    ),
    dailyCalorieAdjustment: Number(
      row.daily_calorie_adjustment ?? row.dailyCalorieAdjustment,
    ),
    targetCalories: Number(row.target_calories ?? row.targetCalories),
    policyName: (row.policy_name ?? row.policyName ?? "weight-change-policy") as CalorieTarget["policyName"],
    policyVersion: (row.policy_version ??
      row.policyVersion ??
      "weight-change-policy-v1") as CalorieTarget["policyVersion"],
    inputSnapshot: (row.input_snapshot ?? row.inputSnapshot) as CalorieTarget["inputSnapshot"],
    createdAt: String(row.created_at ?? row.createdAt),
  };
}

export function mapNutritionTargetRow(row: Record<string, unknown>): NutritionTarget {
  const fatG = Number(row.fat_g ?? row.fatG ?? row.fat_min_g ?? row.fatMinG);
  return {
    id: String(row.id),
    userId: String(row.user_id ?? row.userId),
    goalId: String(row.goal_id ?? row.goalId),
    calorieTargetId: row.calorie_target_id
      ? String(row.calorie_target_id)
      : row.calorieTargetId
        ? String(row.calorieTargetId)
        : undefined,
    estimatedMaintenanceCalories: Number(
      row.estimated_maintenance_calories ?? row.estimatedMaintenanceCalories,
    ),
    targetCalories: Number(row.target_calories ?? row.targetCalories),
    proteinG: Number(row.protein_g ?? row.proteinG),
    fatG,
    fatMinG: Number(row.fat_min_g ?? row.fatMinG),
    fatMaxG: Number(row.fat_max_g ?? row.fatMaxG),
    carbohydrateG: Number(row.carbohydrate_g ?? row.carbohydrateG),
    desiredRateKgPerWeek: Number(row.desired_rate_kg_per_week ?? row.desiredRateKgPerWeek),
    algorithmName: "nutrition-target",
    algorithmVersion: String(row.algorithm_version ?? row.algorithmVersion),
    macroPolicyName: (row.macro_policy_name ?? row.macroPolicyName) as NutritionTarget["macroPolicyName"],
    macroPolicyVersion: (row.macro_policy_version ??
      row.macroPolicyVersion) as NutritionTarget["macroPolicyVersion"],
    inputSnapshot: (row.input_snapshot ?? row.inputSnapshot ?? {}) as NutritionTarget["inputSnapshot"],
    validFrom: String(row.valid_from ?? row.validFrom),
    createdAt: String(row.created_at ?? row.createdAt),
  };
}
