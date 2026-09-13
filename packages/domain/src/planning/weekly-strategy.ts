import type {
  DayOfWeek,
  MealType,
  WeeklyDayStrategy,
  WeeklyMealConcept,
  WeeklyMealStrategy,
  WeeklyStrategyRequest,
  WeeklyStrategyStats,
} from "@fitness-autopilot/contracts";
import {
  DayOfWeekSchema,
  MealTypeSchema,
  PrepIntentSchema,
  WEEK_DAYS,
  WeeklyMealStrategySchema,
  WeeklyStrategyRequestSchema,
  VarietyLevelSchema,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";

export const WEEKLY_STRATEGY_PROMPT_VERSION = "weekly-strategy-v1" as const;

export type WeeklyStrategyErrorCode =
  | "LLM_CONFIGURATION_ERROR"
  | "LLM_PROVIDER_ERROR"
  | "LLM_INVALID_STRUCTURED_OUTPUT"
  | "WEEKLY_STRATEGY_VALIDATION_FAILED"
  | "INVALID_WEEKLY_STRATEGY_REQUEST";

export type WeeklyStrategyError = {
  code: WeeklyStrategyErrorCode;
  message: string;
  details?: unknown;
};

/**
 * Provider-independent weekly meal strategy generator.
 * Implementations live outside domain packages.
 * Always produces one WeeklyMealStrategy per call (seven days of meal concepts).
 * Must not call RecipeGenerator / detailed recipe generation.
 */
export interface WeeklyStrategyGenerator {
  generateWeeklyStrategy(request: WeeklyStrategyRequest): Promise<WeeklyMealStrategy>;
}

export type WeeklyStrategyPrompt = {
  version: typeof WEEKLY_STRATEGY_PROMPT_VERSION;
  systemInstruction: string;
  userPrompt: string;
};

const MEAL_SLOTS: ReadonlyArray<MealType> = ["breakfast", "lunch", "snack", "dinner"];

const VARIETY_GUIDANCE: Record<
  WeeklyStrategyRequest["foodPreferences"]["varietyLevel"],
  string
> = {
  simple: [
    "Favor fewer unique meals and more intentional repetition.",
    "Strong ingredient reuse and low prep complexity.",
    "Repeating breakfasts/snacks is encouraged; lunch/dinner repetition is acceptable.",
  ].join(" "),
  balanced: [
    "Favor meaningful lunch/dinner variety with some strategic repetition.",
    "Breakfasts/snacks may repeat more often.",
    "Avoid consecutive meals with very similar flavor experiences.",
    "Reuse ingredients without making meals feel repetitive.",
  ].join(" "),
  high: [
    "Favor more unique lunch/dinner experiences and stronger cuisine/flavor rotation.",
    "Fewer repeated main meals.",
    "Breakfasts/snacks may still repeat when practical.",
    "Still respect prep-time and cooking-style constraints.",
  ].join(" "),
};

const COOKING_STYLE_GUIDANCE: Record<
  WeeklyStrategyRequest["cookingPreferences"]["cookingStyle"],
  string
> = {
  mostly_ready:
    "Favor prepIntent=fully_prepped frequently. Fresh finish should generally be avoided.",
  ready_lunch_fresh_dinner: [
    "Favor lunch → fully_prepped.",
    "Favor dinner → component_prepped or fresh within maxFinishMinutes.",
    "This is a preference, not an absolute hard mapping.",
  ].join(" "),
  fresh_focused:
    "Favor prepIntent=component_prepped or fresh more frequently. Respect maxFinishMinutes.",
};

export function weeklyStrategyError(
  code: WeeklyStrategyErrorCode,
  message: string,
  details?: unknown,
): WeeklyStrategyError {
  return details === undefined ? { code, message } : { code, message, details };
}

export function parseWeeklyStrategyRequest(
  input: unknown,
): Result<WeeklyStrategyRequest, WeeklyStrategyError> {
  const parsed = WeeklyStrategyRequestSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_WEEKLY_STRATEGY_REQUEST",
      message: parsed.error.issues[0]?.message ?? "Invalid weekly strategy request.",
      details: parsed.error.flatten(),
    });
  }
  return ok(parsed.data);
}

