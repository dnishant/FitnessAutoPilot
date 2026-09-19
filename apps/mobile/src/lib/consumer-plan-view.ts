import type {
  ConsumerMealComponent,
  ConsumerMealSlot,
  ConsumerPlanGenerationStage,
  ConsumerWeeklyPlan,
  CookingPreferences,
  DayOfWeek,
  MealConcept,
  MealPreferences,
  NutritionTarget,
  PrepIntent,
  RankedWeeklyStrategy,
  ResolvedRecipe,
} from "@fitness-autopilot/contracts";
import { WEEK_DAYS as DAYS } from "@fitness-autopilot/contracts";
import { formatMacroGrams, formatNutritionCalories } from "@fitness-autopilot/domain";
import { prepIntentLabel as domainPrepIntentLabel } from "./weekly-strategy-preview";

export const CONSUMER_PLAN_STORAGE_KEY = "fa.consumer.weeklyPlan";
/** @deprecated Prefer groceryChecklistStorageKey(generatedPlanId) — kept for migration. */
export const GROCERY_CHECKED_STORAGE_KEY = "fa.consumer.groceryChecked";

/** Checklist state belongs to a grocery list / plan version — never mutates demand. */
export function groceryChecklistStorageKey(generatedPlanId?: string | null): string {
  if (generatedPlanId && generatedPlanId.trim()) {
    return `fa.consumer.groceryChecked.${generatedPlanId.trim()}`;
  }
  return GROCERY_CHECKED_STORAGE_KEY;
}

export const GENERATION_STAGE_COPY: Record<
  ConsumerPlanGenerationStage,
  { label: string; doneLabel: string }
> = {
  understanding_preferences: {
    label: "Understanding your preferences…",
    doneLabel: "Understanding your preferences…",
  },
  finding_meals: {
    label: "Finding meals you'll actually want to eat…",
    doneLabel: "Finding meals you'll actually want to eat…",
  },
  building_complete_meals: {
    label: "Making your week work together…",
    doneLabel: "Making your week work together…",
  },
  creating_week: {
    label: "Building your four-meal week…",
    doneLabel: "Building your four-meal week…",
  },
  finalizing_recipes: {
    label: "Finalizing your recipes…",
    doneLabel: "Finalizing your recipes…",
  },
  personalizing_portions: {
    label: "Personalizing your portions…",
    doneLabel: "Personalizing your portions…",
  },
  finalizing_plan: {
    label: "Building your grocery list…",
    doneLabel: "Building your grocery list…",
  },
  complete: {
    label: "Finalizing your plan…",
    doneLabel: "Your week is ready",
  },
};

export const GENERATION_STAGE_ORDER: ConsumerPlanGenerationStage[] = [
  "understanding_preferences",
  "finding_meals",
  "building_complete_meals",
  "creating_week",
  "finalizing_recipes",
  "personalizing_portions",
  "finalizing_plan",
  "complete",
];

export function startOfWeekMonday(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T12:00:00.000Z`);
  const end = new Date(`${weekEnd}T12:00:00.000Z`);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}`;
}

