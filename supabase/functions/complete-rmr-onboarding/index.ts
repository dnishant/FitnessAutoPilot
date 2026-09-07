import { json, requireUser, getServiceClient } from "../_shared/http.ts";
import { completeRmrOnboarding } from "../_shared/domain/nutrition/rmr.ts";

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

function mapProfile(row: Record<string, unknown>) {
  return {
    userId: row.user_id,
    dateOfBirth: String(row.date_of_birth).slice(0, 10),
    biologicalSex: row.biological_sex,
    heightCm: Number(row.height_cm),
    weightKg: Number(row.weight_kg),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const completed = completeRmrOnboarding({
    dateOfBirth: String(body.dateOfBirth ?? ""),
    biologicalSex: body.biologicalSex,
    heightCm: Number(body.heightCm),
    weightKg: Number(body.weightKg),
    source: body.source,
    reportedRmrKcal: body.reportedRmrKcal,
    reportDate: body.reportDate,
    asOf: new Date(),
  });

  if (!completed.ok) {
    return json({ error: completed.error.message }, 422);
  }

  const service = getServiceClient();
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

  return json({
    profile: mapProfile(profile),
    rmr: mapRmr(rmr),
  });
});
