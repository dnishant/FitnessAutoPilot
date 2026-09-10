import type {
  CookingPreferences,
  CookingPreferencesInput,
  CuisineValue,
  ExperienceValue,
  FreshFinishMinutes,
  MaxFinishMinutes,
  MaxPrepSessionMinutes,
  MealPreferences,
  MealPreferencesInput,
  OnboardingGoalType,
  PrepFrequency,
  ProteinValue,
  RmrBiologicalSex,
  RmrSource,
  TdeeSource,
  VarietyLevel,
  Wearable,
  WeeklyCookingStyle,
  WeightChangePace,
} from "../../contracts/index.ts";
import { onboardingGoalLabel } from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";
import {
  completeRmrOnboarding,
  createEstimatedRmr,
  createUserReportedRmr,
  formatRmrKcalPerDay,
  RMR_EXPLANATION,
  rmrResultSourceLabel,
  type RmrError,
  type RmrEstimateDraft,
} from "./rmr";
import {
  createTdeeFromWearable,
  formatTdeeKcalPerDay,
  TDEE_EXPLANATION,
  tdeeResultSourceLabel,
  validateOnboardingGoalType,
  validateTdeeRange,
  validateWearable,
  validateWearableCalories,
  type TdeeError,
  type TdeeEstimateDraft,
} from "./tdee";
import {
  calorieTargetGoalLabel,
  calorieTargetPaceLabel,
  createCalorieTarget,
  formatLbPerWeek,
  formatPercentPerWeek,
  formatSignedKcalPerDay,
  formatTargetCaloriesPerDay,
  mapGoalToWeightChangeDirection,
  paceOptionsForGoal,
  pacePromptForGoal,
  type CalorieTargetDraft,
  type CalorieTargetError,
} from "./calorie-target";
import {
  calculateMacroTargets,
  formatMacroGrams,
  formatNutritionCalories,
  nutritionTargetExplanationRows,
  type MacroTargetDraft,
  type MacroTargetError,
} from "./macros";
import {
  addPreferenceTag,
  createMealPreferencesDraft,
  DEFAULT_VARIETY_LEVEL,
  removePreferenceTag,
  toggleCuisine,
  toggleSelection,
  validateMealPreferences,
  type MealPreferenceError,
  type MealPreferencesDraft,
} from "./meal-preferences";
import {
  applyCookingStyleChange,
  createCookingPreferencesDraft,
  DEFAULT_COOKING_STYLE,
  DEFAULT_MAX_FINISH_MINUTES,
  DEFAULT_MAX_PREP_SESSION_MINUTES,
  DEFAULT_PREP_FREQUENCY,
  DEFAULT_USE_DINNER_PREP_FOR_NEXT_LUNCH,
  isFreshEnabledCookingStyle,
  isFreshFinishMinutes,
  validateCookingPreferences,
  type CookingPreferenceError,
  type CookingPreferencesDraft,
} from "./cooking-preferences";

export type OnboardingStep =
  | "goal"
  | "wearable"
  | "wearable_calories"
  | "basics"
  | "source"
  | "dexa_details"
  | "result"
  | "pace"
  | "calorie_target"
  | "nutrition_target"
  | "cuisine"
  | "proteins"
  | "exclusions"
  | "experience"
  | "variety"
  | "prep_frequency"
  | "prep_session_time"
  | "cooking_style"
  | "finish_time"
  | "dinner_prep";

export type OnboardingDraft = {
  goalType: OnboardingGoalType | "";
  wearable: Wearable | "";
  wearableCaloriesKcal: string;
  dateOfBirth: string;
  biologicalSex: RmrBiologicalSex | "";
  heightCm: string;
  weightKg: string;
  knowsRmr: boolean | null;
  reportedRmrKcal: string;
  reportDate: string;
  pace: WeightChangePace | "";
  cuisines: CuisineValue[];
  proteinPreferences: ProteinValue[];
  allergies: string[];
  dietaryRestrictions: string[];
  dislikes: string[];
  experiencePreferences: ExperienceValue[];
  varietyLevel: VarietyLevel;
  allergyDraft: string;
  restrictionDraft: string;
  dislikeDraft: string;
  prepFrequency: PrepFrequency;
  maxPrepSessionMinutes: MaxPrepSessionMinutes;
  cookingStyle: WeeklyCookingStyle;
  maxFinishMinutes: MaxFinishMinutes;
  useDinnerPrepForNextLunch: boolean;
  rememberedMaxFinishMinutes: FreshFinishMinutes;
};

