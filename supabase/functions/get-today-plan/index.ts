import { json, requireUser, getServiceClient } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const planDate =
    url.searchParams.get("planDate") ??
    (req.method === "POST"
      ? ((await req.json().catch(() => ({}))) as { planDate?: string }).planDate
      : undefined) ??
    new Date().toISOString().slice(0, 10);

  const service = getServiceClient();
  const { data: planRow, error: planError } = await service
    .from("daily_plans")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("plan_date", planDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError) {
    return json({ error: planError.message }, 400);
  }
  if (!planRow) {
    return json({ dailyPlan: null });
  }

  const { data: meals, error: mealsError } = await service
    .from("meal_instances")
    .select("*, recipes(recipe_key, name)")
    .eq("daily_plan_id", planRow.id)
    .order("created_at", { ascending: true });
  if (mealsError) {
    return json({ error: mealsError.message }, 400);
  }

  const { data: targetRow } = await service
    .from("nutrition_targets")
    .select("*")
    .eq("id", planRow.nutrition_target_id)
    .maybeSingle();

  return json({
    nutritionTarget: targetRow
      ? {
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
        }
      : null,
    dailyPlan: {
      id: planRow.id,
      userId: planRow.user_id,
      nutritionTargetId: planRow.nutrition_target_id,
      planDate: planRow.plan_date,
      plannedCalories: planRow.planned_calories,
      plannedProteinG: Number(planRow.planned_protein_g),
      createdAt: planRow.created_at,
      meals: (meals ?? []).map((meal) => ({
        id: meal.id,
        dailyPlanId: meal.daily_plan_id,
        recipeId: meal.recipe_id,
        recipeKey: meal.recipes?.recipe_key ?? "",
        recipeName: meal.recipes?.name ?? "",
        mealType: meal.meal_type,
        portionMultiplier: Number(meal.portion_multiplier),
        plannedCalories: meal.planned_calories,
        plannedProteinG: Number(meal.planned_protein_g),
        plannedCarbsG: Number(meal.planned_carbs_g),
        plannedFatG: Number(meal.planned_fat_g),
        ingredientSnapshot: meal.ingredient_snapshot,
        createdAt: meal.created_at,
      })),
    },
  });
});