function listOrNone(values: readonly string[] | undefined): string {
  if (!values || values.length === 0) {
    return "(none specified)";
  }
  return values.join(", ");
}

function formatPrepSessionMinutes(
  minutes: WeeklyStrategyRequest["cookingPreferences"]["maxPrepSessionMinutes"],
): string {
  if (minutes === null) {
    return "flexible";
  }
  return `${minutes}`;
}

export function buildWeeklyStrategyPrompt(
  request: WeeklyStrategyRequest,
): WeeklyStrategyPrompt {
  const { nutrition, foodPreferences, cookingPreferences } = request;
  const varietyNote = VARIETY_GUIDANCE[foodPreferences.varietyLevel];
  const cookingNote = COOKING_STYLE_GUIDANCE[cookingPreferences.cookingStyle];

  const finishNote =
    cookingPreferences.maxFinishMinutes === 0
      ? "Prefer mostly-ready / reheatable preparation (0-minute finish)."
      : `Fresh finishes should generally stay within about ${cookingPreferences.maxFinishMinutes} minutes when using prepIntent=fresh.`;

  const dinnerPrepNote = cookingPreferences.useDinnerPrepForNextLunch
    ? [
        "Dinner prep can help tomorrow's lunch without forcing the same finished meal.",
        "Prefer reuse of preparation effort over exact dinner→lunch leftovers.",
        "Direct dinner leftovers as next-day lunch should be rare, not the primary strategy.",
      ].join(" ")
    : "Do not plan around dinner prep helping the next lunch.";

  const systemInstruction = [
    "You are Fitness Autopilot's weekly meal strategy planner.",
    "Design a high-level 7-day eating strategy as structured JSON matching the schema.",
    "Return exactly one week: Monday through Sunday.",
    "Do NOT generate detailed recipes, ingredients lists, instructions, grams, or nutrition totals.",
    "Each meal slot is a meal CONCEPT only (name + planning metadata).",
    "",
    "Architecture role:",
    "- You are the orchestration layer: what should this person's week of eating look like?",
    "- A later Recipe Resolver will turn unique concepts into detailed recipes.",
    "",
    "Days:",
    "- Include exactly seven days: monday, tuesday, wednesday, thursday, friday, saturday, sunday.",
    "- Each day value must appear exactly once.",
    "- Prefer filling breakfast, lunch, snack, and dinner when realistic for a full plan.",
    "",
    "conceptId and repetition:",
    "- Assign a stable conceptId to each unique meal concept (e.g. breakfast-smoothie-1).",
    "- When the same concept repeats later, reuse the same conceptId and set repeatOfConceptId to that conceptId.",
    "- First occurrence: omit repeatOfConceptId or set it to null.",
    "- Do not invent recipe IDs — detailed recipes do not exist yet.",
    "",
    "Variety (optimization preference, NOT rigid recipe quotas):",
    `- varietyLevel=${foodPreferences.varietyLevel}: ${varietyNote}`,
    "- Variety means perceived culinary variety (cuisine, sauce, seasoning, texture, preparation), not merely changing protein.",
    "- Example: chicken tikka / paneer tikka / shrimp tikka is NOT automatically high variety.",
    "- Example: chicken tikka / Thai basil chicken / chicken fajitas / chicken shawarma can feel varied despite reusing chicken.",
    "- Do NOT map varietyLevel to exact unique-recipe counts (e.g. simple≠5, balanced≠9, high≠14).",
    "",
    "Breakfast and snacks:",
    "- Breakfast/snack repetition is more acceptable than lunch/dinner monotony.",
    "- Lunch/dinner variety matters more for most users.",
    "",
    "Ingredient reuse:",
    "- Minimize grocery/prep complexity while maximizing perceived culinary variety.",
    "- Intentionally reuse staple ingredients (chicken, rice, Greek yogurt, onion, garlic, peppers, citrus, herbs) while changing cuisine/sauce/seasoning.",
    "- Populate sharedIngredientIntents with likely reusable ingredients/components (planning suggestions only).",
    "- Keep each sharedIngredientIntents entry short (ingredient/component label or brief phrase, ≤160 characters). Not sentences.",
    "",
    "Cooking style / prep intent:",
    `- cookingStyle=${cookingPreferences.cookingStyle}: ${cookingNote}`,
    `- ${finishNote}`,
    `- prepFrequency=${cookingPreferences.prepFrequency}; maxPrepSessionMinutes=${formatPrepSessionMinutes(cookingPreferences.maxPrepSessionMinutes)}.`,
    "- Choose a week that appears plausibly compatible with these prep constraints. Do not invent an exact prep timeline.",
    "",
    "Dinner → next lunch:",
    `- useDinnerPrepForNextLunch=${cookingPreferences.useDinnerPrepForNextLunch}.`,
    `- ${dinnerPrepNote}`,
    "",
    "Nutrition:",
    "- Daily calorie/protein (and optional macro) targets influence composition qualitatively (protein-forward, reasonable meal distribution).",
    "- Do NOT output calories, macros, or claim the week perfectly satisfies exact nutrition.",
    "- Later stages will verify nutrition after detailed recipes exist.",
    "",
    "Hard constraints:",
    "- allergies and dietaryRestrictions are absolute exclusions — no concept may knowingly violate them.",
    "- Strongly avoid disliked foods.",
    "- Cuisine, protein, and experience preferences are soft ranking signals — not mandatory quotas.",
    "- Selecting Indian/Mexican/Mediterranean does NOT require using each exactly once.",
    "",
    "Culinary quality:",
    "- Prefer food people genuinely want to eat: recognizable, flavorful, texturally satisfying.",
    "- Avoid dry/generic fitness food as the default week.",
    "",
    "Do not include uniqueConceptCount — the server calculates it.",
    `Prompt version: ${WEEKLY_STRATEGY_PROMPT_VERSION}`,
  ].join("\n");

  const userPrompt = [
    "Generate a 7-day weekly meal strategy with these preferences:",
    "",
    "Nutrition (qualitative guidance only):",
    `targetCaloriesPerDay: ${nutrition.targetCaloriesPerDay}`,
    `targetProteinGramsPerDay: ${nutrition.targetProteinGramsPerDay}`,
    `targetCarbsGramsPerDay: ${nutrition.targetCarbsGramsPerDay ?? "(not specified)"}`,
    `targetFatGramsPerDay: ${nutrition.targetFatGramsPerDay ?? "(not specified)"}`,
    "",
    "Food preferences (PLAN-001):",
    `cuisines: ${listOrNone(foodPreferences.cuisines)}`,
    `proteinPreferences: ${listOrNone(foodPreferences.proteinPreferences)}`,
    `experiencePreferences: ${listOrNone(foodPreferences.experiencePreferences)}`,
    `allergies (hard exclude): ${listOrNone(foodPreferences.allergies)}`,
    `dietaryRestrictions (hard exclude): ${listOrNone(foodPreferences.dietaryRestrictions)}`,
    `dislikes (strongly avoid): ${listOrNone(foodPreferences.dislikes)}`,
    `varietyLevel: ${foodPreferences.varietyLevel}`,
    `varietyLevel guidance: ${varietyNote}`,
    "",
    "Cooking preferences (PLAN-002):",
    `prepFrequency: ${cookingPreferences.prepFrequency}`,
    `maxPrepSessionMinutes: ${formatPrepSessionMinutes(cookingPreferences.maxPrepSessionMinutes)}`,
    `cookingStyle: ${cookingPreferences.cookingStyle}`,
    `cookingStyle guidance: ${cookingNote}`,
    `maxFinishMinutes: ${cookingPreferences.maxFinishMinutes}`,
    `finish-time guidance: ${finishNote}`,
    `useDinnerPrepForNextLunch: ${cookingPreferences.useDinnerPrepForNextLunch}`,
    `dinner-prep guidance: ${dinnerPrepNote}`,
    "",
    "Return exactly one WeeklyMealStrategy with seven distinct days.",
    "Meal concepts only — no detailed recipes, ingredients, instructions, or nutrition fields.",
  ].join("\n");

  return {
    version: WEEKLY_STRATEGY_PROMPT_VERSION,
    systemInstruction,
    userPrompt,
  };
}