export type OnboardingResultView = {
  rmrKcal: number;
  formattedRmr: string;
  source: RmrSource;
  sourceLabel: string;
  explanation: string;
  draft: RmrEstimateDraft;
  tdeeKcal: number;
  formattedTdee: string;
  tdeeSource: TdeeSource;
  tdeeSourceLabel: string;
  tdeeExplanation: string;
  tdeeDraft: TdeeEstimateDraft;
  goalType: OnboardingGoalType;
  goalLabel: string;
};

export type CalorieTargetView = {
  formattedMaintenance: string;
  goalLabel: string;
  paceLabel: string;
  formattedTargetRate: string;
  formattedTargetCalories: string;
  explanationRows: Array<{ label: string; value: string }>;
  draft: CalorieTargetDraft;
};

export type NutritionTargetView = {
  formattedCalories: string;
  formattedProtein: string;
  formattedFat: string;
  formattedCarbohydrates: string;
  explanationRows: Array<{ label: string; value: string }>;
  draft: MacroTargetDraft;
};

export type OnboardingView = {
  step: OnboardingStep;
  draft: OnboardingDraft;
  error: string | null;
  result: OnboardingResultView | null;
  calorieTarget: CalorieTargetView | null;
  nutritionTarget: NutritionTargetView | null;
  mealPreferences: MealPreferencesDraft | null;
  cookingPreferences: CookingPreferencesDraft | null;
};

export type OnboardingError =
  | RmrError
  | TdeeError
  | CalorieTargetError
  | MacroTargetError
  | MealPreferenceError
  | CookingPreferenceError;

export function createOnboardingView(overrides: Partial<OnboardingDraft> = {}): OnboardingView {
  return {
    step: "goal",
    draft: {
      goalType: "",
      wearable: "",
      wearableCaloriesKcal: "",
      dateOfBirth: "",
      biologicalSex: "",
      heightCm: "",
      weightKg: "",
      knowsRmr: null,
      reportedRmrKcal: "",
      reportDate: "",
      pace: "",
      cuisines: [],
      proteinPreferences: [],
      allergies: [],
      dietaryRestrictions: [],
      dislikes: [],
      experiencePreferences: [],
      varietyLevel: DEFAULT_VARIETY_LEVEL,
      allergyDraft: "",
      restrictionDraft: "",
      dislikeDraft: "",
      prepFrequency: DEFAULT_PREP_FREQUENCY,
      maxPrepSessionMinutes: DEFAULT_MAX_PREP_SESSION_MINUTES,
      cookingStyle: DEFAULT_COOKING_STYLE,
      maxFinishMinutes: DEFAULT_MAX_FINISH_MINUTES,
      useDinnerPrepForNextLunch: DEFAULT_USE_DINNER_PREP_FOR_NEXT_LUNCH,
      rememberedMaxFinishMinutes: DEFAULT_MAX_FINISH_MINUTES,
      ...overrides,
    },
    error: null,
    result: null,
    calorieTarget: null,
    nutritionTarget: null,
    mealPreferences: null,
    cookingPreferences: null,
  };
}

function mealPreferencesFromDraft(draft: OnboardingDraft): MealPreferencesDraft {
  return createMealPreferencesDraft({
    cuisines: draft.cuisines,
    proteinPreferences: draft.proteinPreferences,
    allergies: draft.allergies,
    dietaryRestrictions: draft.dietaryRestrictions,
    dislikes: draft.dislikes,
    experiencePreferences: draft.experiencePreferences,
    varietyLevel: draft.varietyLevel || DEFAULT_VARIETY_LEVEL,
  });
}

function cookingPreferencesFromDraft(draft: OnboardingDraft): CookingPreferencesDraft {
  return createCookingPreferencesDraft({
    prepFrequency: draft.prepFrequency,
    maxPrepSessionMinutes: draft.maxPrepSessionMinutes,
    cookingStyle: draft.cookingStyle,
    maxFinishMinutes: draft.maxFinishMinutes,
    useDinnerPrepForNextLunch: draft.useDinnerPrepForNextLunch,
  });
}

