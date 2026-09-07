import { json, requireUser, getServiceClient } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const service = getServiceClient();
  const row = {
    user_id: auth.user.id,
    date_of_birth: body.dateOfBirth,
    biological_sex: body.biologicalSex,
    height_cm: body.heightCm,
    weight_kg: body.weightKg,
    fitness_experience: body.fitnessExperience,
    dietary_preference: body.dietaryPreference,
    cuisine_preferences: body.cuisinePreferences ?? [],
    allergies: body.allergies ?? [],
    disliked_foods: body.dislikedFoods ?? [],
    preferred_foods: body.preferredFoods ?? [],
    typical_eating_habits: body.typicalEatingHabits ?? null,
    meal_prep_availability: body.mealPrepAvailability,
    cooking_skill: body.cookingSkill,
    cooking_equipment: body.cookingEquipment ?? [],
    max_meal_prep_minutes: body.maxMealPrepMinutes,
    safety_restrictions: body.safetyRestrictions ?? [],
  };

  const { data, error } = await service.from("user_profiles").upsert(row).select().single();
  if (error) {
    return json({ error: error.message }, 400);
  }
  return json({ profile: data });
});
