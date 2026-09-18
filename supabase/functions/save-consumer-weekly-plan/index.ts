import { json, requireUser, getServiceClient, serveWithCors } from "../_shared/http.ts";
import { ConsumerWeeklyPlanSchema } from "../_shared/contracts/consumer-plan.ts";

/**
 * Persist a completed ConsumerWeeklyPlan for the authenticated user.
 * Append-only — each generation inserts a new historical row.
 */
serveWithCors(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const planRaw =
    body && typeof body === "object" && "plan" in (body as Record<string, unknown>)
      ? (body as { plan: unknown }).plan
      : body;

  const parsed = ConsumerWeeklyPlanSchema.safeParse(planRaw);
  if (!parsed.success) {
    return json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid consumer weekly plan.",
        details: parsed.error.flatten(),
      },
      422,
    );
  }

  const plan = parsed.data;
  if (plan.status !== "ready" && plan.status !== "failed") {
    return json(
      { error: "Only ready or failed weekly plans may be persisted." },
      422,
    );
  }

  const generatedPlanId = plan.generatedPlanId;
  if (!generatedPlanId) {
    return json({ error: "generatedPlanId is required to persist a weekly plan." }, 422);
  }

  const service = getServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await service
    .from("consumer_weekly_plans")
    .upsert(
      {
        user_id: auth.user.id,
        generated_plan_id: generatedPlanId,
        week_start: plan.weekStart,
        week_end: plan.weekEnd,
        status: plan.status,
        plan_json: plan,
        updated_at: now,
      },
      { onConflict: "user_id,generated_plan_id" },
    )
    .select("id, generated_plan_id, week_start, week_end, status, created_at")
    .single();

  if (error || !data) {
    return json({ error: error?.message ?? "Failed to save weekly plan." }, 400);
  }

  return json({
    ok: true,
    record: {
      id: data.id,
      generatedPlanId: data.generated_plan_id,
      weekStart: data.week_start,
      weekEnd: data.week_end,
      status: data.status,
      createdAt: data.created_at,
    },
  });
});