function withCookingDraft(
  view: OnboardingView,
  prefs: CookingPreferencesDraft,
  rememberedMaxFinishMinutes: FreshFinishMinutes = view.draft.rememberedMaxFinishMinutes,
): OnboardingView {
  return {
    ...view,
    error: null,
    draft: {
      ...view.draft,
      prepFrequency: prefs.prepFrequency,
      maxPrepSessionMinutes: prefs.maxPrepSessionMinutes,
      cookingStyle: prefs.cookingStyle,
      maxFinishMinutes: prefs.maxFinishMinutes,
      useDinnerPrepForNextLunch: prefs.useDinnerPrepForNextLunch,
      rememberedMaxFinishMinutes,
    },
  };
}

function parseRequiredNumber(value: string, label: string): Result<number, OnboardingError> {
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isFinite(parsed)) {
    return err({
      code: "invalid_input",
      message: `${label} must be a positive number.`,
    });
  }
  return ok(parsed);
}

function parseBasics(draft: OnboardingDraft): Result<
  {
    dateOfBirth: string;
    biologicalSex: RmrBiologicalSex;
    heightCm: number;
    weightKg: number;
  },
  OnboardingError
> {
  if (draft.biologicalSex !== "male" && draft.biologicalSex !== "female") {
    return err({
      code: "invalid_input",
      field: "biologicalSex",
      message: "Choose male or female.",
    });
  }
  const height = parseRequiredNumber(draft.heightCm, "Height");
  if (!height.ok) {
    return height;
  }
  const weight = parseRequiredNumber(draft.weightKg, "Weight");
  if (!weight.ok) {
    return weight;
  }
  return ok({
    dateOfBirth: draft.dateOfBirth,
    biologicalSex: draft.biologicalSex,
    heightCm: height.value,
    weightKg: weight.value,
  });
}

function parseWearableCalories(draft: OnboardingDraft): Result<number, OnboardingError> {
  const wearable = validateWearable(draft.wearable);
  if (!wearable.ok) {
    return wearable;
  }
  const label = wearable.value === "whoop" ? "Average daily calories" : "Active calories";
  return parseRequiredNumber(draft.wearableCaloriesKcal, label);
}

function withError(view: OnboardingView, error: OnboardingError): OnboardingView {
  return { ...view, error: error.message };
}

function buildCalorieTargetView(
  draft: CalorieTargetDraft,
  goalType: OnboardingGoalType,
): CalorieTargetView {
  return {
    formattedMaintenance: formatTargetCaloriesPerDay(draft.tdeeKcal),
    goalLabel: calorieTargetGoalLabel(goalType),
    paceLabel: calorieTargetPaceLabel(draft.pace),
    formattedTargetRate: formatLbPerWeek(draft.targetLbPerWeek),
    formattedTargetCalories: formatTargetCaloriesPerDay(draft.targetCalories),
    explanationRows: [
      {
        label: "Current weight",
        value: `${draft.bodyWeightKg.toFixed(1)} kg (${draft.bodyWeightLb.toFixed(1)} lb)`,
      },
      { label: "Selected rate", value: `${formatPercentPerWeek(draft.targetRatePerWeek)} / week` },
      { label: "Target change", value: formatLbPerWeek(draft.targetLbPerWeek) },
      { label: "Daily calorie adjustment", value: formatSignedKcalPerDay(draft.dailyCalorieAdjustment) },
      { label: "TDEE", value: formatTargetCaloriesPerDay(draft.tdeeKcal) },
      { label: "Target calories", value: formatTargetCaloriesPerDay(draft.targetCalories) },
    ],
    draft,
  };
}

function buildNutritionTargetView(draft: MacroTargetDraft): NutritionTargetView {
  return {
    formattedCalories: formatNutritionCalories(draft.targetCalories),
    formattedProtein: formatMacroGrams(draft.proteinGrams),
    formattedFat: formatMacroGrams(draft.fatGrams),
    formattedCarbohydrates: formatMacroGrams(draft.carbohydrateGrams),
    explanationRows: nutritionTargetExplanationRows(),
    draft,
  };
}

function withCalorieTarget(
  view: OnboardingView,
  calorieDraft: CalorieTargetDraft,
  goalType: OnboardingGoalType,
): OnboardingView {
  return {
    ...view,
    step: "calorie_target",
    error: null,
    calorieTarget: buildCalorieTargetView(calorieDraft, goalType),
  };
}

