import { json, requireUser, getServiceClient, serveWithCors } from "../_shared/http.ts";

serveWithCors(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json();
  const service = getServiceClient();
  const row: Record<string, unknown> = {
    user_id: auth.user.id,
    date_of_birth: body.dateOfBirth,
    biological_sex: body.biologicalSex,
    height_cm: body.heightCm,
    weight_kg: body.weightKg,
  };

  if (body.fitnessExperience !== undefined) row.fitness_experience = body.fitnessExperience;
  if (body.dietaryPreference !== undefined) row.dietary_preference = body.dietaryPreference;
  if (body.cuisinePreferences !== undefined) row.cuisine_preferences = body.cuisinePreferences;
  if (body.proteinPreferences !== undefined) row.protein_preferences = body.proteinPreferences;
  if (body.allergies !== undefined) row.allergies = body.allergies;
  if (body.dietaryRestrictions !== undefined) row.dietary_restrictions = body.dietaryRestrictions;
  if (body.dislikedFoods !== undefined) row.disliked_foods = body.dislikedFoods;
  if (body.preferredFoods !== undefined) row.preferred_foods = body.preferredFoods;
  if (body.experiencePreferences !== undefined) {
    row.experience_preferences = body.experiencePreferences;
  }
  if (body.varietyLevel !== undefined) row.variety_level = body.varietyLevel;
  if (body.typicalEatingHabits !== undefined) {
    row.typical_eating_habits = body.typicalEatingHabits ?? null;
  }
  if (body.mealPrepAvailability !== undefined) {
    row.meal_prep_availability = body.mealPrepAvailability;
  }
  if (body.cookingSkill !== undefined) row.cooking_skill = body.cookingSkill;
  if (body.cookingEquipment !== undefined) row.cooking_equipment = body.cookingEquipment;
  if (body.maxMealPrepMinutes !== undefined) {
    row.max_meal_prep_minutes = body.maxMealPrepMinutes;
  }
  if (body.safetyRestrictions !== undefined) {
    row.safety_restrictions = body.safetyRestrictions;
  }

  const { data, error } = await service.from("user_profiles").upsert(row).select().single();
  if (error) {
    return json({ error: error.message }, 400);
  }
  return json({ profile: data });
});
