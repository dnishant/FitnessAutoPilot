import { json, requireUser, getServiceClient } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const service = getServiceClient();
  const now = new Date().toISOString();

  await service
    .from("goals")
    .update({ status: "superseded", updated_at: now })
    .eq("user_id", auth.user.id)
    .eq("status", "active");

  const { data, error } = await service
    .from("goals")
    .insert({
      user_id: auth.user.id,
      goal_type: body.goalType,
      start_date: body.startDate,
      target_weight_kg: body.targetWeightKg ?? null,
      target_date: body.targetDate ?? null,
      desired_rate_kg_per_week: body.desiredRateKgPerWeek ?? null,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({
    id: data.id,
    userId: data.user_id,
    goalType: data.goal_type,
    startDate: data.start_date,
    targetWeightKg: data.target_weight_kg ?? undefined,
    targetDate: data.target_date ?? undefined,
    desiredRateKgPerWeek: data.desired_rate_kg_per_week ?? undefined,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  });
});