function withNutritionTarget(view: OnboardingView, draft: MacroTargetDraft): OnboardingView {
  return {
    ...view,
    step: "nutrition_target",
    error: null,
    nutritionTarget: buildNutritionTargetView(draft),
  };
}

function withResult(
  view: OnboardingView,
  rmr: RmrEstimateDraft,
  tdee: TdeeEstimateDraft,
  goalType: OnboardingGoalType,
): OnboardingView {
  return {
    ...view,
    step: "result",
    error: null,
    result: {
      rmrKcal: rmr.rmrKcal,
      formattedRmr: formatRmrKcalPerDay(rmr.rmrKcal),
      source: rmr.source,
      sourceLabel: rmrResultSourceLabel(rmr.source),
      explanation: RMR_EXPLANATION,
      draft: rmr,
      tdeeKcal: tdee.tdeeKcal,
      formattedTdee: formatTdeeKcalPerDay(tdee.tdeeKcal),
      tdeeSource: tdee.source,
      tdeeSourceLabel: tdeeResultSourceLabel(tdee.source),
      tdeeExplanation: TDEE_EXPLANATION,
      tdeeDraft: tdee,
      goalType,
      goalLabel: onboardingGoalLabel(goalType),
    },
  };
}

function finishOnboardingResult(view: OnboardingView, rmr: RmrEstimateDraft, asOf: Date): OnboardingView {
  const goal = validateOnboardingGoalType(view.draft.goalType);
  if (!goal.ok) {
    return withError(view, goal.error);
  }
  const wearable = validateWearable(view.draft.wearable);
  if (!wearable.ok) {
    return withError(view, wearable.error);
  }
  const calories = parseWearableCalories(view.draft);
  if (!calories.ok) {
    return withError(view, calories.error);
  }
  const tdee = createTdeeFromWearable({
    wearable: wearable.value,
    wearableCaloriesKcal: calories.value,
    rmrKcal: rmr.rmrKcal,
    rmrSource: rmr.source,
    goalType: goal.value,
    asOf,
  });
  if (!tdee.ok) {
    return withError(view, tdee.error);
  }
  return withResult(view, rmr, tdee.value, goal.value);
}

export function submitOnboardingGoal(view: OnboardingView, goalType: OnboardingGoalType): OnboardingView {
  const goal = validateOnboardingGoalType(goalType);
  if (!goal.ok) {
    return withError(view, goal.error);
  }
  return {
    ...view,
    step: "wearable",
    error: null,
    draft: { ...view.draft, goalType: goal.value },
  };
}

export function chooseOnboardingWearable(view: OnboardingView, wearable: Wearable): OnboardingView {
  const parsed = validateWearable(wearable);
  if (!parsed.ok) {
    return withError(view, parsed.error);
  }
  return {
    ...view,
    step: "wearable_calories",
    error: null,
    draft: { ...view.draft, wearable: parsed.value },
  };
}

export function submitOnboardingWearableCalories(view: OnboardingView): OnboardingView {
  const calories = parseWearableCalories(view.draft);
  if (!calories.ok) {
    return withError(view, calories.error);
  }
  const ranged = validateWearableCalories(calories.value);
  if (!ranged.ok) {
    return withError(view, ranged.error);
  }
  if (view.draft.wearable === "whoop") {
    const whoopTdee = validateTdeeRange(ranged.value);
    if (!whoopTdee.ok) {
      return withError(view, whoopTdee.error);
    }
  }
  return { ...view, step: "basics", error: null };
}

export function submitOnboardingBasics(
  view: OnboardingView,
  asOf: Date = new Date(),
): OnboardingView {
  const basics = parseBasics(view.draft);
  if (!basics.ok) {
    return withError(view, basics.error);
  }
  const preview = createEstimatedRmr({ ...basics.value, asOf });
  if (!preview.ok) {
    return withError(view, preview.error);
  }
  return { ...view, step: "source", error: null };
}

export function chooseOnboardingRmrSource(
  view: OnboardingView,
  knowsRmr: boolean,
  asOf: Date = new Date(),
): OnboardingView {
  const next: OnboardingView = {
    ...view,
    draft: { ...view.draft, knowsRmr },
    error: null,
  };
  if (knowsRmr) {
    return { ...next, step: "dexa_details" };
  }

  const basics = parseBasics(next.draft);
  if (!basics.ok) {
    return withError(next, basics.error);
  }
  const estimated = createEstimatedRmr({ ...basics.value, asOf });
  if (!estimated.ok) {
    return withError(next, estimated.error);
  }
  return finishOnboardingResult(next, estimated.value, asOf);
}

