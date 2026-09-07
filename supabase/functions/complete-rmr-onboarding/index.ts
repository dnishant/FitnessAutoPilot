import { json, requireUser, getServiceClient } from "../_shared/http.ts";
import { completeOnboarding } from "../_shared/domain/nutrition/onboarding-flow.ts";

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
    asOf: new Date(),
  });

  if (!completed.ok) {
    return json({ error: completed.error.message }, 422);
  }

  const service = getServiceClient();
  const now = new Date().toISOString();
  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .upsert({
      user_id: auth.user.id,
      date_of_birth: completed.value.profile.dateOfBirth,
      biological_sex: completed.value.profile.biologicalSex,
      height_cm: completed.value.profile.heightCm,
      weight_kg: completed.value.profile.weightKg,
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

  return json({
    profile: mapProfile(profile),
    rmr: mapRmr(rmr),
    tdee: mapTdee(tdee),
    goal: mapGoal(goal),
  });
});
