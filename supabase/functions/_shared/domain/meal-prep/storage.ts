import type {
  CoreMeal,
  CoreMealRepertoire,
  DayOfWeek,
  FuturePrepAction,
  MealPrepIssue,
  PortionStorageAssignment,
  PrepTask,
  ResolvedRecipe,
  WeeklyCookingRequirement,
} from "../../contracts/index.ts";
import { MEAL_PREP_POLICY } from "./policy.ts";
import { daysBetween, previousDay } from "./weekly-requirements.ts";

export function buildStorageAndFutureActions(input: {
  requirements: WeeklyCookingRequirement[];
  recipesByCandidateId: Record<string, ResolvedRecipe>;
  coreRepertoire?: CoreMealRepertoire;
  prepSessionDay: DayOfWeek;
  tasks: PrepTask[];
}): {
  assignments: PortionStorageAssignment[];
  futureActions: FuturePrepAction[];
  issues: MealPrepIssue[];
} {
  const issues: MealPrepIssue[] = [];
  const assignments: PortionStorageAssignment[] = [];
  const futureActions: FuturePrepAction[] = [];

  const coreById = new Map<string, CoreMeal>();
  for (const c of input.coreRepertoire?.coreMeals ?? []) {
    coreById.set(c.coreMealId, c);
  }

  for (const req of input.requirements) {
    const recipe = input.recipesByCandidateId[req.candidateId];
    const core = coreById.get(req.coreMealId);
    const cookedNow = input.tasks.some(
      (t) => t.type === "cook" && t.coreMealIds.includes(req.coreMealId),
    );
    const deferred = input.tasks.some(
      (t) => t.type === "fresh_finish" && t.coreMealIds.includes(req.coreMealId),
    );

    const fridgeLife = resolveFridgeLifeDays(core, recipe);
    const freezerFriendly = resolveFreezerFriendly(core, recipe);
    const reheatingQuality =
      core?.reheatingQuality ??
      (recipe?.experienceProfile.mealPrepQuality === "excellent"
        ? "excellent"
        : recipe?.experienceProfile.mealPrepQuality === "poor"
          ? "poor"
          : "good");

    for (const inst of req.instanceServings) {
      const daysUntilEat = daysBetween(input.prepSessionDay, inst.day);
      const id = `store_${inst.mealInstanceId}`;

      if (deferred && !cookedNow) {
        const finishTask = input.tasks.find(
          (t) => t.type === "fresh_finish" && t.mealInstanceIds.includes(inst.mealInstanceId),
        );
        const actionId = `future_finish_${inst.mealInstanceId}`;
        assignments.push({
          id,
          mealInstanceId: inst.mealInstanceId,
          coreMealId: req.coreMealId,
          recipeId: req.recipeId,
          mealName: req.name,
          day: inst.day,
          mealType: inst.mealType,
          personalServings: inst.personalServings,
          disposition: "fresh_finish_later",
          reason: "Primary cook deferred to eating day based on prep mode / reheating quality.",
          daysUntilEat,
          futureActionId: actionId,
          keepComponentsSeparate: ["crispy components", "fresh garnishes"],
        });
        futureActions.push({
          id: actionId,
          type: "fresh_finish",
          scheduledDay: inst.day,
          scheduledWindow: "before_meal",
          mealInstanceId: inst.mealInstanceId,
          coreMealId: req.coreMealId,
          mealName: req.name,
          durationMinutes: finishTask?.durationMinutes ?? 12,
          instructions: finishTask?.instructions ?? ["Finish and serve fresh."],
          relatedStorageAssignmentId: id,
        });
        continue;
      }

      if (fridgeLife == null && daysUntilEat > 1) {
        issues.push({
          code: "MISSING_STORAGE_PROFILE",
          message: `Insufficient storage metadata for ${req.name} needed on ${inst.day} (${daysUntilEat} days out).`,
          coreMealId: req.coreMealId,
          recipeId: req.recipeId,
          mealInstanceId: inst.mealInstanceId,
          preservable: true,
        });
        if (freezerFriendly === true) {
          const actionId = `future_thaw_${inst.mealInstanceId}`;
          const thawDay = previousDay(inst.day);
          assignments.push({
            id,
            mealInstanceId: inst.mealInstanceId,
            coreMealId: req.coreMealId,
            recipeId: req.recipeId,
            mealName: req.name,
            day: inst.day,
            mealType: inst.mealType,
            personalServings: inst.personalServings,
            disposition: "freeze",
            reason: "Storage profile incomplete; freezer-friendly — freeze and thaw before eating.",
            daysUntilEat,
            futureActionId: actionId,
            keepComponentsSeparate: [],
          });
          futureActions.push({
            id: actionId,
            type: "thaw",
            scheduledDay: thawDay,
            scheduledWindow: "evening",
            mealInstanceId: inst.mealInstanceId,
            coreMealId: req.coreMealId,
            mealName: req.name,
            durationMinutes: 0,
            instructions: [
              `Move ${req.name} from freezer to refrigerator for ${inst.day} ${inst.mealType}.`,
            ],
            relatedStorageAssignmentId: id,
          });
        } else {
          issues.push({
            code: "UNSAFE_STORAGE_HORIZON",
            message: `Cannot safely assign multi-day storage for ${req.name} on ${inst.day} without fridge/freezer metadata.`,
            coreMealId: req.coreMealId,
            recipeId: req.recipeId,
            mealInstanceId: inst.mealInstanceId,
            preservable: false,
          });
          assignments.push({
            id,
            mealInstanceId: inst.mealInstanceId,
            coreMealId: req.coreMealId,
            recipeId: req.recipeId,
            mealName: req.name,
            day: inst.day,
            mealType: inst.mealType,
            personalServings: inst.personalServings,
            disposition: "fresh_finish_later",
            reason: "Unsafe to claim fridge life — defer cook/finish.",
            daysUntilEat,
            keepComponentsSeparate: [],
          });
        }
        continue;
      }

      const life = fridgeLife ?? MEAL_PREP_POLICY.defaultFridgeLifeWhenGoodPrep;
      const beyondFridge = daysUntilEat > life;

      if (beyondFridge && freezerFriendly) {
        const actionId = `future_thaw_${inst.mealInstanceId}`;
        const thawDay = previousDay(inst.day);
        assignments.push({
          id,
          mealInstanceId: inst.mealInstanceId,
          coreMealId: req.coreMealId,
          recipeId: req.recipeId,
          mealName: req.name,
          day: inst.day,
          mealType: inst.mealType,
          personalServings: inst.personalServings,
          disposition: "freeze",
          reason: `Needed in ${daysUntilEat} days; fridge life ${life} days — freeze portion.`,
          fridgeLifeDaysUsed: life,
          daysUntilEat,
          futureActionId: actionId,
          keepComponentsSeparate: [],
        });
        futureActions.push({
          id: actionId,
          type: "thaw",
          scheduledDay: thawDay,
          scheduledWindow: "evening",
          mealInstanceId: inst.mealInstanceId,
          coreMealId: req.coreMealId,
          mealName: req.name,
          durationMinutes: 0,
          instructions: [
            `Move ${req.name} (${inst.day} ${inst.mealType}) from freezer to refrigerator.`,
          ],
          relatedStorageAssignmentId: id,
        });
      } else if (beyondFridge && !freezerFriendly) {
        issues.push({
          code: "UNSAFE_STORAGE_HORIZON",
          message: `${req.name} for ${inst.day} exceeds fridge life (${life}d) and is not freezer-friendly.`,
          coreMealId: req.coreMealId,
          recipeId: req.recipeId,
          mealInstanceId: inst.mealInstanceId,
          preservable: false,
        });
        assignments.push({
          id,
          mealInstanceId: inst.mealInstanceId,
          coreMealId: req.coreMealId,
          recipeId: req.recipeId,
          mealName: req.name,
          day: inst.day,
          mealType: inst.mealType,
          personalServings: inst.personalServings,
          disposition: "fresh_finish_later",
          reason: "Beyond fridge life without freezer support — cook/finish closer to eating day.",
          fridgeLifeDaysUsed: life,
          daysUntilEat,
          keepComponentsSeparate: [],
        });
      } else if (
        (reheatingQuality === "poor" || reheatingQuality === "fair") &&
        daysUntilEat > 2
      ) {
        assignments.push({
          id,
          mealInstanceId: inst.mealInstanceId,
          coreMealId: req.coreMealId,
          recipeId: req.recipeId,
          mealName: req.name,
          day: inst.day,
          mealType: inst.mealType,
          personalServings: inst.personalServings,
          disposition: "fresh_finish_later",
          reason: "Reheating quality is limited — prefer finishing closer to service.",
          fridgeLifeDaysUsed: life,
          daysUntilEat,
          keepComponentsSeparate: ["crispy components"],
        });
      } else {
        const actionId = cookedNow ? `future_reheat_${inst.mealInstanceId}` : undefined;
        assignments.push({
          id,
          mealInstanceId: inst.mealInstanceId,
          coreMealId: req.coreMealId,
          recipeId: req.recipeId,
          mealName: req.name,
          day: inst.day,
          mealType: inst.mealType,
          personalServings: inst.personalServings,
          disposition: "refrigerate",
          reason: `Within fridge life (${life} days); refrigerate portion for ${inst.day}.`,
          fridgeLifeDaysUsed: life,
          daysUntilEat,
          futureActionId: actionId,
          keepComponentsSeparate: [],
        });
        if (cookedNow && actionId) {
          futureActions.push({
            id: actionId,
            type: "reheat",
            scheduledDay: inst.day,
            scheduledWindow: "before_meal",
            mealInstanceId: inst.mealInstanceId,
            coreMealId: req.coreMealId,
            mealName: req.name,
            durationMinutes: 8,
            instructions: [
              recipe?.reheatingInstructions ?? "Reheat until steaming hot throughout.",
            ],
            relatedStorageAssignmentId: id,
          });
        }
      }
    }
  }

  return { assignments, futureActions, issues };
}

function resolveFridgeLifeDays(
  core: CoreMeal | undefined,
  recipe: ResolvedRecipe | undefined,
): number | null {
  if (core?.fridgeLifeDays != null) return core.fridgeLifeDays;
  const quality = recipe?.experienceProfile.mealPrepQuality;
  if (quality === "excellent") return 4;
  if (quality === "good") return MEAL_PREP_POLICY.defaultFridgeLifeWhenGoodPrep;
  if (quality === "poor") return 1;
  return null;
}

function resolveFreezerFriendly(
  core: CoreMeal | undefined,
  recipe: ResolvedRecipe | undefined,
): boolean | null {
  if (core?.freezerFriendly != null) return core.freezerFriendly;
  const quality = recipe?.experienceProfile.mealPrepQuality;
  if (quality === "excellent" || quality === "good") return true;
  if (quality === "poor") return false;
  return null;
}