export function submitOnboardingDexa(
  view: OnboardingView,
  asOf: Date = new Date(),
): OnboardingView {
  const basics = parseBasics(view.draft);
  if (!basics.ok) {
    return withError(view, basics.error);
  }
  const rmr = parseRequiredNumber(view.draft.reportedRmrKcal, "RMR");
  if (!rmr.ok) {
    return withError(view, rmr.error);
  }
  const reported = createUserReportedRmr({
    rmrKcal: rmr.value,
    reportDate: view.draft.reportDate,
    asOf,
  });
  if (!reported.ok) {
    return withError(view, reported.error);
  }
  return finishOnboardingResult(
    { ...view, draft: { ...view.draft, knowsRmr: true } },
    reported.value,
    asOf,
  );
}

export { paceOptionsForGoal, pacePromptForGoal };

export function continueFromEnergyResult(
  view: OnboardingView,
  asOf: Date = new Date(),
): OnboardingView {
  if (!view.result) {
    return withError(view, {
      code: "invalid_input",
      message: "Establish RMR and TDEE before choosing a pace.",
    });
  }
  const direction = mapGoalToWeightChangeDirection(view.draft.goalType);
  if (!direction.ok) {
    return withError(view, direction.error);
  }
  if (direction.value === "maintenance") {
    return chooseOnboardingPace(view, "recommended", asOf);
  }
  return {
    ...view,
    step: "pace",
    error: null,
  };
}

export function chooseOnboardingPace(
  view: OnboardingView,
  pace: WeightChangePace,
  asOf: Date = new Date(),
): OnboardingView {
  if (!view.result) {
    return withError(view, {
      code: "invalid_input",
      message: "Establish RMR and TDEE before choosing a pace.",
    });
  }
  const goal = validateOnboardingGoalType(view.draft.goalType);
  if (!goal.ok) {
    return withError(view, goal.error);
  }
  const weight = parseRequiredNumber(view.draft.weightKg, "Weight");
  if (!weight.ok) {
    return withError(view, weight.error);
  }
  const created = createCalorieTarget({
    goalType: goal.value,
    pace,
    weightKg: weight.value,
    tdeeKcal: view.result.tdeeKcal,
    asOf,
  });
  if (!created.ok) {
    return withError(view, created.error);
  }
  return withCalorieTarget(
    { ...view, draft: { ...view.draft, pace } },
    created.value,
    goal.value,
  );
}

export function continueFromCalorieTarget(
  view: OnboardingView,
  asOf: Date = new Date(),
): OnboardingView {
  if (!view.calorieTarget) {
    return withError(view, {
      code: "invalid_calorie_target",
      message: "Establish a daily calorie target before calculating macros.",
    });
  }
  const created = calculateMacroTargets({
    targetCalories: view.calorieTarget.draft.targetCalories,
    weightKg: view.calorieTarget.draft.bodyWeightKg,
    asOf,
  });
  if (!created.ok) {
    return withError(view, created.error);
  }
  return withNutritionTarget(view, created.value);
}

export function continueFromNutritionTarget(view: OnboardingView): OnboardingView {
  if (!view.nutritionTarget) {
    return withError(view, {
      code: "invalid_input",
      message: "Establish a nutrition target before collecting food preferences.",
    });
  }
  return startMealPreferencesOnboarding(view);
}

export function startMealPreferencesOnboarding(
  view: OnboardingView,
  existing?: Partial<MealPreferencesDraft> | MealPreferences | null,
): OnboardingView {
  const prefs = createMealPreferencesDraft({
    cuisines: view.draft.cuisines,
    proteinPreferences: view.draft.proteinPreferences,
    allergies: view.draft.allergies,
    dietaryRestrictions: view.draft.dietaryRestrictions,
    dislikes: view.draft.dislikes,
    experiencePreferences: view.draft.experiencePreferences,
    varietyLevel: view.draft.varietyLevel,
    ...existing,
  });
  return {
    ...view,
    step: "cuisine",
    error: null,
    mealPreferences: null,
    draft: {
      ...view.draft,
      cuisines: prefs.cuisines,
      proteinPreferences: prefs.proteinPreferences,
      allergies: prefs.allergies,
      dietaryRestrictions: prefs.dietaryRestrictions,
      dislikes: prefs.dislikes,
      experiencePreferences: prefs.experiencePreferences,
      varietyLevel: prefs.varietyLevel,
      allergyDraft: "",
      restrictionDraft: "",
      dislikeDraft: "",
    },
  };
}

