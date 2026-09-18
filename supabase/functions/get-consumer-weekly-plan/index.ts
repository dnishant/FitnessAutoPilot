import { json, requireUser, getServiceClient, serveWithCors } from "../_shared/http.ts";
import { ConsumerWeeklyPlanSchema } from "../_shared/contracts/consumer-plan.ts";

/**
 * Load the latest ready ConsumerWeeklyPlan for the authenticated user.
 * Optional body/query: { weekStart?: "YYYY-MM-DD" } to prefer a specific week.
 */
serveWithCors(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  let weekStart: string | undefined;
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body === "object" && typeof (body as { weekStart?: unknown }).weekStart === "string") {
      weekStart = (body as { weekStart: string }).weekStart;
    }
  } else {
    const url = new URL(req.url);
    weekStart = url.searchParams.get("weekStart") ?? undefined;
  }

  const service = getServiceClient();
  let query = service
    .from("consumer_weekly_plans")
    .select("id, generated_plan_id, week_start, week_end, status, plan_json, created_at")
    .eq("user_id", auth.user.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(1);

  if (weekStart) {
    query = query.eq("week_start", weekStart);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    return json({ error: error.message }, 400);
  }
  if (!data) {
    return json({ ok: true, plan: null });
  }

  const parsed = ConsumerWeeklyPlanSchema.safeParse(data.plan_json);
  if (!parsed.success) {
    return json(
      {
        error: "Stored weekly plan failed schema validation.",
        details: parsed.error.flatten(),
      },
      500,
    );
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
    plan: parsed.data,
  });
});
