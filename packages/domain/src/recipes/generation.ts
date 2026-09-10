import type {
  RecipeCandidate,
  RecipeGenerationRequest,
} from "@fitness-autopilot/contracts";
import {
  RecipeCandidateSchema,
  RecipeGenerationRequestSchema,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";

export const RECIPE_GENERATION_PROMPT_VERSION = "recipe-generation-v1" as const;

export type RecipeGenerationErrorCode =
  | "LLM_CONFIGURATION_ERROR"
  | "LLM_PROVIDER_ERROR"
  | "LLM_INVALID_STRUCTURED_OUTPUT"
  | "RECIPE_SCHEMA_VALIDATION_FAILED"
  | "INVALID_GENERATION_REQUEST";

export type RecipeGenerationError = {
  code: RecipeGenerationErrorCode;
  message: string;
  details?: unknown;
};

/**
 * Provider-independent recipe generator.
 * Implementations (Gemini, OpenAI, Anthropic) live outside domain packages.
 * Always produces exactly one RecipeCandidate per call.
 */
export interface RecipeGenerator {
  generateRecipe(request: RecipeGenerationRequest): Promise<RecipeCandidate>;
}

export type RecipeGenerationPrompt = {
  version: typeof RECIPE_GENERATION_PROMPT_VERSION;
  systemInstruction: string;
  userPrompt: string;
};

const VARIETY_CONTEXT: Record<
  NonNullable<RecipeGenerationRequest["varietyLevel"]>,
  string
> = {
  simple:
    "Prefer approachable dishes; weekly planning may repeat flavors later. Still return exactly one recipe.",
  balanced:
    "Aim for meaningful flavor without excessive prep complexity. Still return exactly one recipe.",
  high: "Prefer a distinct flavor experience. Still return exactly one recipe — do not invent a weekly set.",
};

const COOKING_STYLE_CONTEXT: Record<string, string> = {
  mostly_ready:
    "Favor dishes that batch well and reheat cleanly with minimal weekday cooking.",
  ready_lunch_fresh_dinner:
    "For dinner/lunch, favor recipes that can finish fresh in a short window when maxFinishMinutes is set.",
  fresh_focused:
    "Favor component-friendly recipes that cook fresh from prepped ingredients.",
};

export function parseRecipeGenerationRequest(
  input: unknown,
): Result<RecipeGenerationRequest, RecipeGenerationError> {
  const parsed = RecipeGenerationRequestSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_GENERATION_REQUEST",
      message: parsed.error.issues[0]?.message ?? "Invalid recipe generation request.",
      details: parsed.error.flatten(),
    });
  }
  return ok(parsed.data);
}

export function validateRecipeCandidate(
  input: unknown,
): Result<RecipeCandidate, RecipeGenerationError> {
  const parsed = RecipeCandidateSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "RECIPE_SCHEMA_VALIDATION_FAILED",
      message: parsed.error.issues[0]?.message ?? "Recipe candidate failed schema validation.",
      details: parsed.error.flatten(),
    });
  }
  return ok(parsed.data);
}

/**
 * Strip any model-invented nutrition fields so callers never treat AI macros as truth.
 */
export function stripNonAuthoritativeNutrition(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = { ...(value as Record<string, unknown>) };
  const banned = [
    "calories",
    "caloriesKcal",
    "targetCalories",
    "proteinG",
    "proteinGrams",
    "carbsG",
    "carbohydrateG",
    "fatG",
    "macros",
    "nutrition",
    "nutritionTotals",
    "estimatedCalories",
    "estimatedProteinGrams",
  ];
  for (const key of banned) {
    delete record[key];
  }
  if (Array.isArray(record.ingredients)) {
    record.ingredients = record.ingredients.map((ingredient) => {
      if (ingredient === null || typeof ingredient !== "object") {
        return ingredient;
      }
      const next = { ...(ingredient as Record<string, unknown>) };
      for (const key of banned) {
        delete next[key];
      }
      return next;
    });
  }
  return record;
}

function listOrNone(values: readonly string[] | undefined): string {
  if (!values || values.length === 0) {
    return "(none specified)";
  }
  return values.join(", ");
}

