import { json, requireUser, getServiceClient } from "../_shared/http.ts";
import { createMealPreferencesDraft, mealPreferenceDbColumns, validateMealPreferences } from "../_shared/domain/nutrition/meal-preferences.ts";

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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const validated = validateMealPreferences(createMealPreferencesDraft(body));
  if (!validated.ok) {
    return json({ error: validated.error.message }, 422);
  }

  const service = getServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("user_profiles")
    .update(mealPreferenceDbColumns(validated.value, now))
    .eq("user_id", auth.user.id)
    .select()
    .single();
  if (error || !data) {
    return json({ error: error?.message ?? "Failed to save meal preferences" }, 400);
  }

  return json({ mealPreferences: mapMealPreferences(data) });
});