export function toggleOnboardingCuisine(view: OnboardingView, value: CuisineValue): OnboardingView {
  return {
    ...view,
    error: null,
    draft: { ...view.draft, cuisines: toggleCuisine(view.draft.cuisines, value) },
  };
}

export function continueFromCuisine(view: OnboardingView): OnboardingView {
  const validated = validateMealPreferences(mealPreferencesFromDraft(view.draft));
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return { ...view, step: "proteins", error: null };
}

export function toggleOnboardingProtein(view: OnboardingView, value: ProteinValue): OnboardingView {
  return {
    ...view,
    error: null,
    draft: {
      ...view.draft,
      proteinPreferences: toggleSelection(view.draft.proteinPreferences, value),
    },
  };
}

export function continueFromProteins(view: OnboardingView): OnboardingView {
  const validated = validateMealPreferences(mealPreferencesFromDraft(view.draft));
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return { ...view, step: "exclusions", error: null };
}

export function addOnboardingAllergy(view: OnboardingView): OnboardingView {
  const added = addPreferenceTag(view.draft.allergies, view.draft.allergyDraft);
  if (!added.ok) {
    return withError(view, { ...added.error, field: "allergies" });
  }
  return {
    ...view,
    error: null,
    draft: { ...view.draft, allergies: added.value, allergyDraft: "" },
  };
}

export function addOnboardingRestriction(view: OnboardingView): OnboardingView {
  const added = addPreferenceTag(view.draft.dietaryRestrictions, view.draft.restrictionDraft);
  if (!added.ok) {
    return withError(view, { ...added.error, field: "dietaryRestrictions" });
  }
  return {
    ...view,
    error: null,
    draft: { ...view.draft, dietaryRestrictions: added.value, restrictionDraft: "" },
  };
}

export function addOnboardingDislike(view: OnboardingView): OnboardingView {
  const added = addPreferenceTag(view.draft.dislikes, view.draft.dislikeDraft);
  if (!added.ok) {
    return withError(view, { ...added.error, field: "dislikes" });
  }
  return {
    ...view,
    error: null,
    draft: { ...view.draft, dislikes: added.value, dislikeDraft: "" },
  };
}

export function removeOnboardingAllergy(view: OnboardingView, value: string): OnboardingView {
  return {
    ...view,
    error: null,
    draft: { ...view.draft, allergies: removePreferenceTag(view.draft.allergies, value) },
  };
}

export function removeOnboardingRestriction(view: OnboardingView, value: string): OnboardingView {
  return {
    ...view,
    error: null,
    draft: {
      ...view.draft,
      dietaryRestrictions: removePreferenceTag(view.draft.dietaryRestrictions, value),
    },
  };
}

export function removeOnboardingDislike(view: OnboardingView, value: string): OnboardingView {
  return {
    ...view,
    error: null,
    draft: { ...view.draft, dislikes: removePreferenceTag(view.draft.dislikes, value) },
  };
}

export function continueFromExclusions(view: OnboardingView): OnboardingView {
  const validated = validateMealPreferences(mealPreferencesFromDraft(view.draft));
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return { ...view, step: "experience", error: null };
}

export function toggleOnboardingExperience(
  view: OnboardingView,
  value: ExperienceValue,
): OnboardingView {
  return {
    ...view,
    error: null,
    draft: {
      ...view.draft,
      experiencePreferences: toggleSelection(view.draft.experiencePreferences, value),
    },
  };
}

export function continueFromExperience(view: OnboardingView): OnboardingView {
  const validated = validateMealPreferences(mealPreferencesFromDraft(view.draft));
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return { ...view, step: "variety", error: null };
}

export function chooseOnboardingVariety(
  view: OnboardingView,
  varietyLevel: VarietyLevel,
): OnboardingView {
  const validated = validateMealPreferences({
    ...mealPreferencesFromDraft(view.draft),
    varietyLevel,
  });
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return {
    ...view,
    error: null,
    draft: { ...view.draft, varietyLevel: validated.value.varietyLevel },
  };
}