export function buildRecipeGenerationPrompt(
  request: RecipeGenerationRequest,
): RecipeGenerationPrompt {
  const varietyNote = request.varietyLevel
    ? VARIETY_CONTEXT[request.varietyLevel]
    : "Variety intent not specified. Return exactly one recipe.";

  const cookingStyle =
    typeof request.cookingStyle === "string" ? request.cookingStyle : undefined;
  const cookingNote = cookingStyle
    ? COOKING_STYLE_CONTEXT[cookingStyle] ??
      `Honor cooking style preference: ${cookingStyle}.`
    : "No cooking-style preference specified.";

  const finishNote =
    request.maxFinishMinutes === undefined
      ? "No explicit finish-time limit."
      : request.maxFinishMinutes === 0
        ? "Prefer mostly-ready / reheatable preparation (0-minute finish)."
        : `Prefer a recipe that can finish in about ${request.maxFinishMinutes} minutes for a fresh cook/finish when realistic.`;

  const systemInstruction = [
    "You are Fitness Autopilot's recipe generator.",
    "Return exactly ONE complete recipe as structured JSON matching the schema.",
    "Never return a weekly plan, multiple recipes, or a recipe count derived from varietyLevel.",
    "",
    "Culinary quality:",
    "- Create food people genuinely want to eat: recognizable, flavorful, texturally satisfying.",
    "- Include sauces, chutneys, marinades, gravies, dressings, and seasoning mixes when the dish needs them.",
    "- Use specific dish names (e.g. Chicken Tikka Rice Bowl with Mint-Yogurt Chutney), not vague fitness names.",
    "- Avoid plain grilled chicken + plain rice + steamed broccoli unless explicitly requested.",
    "- Keep ingredients accessible and instructions concise but complete.",
    "",
    "Hard constraints:",
    "- Allergies and dietaryRestrictions are absolute exclusions.",
    "- Strongly avoid disliked foods.",
    "- Cuisine, protein, and experience preferences are soft ranking signals — do not invent preferences the user did not provide.",
    "",
    "Ingredients:",
    "- Every nutritionally meaningful ingredient needs name, quantityGrams (> 0), and measurementState (raw|cooked|as_packaged).",
    "- Include oils, sauces, cheese, yogurt, honey, nuts, and seasonings with gram quantities when practical.",
    "- No vague quantities (some, handful, as needed, 1 breast).",
    "",
    "Nutrition guidance:",
    "- targetCalories and targetProteinGrams are approximate guidance only.",
    "- Do NOT output calories, macros, or nutrition totals. A later deterministic pipeline will resolve USDA nutrition and portions.",
    "",
    `Prompt version: ${RECIPE_GENERATION_PROMPT_VERSION}`,
  ].join("\n");

  const userPrompt = [
    "Generate one recipe with these preferences:",
    `mealType: ${request.mealType}`,
    `targetCalories: ${request.targetCalories ?? "(not specified)"}`,
    `targetProteinGrams: ${request.targetProteinGrams ?? "(not specified)"}`,
    `cuisines: ${listOrNone(request.cuisines)}`,
    `proteinPreferences: ${listOrNone(request.proteinPreferences)}`,
    `experiencePreferences: ${listOrNone(request.experiencePreferences)}`,
    `allergies (hard exclude): ${listOrNone(request.allergies)}`,
    `dietaryRestrictions (hard exclude): ${listOrNone(request.dietaryRestrictions)}`,
    `dislikes (strongly avoid): ${listOrNone(request.dislikes)}`,
    `varietyLevel: ${request.varietyLevel ?? "(not specified)"}`,
    `varietyLevel guidance: ${varietyNote}`,
    `cookingStyle: ${cookingStyle ?? "(not specified)"}`,
    `cookingStyle guidance: ${cookingNote}`,
    `maxFinishMinutes: ${request.maxFinishMinutes ?? "(not specified)"}`,
    `finish-time guidance: ${finishNote}`,
    "",
    "Return exactly one RecipeCandidate. Do not include nutrition fields.",
  ].join("\n");

  return {
    version: RECIPE_GENERATION_PROMPT_VERSION,
    systemInstruction,
    userPrompt,
  };
}

export function recipeGenerationError(
  code: RecipeGenerationErrorCode,
  message: string,
  details?: unknown,
): RecipeGenerationError {
  return details === undefined ? { code, message } : { code, message, details };
}
