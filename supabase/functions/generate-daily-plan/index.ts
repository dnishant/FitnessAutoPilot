import { json, requireUser, getServiceClient } from "../_shared/http.ts";
import { calculateNutritionTarget } from "../_shared/domain/nutrition/target.ts";
import { planOneDay } from "../_shared/domain/planning/planner.ts";

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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const planDate = (body.planDate as string | undefined) ?? new Date().toISOString().slice(0, 10);
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

  const profile = mapProfile(profileRow);
  const calculated = calculateNutritionTarget(profile as never, {
    id: goalRow.id,
    goalType: goalRow.goal_type,
    desiredRateKgPerWeek: goalRow.desired_rate_kg_per_week ?? undefined,
  });
  if (!calculated.ok) {
    return json({ error: calculated.error }, 422);
  }

  const now = new Date().toISOString();
  const { data: targetRow, error: targetError } = await service
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
  if (targetError || !targetRow) {
    return json({ error: targetError?.message ?? "Failed to persist nutrition target" }, 400);
  }

  const { data: foods, error: foodsError } = await service.from("foods").select("*");
  if (foodsError) {
    return json({ error: foodsError.message }, 500);
  }
  const { data: recipes, error: recipesError } = await service
    .from("recipes")
    .select("*")
    .eq("status", "active");
  if (recipesError) {
    return json({ error: recipesError.message }, 500);
  }
  const { data: ingredients, error: ingredientsError } = await service
    .from("recipe_ingredients")
    .select("*");
  if (ingredientsError) {
    return json({ error: ingredientsError.message }, 500);
  }

  const foodsById = new Map(
    (foods ?? []).map((f) => [
      f.id as string,
      {
        id: f.id,
        name: f.name,
        brand: f.brand,
        source: f.source,
        sourceFoodId: f.source_food_id,
        caloriesPer100g: Number(f.calories_per_100g),
        proteinGPer100g: Number(f.protein_g_per_100g),
        carbsGPer100g: Number(f.carbs_g_per_100g),
        fatGPer100g: Number(f.fat_g_per_100g),
        dietaryTags: f.dietary_tags ?? [],
        allergenTags: f.allergen_tags ?? [],
      },
    ]),
  );

  const catalog = (recipes ?? []).map((recipe) => ({
    recipe: {
      id: recipe.id,
      recipeKey: recipe.recipe_key,
      version: recipe.version,
      name: recipe.name,
      description: recipe.description,
      mealTypes: recipe.meal_types,
      cuisineTags: recipe.cuisine_tags ?? [],
      dietaryTags: recipe.dietary_tags ?? [],
      baseServings: Number(recipe.base_servings),
      prepMinutes: recipe.prep_minutes,
      cookMinutes: recipe.cook_minutes,
      instructions: recipe.instructions,
      cookingEquipment: recipe.cooking_equipment ?? [],
      storageInstructions: recipe.storage_instructions ?? undefined,
      reheatingInstructions: recipe.reheating_instructions ?? undefined,
      status: recipe.status,
      createdAt: recipe.created_at,
    },
    ingredients: (ingredients ?? [])
      .filter((ing) => ing.recipe_id === recipe.id)
      .map((ing) => ({
        id: ing.id,
        recipeId: ing.recipe_id,
        foodId: ing.food_id,
        baseQuantityG: Number(ing.base_quantity_g),
        role: ing.role,
        scalable: ing.scalable,
        minMultiplier: ing.min_multiplier != null ? Number(ing.min_multiplier) : undefined,
        maxMultiplier: ing.max_multiplier != null ? Number(ing.max_multiplier) : undefined,
        preparationNote: ing.preparation_note ?? undefined,
        sortOrder: ing.sort_order,
      })),
  }));

  const planned = planOneDay({
    profile: profile as never,
    nutritionTarget: calculated.value,
    catalog: catalog as never,
    foodsById: foodsById as never,
  });
  if (!planned.ok) {
    return json({ error: planned.error }, 422);
  }

  const { data: planRow, error: planError } = await service
    .from("daily_plans")
    .insert({
      user_id: auth.user.id,
      nutrition_target_id: targetRow.id,
      plan_date: planDate,
      planned_calories: planned.value.plannedCalories,
      planned_protein_g: planned.value.plannedProteinG,
    })
    .select()
    .single();
  if (planError || !planRow) {
    return json({ error: planError?.message ?? "Failed to persist daily plan" }, 400);
  }

  const mealRows = planned.value.meals.map((meal) => ({
    daily_plan_id: planRow.id,
    user_id: auth.user.id,
    recipe_id: meal.portioned.recipe.id,
    meal_type: meal.mealType,
    portion_multiplier: 1,
    planned_calories: meal.portioned.nutrition.caloriesKcal,
    planned_protein_g: meal.portioned.nutrition.proteinG,
    planned_carbs_g: meal.portioned.nutrition.carbsG,
    planned_fat_g: meal.portioned.nutrition.fatG,
    ingredient_snapshot: meal.portioned.lines.map((line) => ({
      recipeIngredientId: line.recipeIngredientId,
      foodId: line.foodId,
      foodName: line.foodName,
      role: line.role,
      quantityG: line.quantityG,
      nutrition: line.nutrition,
    })),
  }));

  const { data: insertedMeals, error: mealsError } = await service
    .from("meal_instances")
    .insert(mealRows)
    .select();
  if (mealsError) {
    return json({ error: mealsError.message }, 400);
  }

  const nutritionTarget = {
    id: targetRow.id,
    userId: targetRow.user_id,
    goalId: targetRow.goal_id,
    estimatedMaintenanceCalories: targetRow.estimated_maintenance_calories,
    targetCalories: targetRow.target_calories,
    proteinG: Number(targetRow.protein_g),
    fatMinG: Number(targetRow.fat_min_g),
    fatMaxG: Number(targetRow.fat_max_g),
    carbohydrateG: Number(targetRow.carbohydrate_g),
    desiredRateKgPerWeek: Number(targetRow.desired_rate_kg_per_week),
    algorithmName: targetRow.algorithm_name,
    algorithmVersion: targetRow.algorithm_version,
    inputSnapshot: targetRow.input_snapshot,
    validFrom: targetRow.valid_from,
    createdAt: targetRow.created_at,
  };

  const dailyPlan = {
    id: planRow.id,
    userId: planRow.user_id,
    nutritionTargetId: planRow.nutrition_target_id,
    planDate: planRow.plan_date,
    plannedCalories: planRow.planned_calories,
    plannedProteinG: Number(planRow.planned_protein_g),
    createdAt: planRow.created_at,
    meals: (insertedMeals ?? []).map((meal) => {
      const matched = planned.value.meals.find((m) => m.mealType === meal.meal_type);
      return {
        id: meal.id,
        dailyPlanId: meal.daily_plan_id,
        recipeId: meal.recipe_id,
        recipeKey: matched?.portioned.recipe.recipeKey ?? "",
        recipeName: matched?.portioned.recipe.name ?? "",
        mealType: meal.meal_type,
        portionMultiplier: Number(meal.portion_multiplier),
        plannedCalories: meal.planned_calories,
        plannedProteinG: Number(meal.planned_protein_g),
        plannedCarbsG: Number(meal.planned_carbs_g),
        plannedFatG: Number(meal.planned_fat_g),
        ingredientSnapshot: meal.ingredient_snapshot,
        createdAt: meal.created_at,
      };
    }),
  };

  return json({ nutritionTarget, dailyPlan });
});