export function formatLongDay(date = new Date()): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export function greetingForNow(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function dayOfWeekFromDate(date = new Date()): DayOfWeek {
  const map: DayOfWeek[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return map[date.getDay()] ?? "monday";
}

export function shortDayLabel(day: DayOfWeek): string {
  switch (day) {
    case "monday":
      return "Mon";
    case "tuesday":
      return "Tue";
    case "wednesday":
      return "Wed";
    case "thursday":
      return "Thu";
    case "friday":
      return "Fri";
    case "saturday":
      return "Sat";
    case "sunday":
      return "Sun";
  }
}

export function consumerPrepLabel(
  intent: PrepIntent,
  finishTimeMinutes?: number,
): string {
  switch (intent) {
    case "fully_prepped":
      return "Meal prepped";
    case "component_prepped":
      return finishTimeMinutes != null
        ? `Finish fresh · ${finishTimeMinutes} min`
        : "Component prepped";
    case "quick_fresh_finish":
      return finishTimeMinutes != null
        ? `Finish fresh · ${finishTimeMinutes} min`
        : "Quick fresh finish";
    case "fresh":
      return finishTimeMinutes != null ? `Fresh · ${finishTimeMinutes} min` : "Fresh";
  }
}

export function humanizePlanGenerationError(message: string, code?: string): string {
  const lower = message.toLowerCase();

  // Typed generation failures first — never reclassify by substring of a prior humanized message.
  if (
    code === "EXECUTABLE_REPLACEMENT_EXHAUSTED" ||
    code === "PLAN_NOT_EXECUTABLE" ||
    code === "CANONICAL_MEAL_INTEGRITY_FAILED" ||
    code === "PLAN_VALIDATION_FAILED" ||
    lower.includes("plan-011") ||
    lower.includes("not executable") ||
    lower.includes("canonical meal integrity")
  ) {
    return "We couldn't finish a reliable plan this time. Please try generating again.";
  }
  if (
    code === "DISCOVERY_SCHEMA_VALIDATION_FAILED" ||
    code === "DISCOVERY_NOT_GROUNDED" ||
    code === "LLM_INVALID_STRUCTURED_OUTPUT" ||
    lower.includes("candidates passed schema") ||
    lower.includes("empty candidates array")
  ) {
    return "We couldn't finish finding meal ideas this time. Your preferences are saved — try generating again.";
  }
  if (
    code === "LLM_CONFIGURATION_ERROR" ||
    lower.includes("gemini") ||
    lower.includes("api key")
  ) {
    return "We couldn't finish your meal plan right now. Your preferences are saved — try again in a moment.";
  }
  if (lower.includes("rate") || code === "RATE_LIMITED") {
    return "We're getting a lot of requests. Wait a moment, then try generating again.";
  }
  if (lower.includes("network") || lower.includes("failed to send")) {
    return "We couldn't reach the planning service. Check your connection and try again.";
  }
  // Only real preference/allergy constraint failures — not "Your preferences are saved".
  if (
    lower.includes("hard preference constraint") ||
    lower.includes("allergy constraint") ||
    (lower.includes("allerg") && lower.includes("blocked"))
  ) {
    return "Something in your preferences blocked planning. Review food preferences, then try again.";
  }
  return "We couldn't finish your meal plan. Your preferences are saved. Try generating it again.";
}

/** Developer-facing detail appended under the consumer message while diagnosing generation. */
export function formatPlanGenerationFailureDetail(input: {
  code?: string;
  message?: string;
  validationReport?: {
    status?: string;
    hardFailureCount?: number;
    repairableFailureCount?: number;
    warningCount?: number;
    repairAttempts?: number;
    structuralRules?: Array<{ ruleId: string; severity: string }>;
    days?: Array<{ rules: Array<{ ruleId: string; severity: string }> }>;
    weekly?: { rules?: Array<{ ruleId: string; severity: string }> };
  } | null;
}): string | null {
  const parts: string[] = [];
  if (input.code) parts.push(input.code);
  const report = input.validationReport;
  if (report?.status) parts.push(report.status);
  if (report?.repairAttempts != null && report.repairAttempts > 0) {
    parts.push(`repairs=${report.repairAttempts}`);
  }

  const allRules = [
    ...(report?.structuralRules ?? []),
    ...(report?.days ?? []).flatMap((d) => d.rules),
    ...(report?.weekly?.rules ?? []),
  ];
  const hardIds = [
    ...new Set(allRules.filter((r) => r.severity === "hard_failure").map((r) => r.ruleId)),
  ].slice(0, 6);
  const repairIds = [
    ...new Set(
      allRules.filter((r) => r.severity === "repairable_failure").map((r) => r.ruleId),
    ),
  ].slice(0, 6);
  if (hardIds.length > 0) parts.push(hardIds.join(", "));
  else if (repairIds.length > 0) parts.push(repairIds.join(", "));

  if (hardIds.length === 0 && repairIds.length === 0 && input.message) {
    const match = input.message.match(/PLAN-011 validation \(([^)]+)\):\s*(.+)$/i);
    if (match) {
      parts.push(match[1]);
      if (match[2]?.trim()) parts.push(match[2].trim().slice(0, 180));
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function componentsFromConcept(concept: MealConcept | undefined, fallbackName: string): ConsumerMealComponent[] {
  if (!concept) {
    return [{ componentId: "main", displayName: fallbackName, role: "main" }];
  }
  const rows: ConsumerMealComponent[] = [
    {
      componentId: concept.main.componentId,
      displayName: concept.main.name,
      role: concept.main.role,
    },
  ];
  for (const component of concept.components) {
    if (component.componentId === concept.main.componentId) continue;
    // Parent-owned intrinsic structure belongs on Recipe Detail, not Your Meal.
    if ((component.nutritionOwnership ?? "independent") === "parent_owned") continue;
    rows.push({
      componentId: component.componentId,
      displayName: component.name,
      role: component.role,
    });
  }
  return rows;
}

function finishMinutesFromRecipe(
  recipe: ResolvedRecipe | undefined,
  prepIntent: PrepIntent,
): number | undefined {
  if (!recipe) return undefined;
  const match = recipe.supportedPrepModes.find((mode) => mode.mode === prepIntent);
  if (match) return match.finishTimeMinutes;
  return recipe.supportedPrepModes[0]?.finishTimeMinutes;
}

export function buildConsumerMealsFromStrategy(input: {
  strategy: RankedWeeklyStrategy;
  conceptsByCandidateId?: Record<string, MealConcept>;
  recipesByCandidateId?: Record<string, ResolvedRecipe>;
}): ConsumerMealSlot[] {
  const weeklyCounts = new Map<string, number>();
  for (const day of input.strategy.days) {
    for (const slot of [day.lunch, day.dinner]) {
      weeklyCounts.set(slot.candidateId, (weeklyCounts.get(slot.candidateId) ?? 0) + 1);
    }
  }
  const coreByCandidate = new Map(
    (input.strategy.coreRepertoire?.coreMeals ?? []).map((m) => [m.candidateId, m]),
  );

  const meals: ConsumerMealSlot[] = [];
  for (const day of input.strategy.days) {
    for (const slot of [day.lunch, day.dinner]) {
      const concept = input.conceptsByCandidateId?.[slot.candidateId];
      const recipe = input.recipesByCandidateId?.[slot.candidateId];
      const core = coreByCandidate.get(slot.candidateId);
      meals.push({
        day: slot.day,
        mealType: slot.mealType,
        candidateId: slot.candidateId,
        coreMealId: core?.coreMealId ?? slot.candidateId,
        weeklyInstanceCount: core?.weeklyInstanceCount ?? weeklyCounts.get(slot.candidateId),
        name: slot.name,
        prepIntent: slot.prepIntent,
        finishTimeMinutes: finishMinutesFromRecipe(recipe, slot.prepIntent),
        cuisineFamily: recipe?.flavorProfile.cuisineFamily,
        flavorTags: recipe?.flavorProfile.flavorFamilies,
        experienceTags: recipe
          ? [
              recipe.experienceProfile.flavorIntensity,
              recipe.experienceProfile.moistureLevel === "saucy" ? "Saucy" : "",
            ].filter(Boolean)
          : undefined,
        components: componentsFromConcept(concept, slot.name),
        mealInstanceId: undefined,
        // personalizedNutrition applied by PLAN-010 personalizeWeeklyNutritionPlan
      });
    }
  }
  return meals;
}

/** Summary of the four core meals for Plan overview UI. */
export function coreMealsSummary(
  plan: ConsumerWeeklyPlan | null | undefined,
): Array<{ coreMealId: string; name: string; weeklyInstanceCount: number }> {
  if (plan?.coreRepertoire?.coreMeals?.length) {
    return plan.coreRepertoire.coreMeals.map((m) => ({
      coreMealId: m.coreMealId,
      name: m.name,
      weeklyInstanceCount: m.weeklyInstanceCount,
    }));
  }
  if (plan?.strategy?.coreRepertoire?.coreMeals?.length) {
    return plan.strategy.coreRepertoire.coreMeals.map((m) => ({
      coreMealId: m.coreMealId,
      name: m.name,
      weeklyInstanceCount: m.weeklyInstanceCount,
    }));
  }
  const counts = new Map<string, { name: string; count: number }>();
  for (const meal of plan?.meals ?? []) {
    const key = meal.coreMealId ?? meal.candidateId;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { name: meal.name, count: 1 });
  }
  return [...counts.entries()].map(([coreMealId, v]) => ({
    coreMealId,
    name: v.name,
    weeklyInstanceCount: v.count,
  }));
}

export function isFlexibleDay(
  plan: ConsumerWeeklyPlan | null | undefined,
  day: DayOfWeek,
): boolean {
  const flexible = plan?.flexibleDay ?? plan?.strategy?.flexibleDay ?? "sunday";
  return day === flexible;
}

export function planWeekSummaryLine(
  plan: ConsumerWeeklyPlan | null | undefined,
): string {
  const cores = coreMealsSummary(plan);
  const coreCount = cores.length || 4;
  const portions = plan?.meals?.length ?? (plan?.strategy?.days.length ?? 6) * 2;
  const coveredDays = plan?.strategy?.days.length ?? 6;
  return `${coreCount} meals · ${portions} portions · ${coveredDays} days covered`;
}

export function createEmptyConsumerPlan(weekStart = startOfWeekMonday()): ConsumerWeeklyPlan {
  return {
    weekStart,
    weekEnd: addDaysIso(weekStart, 6),
    status: "idle",
  };
}

export function findMealSlot(
  plan: ConsumerWeeklyPlan | null | undefined,
  day: DayOfWeek,
  mealType: "lunch" | "dinner",
): ConsumerMealSlot | null {
  if (!plan?.meals) return null;
  return plan.meals.find((meal) => meal.day === day && meal.mealType === mealType) ?? null;
}

export function mealsForDay(
  plan: ConsumerWeeklyPlan | null | undefined,
  day: DayOfWeek,
): { lunch: ConsumerMealSlot | null; dinner: ConsumerMealSlot | null } {
  return {
    lunch: findMealSlot(plan, day, "lunch"),
    dinner: findMealSlot(plan, day, "dinner"),
  };
}

export function nutritionHeaderLine(nutritionTarget: NutritionTarget | null): string {
  if (!nutritionTarget) return "";
  const parts = [
    formatNutritionCalories(nutritionTarget.targetCalories).replace(" kcal", " kcal/day"),
    `${formatMacroGrams(nutritionTarget.proteinG).replace(" g", "g")} protein`,
  ];
  if (nutritionTarget.fiberG != null) {
    parts.push(`${formatMacroGrams(nutritionTarget.fiberG).replace(" g", "g")} fiber`);
  }
  return parts.join(" · ");
}

export function preferenceSummaryLine(prefs: MealPreferences | null): string {
  if (!prefs) return "Not set yet";
  const cuisines = prefs.cuisines
    .filter((c) => c !== "surprise_me")
    .map((c) => c.replace(/_/g, " "))
    .slice(0, 3)
    .map(titleCase);
  const experiences = prefs.experiencePreferences.slice(0, 2).map((e) =>
    titleCase(e.replace(/_/g, " ")),
  );
  const variety =
    prefs.varietyLevel === "simple"
      ? "Keep it simple"
      : prefs.varietyLevel === "high"
        ? "Lots of variety"
        : "Balanced variety";
  return [...cuisines, ...experiences, variety].filter(Boolean).join(" · ") || variety;
}

export function cookingSummaryLines(prefs: CookingPreferences | null): string[] {
  if (!prefs) return ["Not set yet"];
  const frequency =
    prefs.prepFrequency === "once_weekly"
      ? "Once weekly"
      : prefs.prepFrequency === "twice_weekly"
        ? "Twice weekly"
        : "Throughout the week";
  const session =
    prefs.maxPrepSessionMinutes == null
      ? "Flexible prep"
      : `~${prefs.maxPrepSessionMinutes} min prep`;
  const finish =
    prefs.maxFinishMinutes > 0
      ? `Fresh finish ≤${prefs.maxFinishMinutes} min`
      : null;
  return [frequency, session, finish].filter((v): v is string => Boolean(v));
}

export function generateReadySummary(input: {
  nutritionTarget: NutritionTarget | null;
  mealPreferences: MealPreferences | null;
  cookingPreferences: CookingPreferences | null;
}): string[] {
  const lines: string[] = [];
  if (input.nutritionTarget) {
    lines.push(
      `${Math.round(input.nutritionTarget.targetCalories).toLocaleString()} kcal/day`,
    );
    lines.push(`${Math.round(input.nutritionTarget.proteinG)}g protein`);
  }
  if (input.mealPreferences) {
    lines.push(
      input.mealPreferences.varietyLevel === "simple"
        ? "Simple variety"
        : input.mealPreferences.varietyLevel === "high"
          ? "Lots of variety"
          : "Balanced variety",
    );
  }
  if (input.cookingPreferences) {
    const mins = input.cookingPreferences.maxPrepSessionMinutes;
    if (mins != null) {
      lines.push(`~${mins} min weekly prep`);
    }
    if (input.cookingPreferences.maxFinishMinutes > 0) {
      lines.push(`Fresh dinners in ≤${input.cookingPreferences.maxFinishMinutes} min`);
    }
  }
  return lines;
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function mealCardDisplayModel(meal: ConsumerMealSlot): {
  mealTypeLabel: string;
  name: string;
  componentNames: string[];
  prepLabel: string | null;
  nutritionLine: string | null;
} {
  const componentNames = meal.components
    .filter((c) => c.displayName !== meal.name)
    .map((c) => titleCase(c.displayName));
  const nutrition = meal.personalizedNutrition;
  return {
    mealTypeLabel: meal.mealType.toUpperCase(),
    name: meal.name,
    componentNames,
    prepLabel: consumerPrepLabel(meal.prepIntent, meal.finishTimeMinutes),
    nutritionLine: nutrition
      ? `${Math.round(nutrition.caloriesKcal)} kcal · ${Math.round(nutrition.proteinGrams)}g protein`
      : null,
  };
}

export function nutritionSummaryDisplayModel(input: {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  paceLabel?: string;
}): {
  caloriesLabel: string;
  proteinLabel: string;
  carbsLabel: string;
  fatLabel: string;
  fiberLabel: string | null;
  paceLabel?: string;
} {
  return {
    caloriesLabel: Math.round(input.calories).toLocaleString(),
    proteinLabel: `${Math.round(input.proteinG)}g`,
    carbsLabel: `${Math.round(input.carbsG)}g`,
    fatLabel: `${Math.round(input.fatG)}g`,
    fiberLabel: input.fiberG != null ? `${Math.round(input.fiberG)}g Fiber` : null,
    paceLabel: input.paceLabel,
  };
}

export function orderedWeekDays(): readonly DayOfWeek[] {
  return DAYS;
}

export { domainPrepIntentLabel };