export function collectMealConcepts(
  days: readonly WeeklyDayStrategy[],
): WeeklyMealConcept[] {
  const concepts: WeeklyMealConcept[] = [];
  for (const day of days) {
    for (const slot of MEAL_SLOTS) {
      const concept = day[slot];
      if (concept) {
        concepts.push(concept);
      }
    }
  }
  return concepts;
}

export function calculateUniqueConceptCount(
  days: readonly WeeklyDayStrategy[],
): number {
  const ids = new Set(collectMealConcepts(days).map((c) => c.conceptId));
  return ids.size;
}

/**
 * Overwrite Gemini-provided uniqueConceptCount with a deterministic value.
 */
export function withDeterministicUniqueConceptCount(
  strategy: Omit<WeeklyMealStrategy, "uniqueConceptCount"> & {
    uniqueConceptCount?: number;
  },
): WeeklyMealStrategy {
  return {
    ...strategy,
    uniqueConceptCount: calculateUniqueConceptCount(strategy.days),
  };
}

export function calculateWeeklyStrategyStats(
  strategy: WeeklyMealStrategy,
): WeeklyStrategyStats {
  const concepts = collectMealConcepts(strategy.days);
  const allIds = new Set(concepts.map((c) => c.conceptId));

  const byMealType = (mealType: MealType): number => {
    const ids = new Set(
      concepts.filter((c) => c.mealType === mealType).map((c) => c.conceptId),
    );
    return ids.size;
  };

  const cuisineFamilies = [
    ...new Set(
      concepts
        .map((c) => c.cuisineFamily)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ].sort();

  const primaryProteins = [
    ...new Set(
      concepts
        .map((c) => c.primaryProtein)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ].sort();

  // Count slots that are repeats: either marked with repeatOfConceptId, or
  // any occurrence after the first of a duplicated conceptId.
  const seen = new Set<string>();
  let repeatedMealSlots = 0;
  for (const concept of concepts) {
    if (concept.repeatOfConceptId) {
      repeatedMealSlots += 1;
      seen.add(concept.conceptId);
      continue;
    }
    if (seen.has(concept.conceptId)) {
      repeatedMealSlots += 1;
    } else {
      seen.add(concept.conceptId);
    }
  }

  return {
    totalMealSlots: concepts.length,
    uniqueConcepts: allIds.size,
    uniqueBreakfastConcepts: byMealType("breakfast"),
    uniqueLunchConcepts: byMealType("lunch"),
    uniqueSnackConcepts: byMealType("snack"),
    uniqueDinnerConcepts: byMealType("dinner"),
    repeatedMealSlots,
    cuisineFamilies,
    primaryProteins,
  };
}

function conceptSearchText(concept: WeeklyMealConcept): string {
  return [
    concept.name,
    concept.cuisineFamily,
    concept.primaryProtein,
    ...(concept.flavorFamilies ?? []),
    ...(concept.experienceTags ?? []),
    concept.rationale,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function findHardConstraintViolations(
  strategy: WeeklyMealStrategy,
  request: WeeklyStrategyRequest,
): string[] {
  const hardTerms = [
    ...request.foodPreferences.allergies,
    ...request.foodPreferences.dietaryRestrictions,
  ]
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);

  if (hardTerms.length === 0) {
    return [];
  }

  const violations: string[] = [];
  for (const concept of collectMealConcepts(strategy.days)) {
    const text = conceptSearchText(concept);
    for (const term of hardTerms) {
      if (text.includes(term)) {
        violations.push(
          `Concept "${concept.name}" (${concept.conceptId}) appears to reference hard constraint "${term}".`,
        );
      }
    }
  }
  return violations;
}

function validateDayStructure(days: readonly WeeklyDayStrategy[]): string[] {
  const issues: string[] = [];

  if (days.length !== 7) {
    issues.push(`Expected exactly 7 days, received ${days.length}.`);
  }

  const seen = new Set<string>();
  for (const day of days) {
    if (seen.has(day.day)) {
      issues.push(`Duplicate day: ${day.day}.`);
    }
    seen.add(day.day);

    for (const slot of MEAL_SLOTS) {
      const concept = day[slot];
      if (!concept) {
        continue;
      }
      if (concept.mealType !== slot) {
        issues.push(
          `Day ${day.day} slot ${slot} has mismatched mealType "${concept.mealType}".`,
        );
      }
      if (!MealTypeSchema.safeParse(concept.mealType).success) {
        issues.push(`Invalid mealType on ${day.day}.${slot}.`);
      }
      if (!PrepIntentSchema.safeParse(concept.prepIntent).success) {
        issues.push(`Invalid prepIntent on ${day.day}.${slot}.`);
      }
    }
  }

  for (const required of WEEK_DAYS) {
    if (!seen.has(required)) {
      issues.push(`Missing day: ${required}.`);
    }
  }

  return issues;
}

function validateConceptReferences(days: readonly WeeklyDayStrategy[]): string[] {
  const issues: string[] = [];
  const concepts = collectMealConcepts(days);
  const knownIds = new Set(concepts.map((c) => c.conceptId));

  for (const concept of concepts) {
    if (concept.repeatOfConceptId) {
      if (!knownIds.has(concept.repeatOfConceptId)) {
        issues.push(
          `repeatOfConceptId "${concept.repeatOfConceptId}" does not reference an existing concept.`,
        );
      }
      if (concept.conceptId !== concept.repeatOfConceptId) {
        issues.push(
          `Repeated concept "${concept.name}" should reuse conceptId "${concept.repeatOfConceptId}" (got "${concept.conceptId}").`,
        );
      }
    }
  }

  return issues;
}

/**
 * Deterministic structural + hard-constraint validation after Gemini returns.
 * Calculates uniqueConceptCount locally and never trusts the model value.
 */
export function validateWeeklyMealStrategy(
  input: unknown,
  request?: WeeklyStrategyRequest,
): Result<WeeklyMealStrategy, WeeklyStrategyError> {
  const parsed = WeeklyMealStrategySchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.join(".") ?? "";
    let message = issue?.message ?? "Weekly strategy failed schema validation.";

    // Friendlier messages for common structural failures used in tests.
    if (path.includes("mealType") || message.toLowerCase().includes("mealtype")) {
      message = "Invalid meal type in weekly strategy.";
    } else if (path.includes("prepIntent") || message.toLowerCase().includes("prepintent")) {
      message = "Invalid prep intent in weekly strategy.";
    } else if (
      path.includes("varietyLevel") ||
      message.toLowerCase().includes("varietylevel")
    ) {
      message = "Invalid variety level in weekly strategy.";
    } else if (path === "days" || path.startsWith("days")) {
      if (Array.isArray((input as { days?: unknown })?.days)) {
        const days = (input as { days: unknown[] }).days;
        if (days.length !== 7) {
          message = `Expected exactly 7 days, received ${days.length}.`;
        }
      }
    }

    return err({
      code: "WEEKLY_STRATEGY_VALIDATION_FAILED",
      message,
      details: parsed.error.flatten(),
    });
  }

  const structuralIssues = [
    ...validateDayStructure(parsed.data.days),
    ...validateConceptReferences(parsed.data.days),
  ];

  if (request) {
    if (
      !VarietyLevelSchema.safeParse(parsed.data.strategySummary.varietyLevel).success
    ) {
      structuralIssues.push("Invalid variety level in strategy summary.");
    }
    structuralIssues.push(...findHardConstraintViolations(
      withDeterministicUniqueConceptCount(parsed.data),
      request,
    ));
  }

  if (structuralIssues.length > 0) {
    return err({
      code: "WEEKLY_STRATEGY_VALIDATION_FAILED",
      message: structuralIssues[0] ?? "Weekly strategy failed structural validation.",
      details: { issues: structuralIssues },
    });
  }

  return ok(withDeterministicUniqueConceptCount(parsed.data));
}

/** Re-export day helpers for tests/adapters. */
export { WEEK_DAYS, DayOfWeekSchema };
export type { DayOfWeek };
