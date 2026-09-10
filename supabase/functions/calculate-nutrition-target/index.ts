import { json, requireUser, getServiceClient, serveWithCors } from "../_shared/http.ts";
import { calculateNutritionTarget } from "../_shared/domain/nutrition/target.ts";

function mapProfile(row: Record<string, unknown>) {
  return {
    userId: row.user_id as string,
    dateOfBirth: String(row.date_of_birth).slice(0, 10),
    biologicalSex: row.biological_sex,
    heightCm: Number(row.height_cm),
    weightKg: Number(row.weight_kg),
    fitnessExperience: row.fitness_experience,
    dietaryPreference: row.dietary_preference,
    cuisinePreferences: row.cuisine_preferences ?? [],
    allergies: row.allergies ?? [],
    dislikedFoods: row.disliked_foods ?? [],
    preferredFoods: row.preferred_foods ?? [],
    typicalEatingHabits: row.typical_eating_habits ?? undefined,
    mealPrepAvailability: row.meal_prep_availability,
    cookingSkill: row.cooking_skill,
    cookingEquipment: row.cooking_equipment ?? [],
    maxMealPrepMinutes: Number(row.max_meal_prep_minutes),
    safetyRestrictions: row.safety_restrictions ?? [],
  };
}

serveWithCors(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const service = getServiceClient();
  const { data: profileRow, error: profileError } = await service
    .from("user_profiles")
    .select("*")
    .eq("user_id", auth.user.id)
    .single();
  if (profileError || !profileRow) {
    return json({ error: profileError?.message ?? "Profile required" }, 400);
  }

  const { data: goalRow, error: goalError } = await service
    .from("goals")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (goalError || !goalRow) {
    return json({ error: goalError?.message ?? "Active goal required" }, 400);
  }

  const calculated = calculateNutritionTarget(mapProfile(profileRow) as never, {
    id: goalRow.id,
    goalType: goalRow.goal_type,
    desiredRateKgPerWeek: goalRow.desired_rate_kg_per_week ?? undefined,
  });
  if (!calculated.ok) {
    return json({ error: calculated.error }, 422);
  }

  const now = new Date().toISOString();
  const { data, error } = await service
    .from("nutrition_targets")
    .insert({
      user_id: auth.user.id,
      goal_id: goalRow.id,
      estimated_maintenance_calories: calculated.value.estimatedMaintenanceCalories,
      target_calories: calculated.value.targetCalories,
      protein_g: calculated.value.proteinG,
      fat_min_g: calculated.value.fatMinG,
      fat_max_g: calculated.value.fatMaxG,
      carbohydrate_g: calculated.value.carbohydrateG,
      desired_rate_kg_per_week: calculated.value.desiredRateKgPerWeek,
      algorithm_name: calculated.value.algorithmName,
      algorithm_version: calculated.value.algorithmVersion,
      input_snapshot: calculated.value.inputSnapshot,
      valid_from: now,
    })
    .select()
    .single();

  if (error) {
    return json({ error: error.message }, 400);
  }

  return json({
    id: data.id,
    userId: data.user_id,
    goalId: data.goal_id,
    estimatedMaintenanceCalories: data.estimated_maintenance_calories,
    targetCalories: data.target_calories,
    proteinG: Number(data.protein_g),
    fatMinG: Number(data.fat_min_g),
    fatMaxG: Number(data.fat_max_g),
    carbohydrateG: Number(data.carbohydrate_g),
    desiredRateKgPerWeek: Number(data.desired_rate_kg_per_week),
    algorithmName: data.algorithm_name,
    algorithmVersion: data.algorithm_version,
    inputSnapshot: data.input_snapshot,
    validFrom: data.valid_from,
    createdAt: data.created_at,
  });
});
