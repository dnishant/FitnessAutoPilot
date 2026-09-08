import type { Goal, ProfileBasics, RmrEstimate, TdeeEstimate } from "@fitness-autopilot/contracts";

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