export function continueFromVariety(view: OnboardingView): OnboardingView {
  const validated = validateMealPreferences(mealPreferencesFromDraft(view.draft));
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return startCookingPreferencesOnboarding({
    ...view,
    error: null,
    mealPreferences: validated.value,
  });
}

export function startCookingPreferencesOnboarding(
  view: OnboardingView,
  existing?: Partial<CookingPreferencesDraft> | CookingPreferences | null,
): OnboardingView {
  const prefs = createCookingPreferencesDraft({
    prepFrequency: view.draft.prepFrequency,
    maxPrepSessionMinutes: view.draft.maxPrepSessionMinutes,
    cookingStyle: view.draft.cookingStyle,
    maxFinishMinutes: view.draft.maxFinishMinutes,
    useDinnerPrepForNextLunch: view.draft.useDinnerPrepForNextLunch,
    ...existing,
  });
  const remembered = isFreshFinishMinutes(prefs.maxFinishMinutes)
    ? prefs.maxFinishMinutes
    : view.draft.rememberedMaxFinishMinutes;
  return {
    ...withCookingDraft(view, prefs, remembered),
    step: "prep_frequency",
    cookingPreferences: null,
  };
}

export function chooseOnboardingPrepFrequency(
  view: OnboardingView,
  prepFrequency: PrepFrequency,
): OnboardingView {
  const validated = validateCookingPreferences({
    ...cookingPreferencesFromDraft(view.draft),
    prepFrequency,
  });
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return withCookingDraft(view, validated.value);
}

export function continueFromPrepFrequency(view: OnboardingView): OnboardingView {
  const validated = validateCookingPreferences(cookingPreferencesFromDraft(view.draft));
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return {
    ...withCookingDraft(view, validated.value),
    step: "prep_session_time",
  };
}

export function chooseOnboardingPrepSessionTime(
  view: OnboardingView,
  maxPrepSessionMinutes: MaxPrepSessionMinutes,
): OnboardingView {
  const validated = validateCookingPreferences({
    ...cookingPreferencesFromDraft(view.draft),
    maxPrepSessionMinutes,
  });
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return withCookingDraft(view, validated.value);
}

export function continueFromPrepSessionTime(view: OnboardingView): OnboardingView {
  const validated = validateCookingPreferences(cookingPreferencesFromDraft(view.draft));
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return {
    ...withCookingDraft(view, validated.value),
    step: "cooking_style",
  };
}

export function chooseOnboardingCookingStyle(
  view: OnboardingView,
  cookingStyle: WeeklyCookingStyle,
): OnboardingView {
  const changed = applyCookingStyleChange({
    current: cookingPreferencesFromDraft(view.draft),
    nextStyle: cookingStyle,
    rememberedMaxFinishMinutes: view.draft.rememberedMaxFinishMinutes,
  });
  const validated = validateCookingPreferences(changed.draft);
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return withCookingDraft(view, validated.value, changed.rememberedMaxFinishMinutes);
}

export function continueFromCookingStyle(view: OnboardingView): OnboardingView {
  const validated = validateCookingPreferences(cookingPreferencesFromDraft(view.draft));
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  if (!isFreshEnabledCookingStyle(validated.value.cookingStyle)) {
    return {
      ...withCookingDraft(view, validated.value),
      cookingPreferences: validated.value,
    };
  }
  return {
    ...withCookingDraft(view, validated.value),
    step: "finish_time",
  };
}

export function chooseOnboardingFinishTime(
  view: OnboardingView,
  maxFinishMinutes: MaxFinishMinutes,
): OnboardingView {
  const validated = validateCookingPreferences({
    ...cookingPreferencesFromDraft(view.draft),
    maxFinishMinutes,
  });
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  const remembered =
    validated.value.maxFinishMinutes === 0
      ? view.draft.rememberedMaxFinishMinutes
      : (validated.value.maxFinishMinutes as FreshFinishMinutes);
  return withCookingDraft(view, validated.value, remembered);
}

export function continueFromFinishTime(view: OnboardingView): OnboardingView {
  const validated = validateCookingPreferences(cookingPreferencesFromDraft(view.draft));
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return {
    ...withCookingDraft(view, validated.value),
    step: "dinner_prep",
  };
}

