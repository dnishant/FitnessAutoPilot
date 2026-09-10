import { json, requireUser, getServiceClient } from "../_shared/http.ts";
import {
  createCookingPreferencesDraft,
  cookingPreferenceDbColumns,
  validateCookingPreferences,
} from "../_shared/domain/nutrition/cooking-preferences.ts";

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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const validated = validateCookingPreferences(createCookingPreferencesDraft(body));
  if (!validated.ok) {
    return json({ error: validated.error.message }, 422);
  }

  const service = getServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("user_profiles")
    .update(cookingPreferenceDbColumns(validated.value, now))
    .eq("user_id", auth.user.id)
    .select()
    .single();
  if (error || !data) {
    return json({ error: error?.message ?? "Failed to save cooking preferences" }, 400);
  }

  return json({ cookingPreferences: mapCookingPreferences(data) });
});
