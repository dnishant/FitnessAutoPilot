import type { ProfileBasics, RmrEstimate } from "@fitness-autopilot/contracts";

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