export function chooseOnboardingDinnerPrep(
  view: OnboardingView,
  useDinnerPrepForNextLunch: boolean,
): OnboardingView {
  const validated = validateCookingPreferences({
    ...cookingPreferencesFromDraft(view.draft),
    useDinnerPrepForNextLunch,
  });
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return withCookingDraft(view, validated.value);
}

export function continueFromDinnerPrep(view: OnboardingView): OnboardingView {
  const validated = validateCookingPreferences(cookingPreferencesFromDraft(view.draft));
  if (!validated.ok) {
    return withError(view, validated.error);
  }
  return {
    ...withCookingDraft(view, validated.value),
    cookingPreferences: validated.value,
  };
}

export function completeOnboarding(input: {
  dateOfBirth: string;
  biologicalSex: RmrBiologicalSex;
  heightCm: number;
  weightKg: number;
  source: RmrSource;
  reportedRmrKcal?: number;
  reportDate?: string;
  goalType: OnboardingGoalType;
  wearable: Wearable;
  wearableCaloriesKcal: number;
  pace?: WeightChangePace;
  mealPreferences?: MealPreferencesInput;
  cookingPreferences?: CookingPreferencesInput;
  asOf?: Date;
}): Result<
  {
    profile: {
      dateOfBirth: string;
      biologicalSex: RmrBiologicalSex;
      heightCm: number;
      weightKg: number;
    };
    rmr: RmrEstimateDraft;
    tdee: TdeeEstimateDraft;
    goalType: OnboardingGoalType;
    calorieTarget: CalorieTargetDraft;
    nutritionTarget: MacroTargetDraft;
    mealPreferences: MealPreferencesDraft;
    cookingPreferences: CookingPreferencesDraft;
  },
  OnboardingError
> {
  const asOf = input.asOf ?? new Date();
  const goal = validateOnboardingGoalType(input.goalType);
  if (!goal.ok) {
    return goal;
  }
  const wearable = validateWearable(input.wearable);
  if (!wearable.ok) {
    return wearable;
  }
  const rmrCompleted = completeRmrOnboarding({
    dateOfBirth: input.dateOfBirth,
    biologicalSex: input.biologicalSex,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    source: input.source,
    reportedRmrKcal: input.reportedRmrKcal,
    reportDate: input.reportDate,
    asOf,
  });
  if (!rmrCompleted.ok) {
    return rmrCompleted;
  }
  const tdee = createTdeeFromWearable({
    wearable: wearable.value,
    wearableCaloriesKcal: input.wearableCaloriesKcal,
    rmrKcal: rmrCompleted.value.rmr.rmrKcal,
    rmrSource: rmrCompleted.value.rmr.source,
    goalType: goal.value,
    asOf,
  });
  if (!tdee.ok) {
    return tdee;
  }
  const direction = mapGoalToWeightChangeDirection(goal.value);
  if (!direction.ok) {
    return direction;
  }
  const pace: WeightChangePace =
    direction.value === "maintenance" ? "recommended" : (input.pace ?? "recommended");
  const calorieTarget = createCalorieTarget({
    goalType: goal.value,
    pace,
    weightKg: input.weightKg,
    tdeeKcal: tdee.value.tdeeKcal,
    asOf,
  });
  if (!calorieTarget.ok) {
    return calorieTarget;
  }
  const nutritionTarget = calculateMacroTargets({
    targetCalories: calorieTarget.value.targetCalories,
    weightKg: input.weightKg,
    asOf,
  });
  if (!nutritionTarget.ok) {
    return nutritionTarget;
  }
  const mealPreferences = validateMealPreferences(
    createMealPreferencesDraft(input.mealPreferences),
  );
  if (!mealPreferences.ok) {
    return mealPreferences;
  }
  const cookingPreferences = validateCookingPreferences(
    createCookingPreferencesDraft(input.cookingPreferences),
  );
  if (!cookingPreferences.ok) {
    return cookingPreferences;
  }
  return ok({
    profile: rmrCompleted.value.profile,
    rmr: rmrCompleted.value.rmr,
    tdee: tdee.value,
    goalType: goal.value,
    calorieTarget: calorieTarget.value,
    nutritionTarget: nutritionTarget.value,
    mealPreferences: mealPreferences.value,
    cookingPreferences: cookingPreferences.value,
  });
}
