import type { RecipeResolutionRequest, ResolvedRecipe } from "@fitness-autopilot/contracts";
import { RECIPE_RESOLUTION_PROMPT_VERSION } from "@fitness-autopilot/contracts";
import {
  buildRecipeResolutionPrompt,
  parseRecipeResolutionRequest,
  recipeResolutionError,
  stripResolvedRecipeNutrition,
  validateResolvedRecipe,
  type RecipeResolutionError,
  type RecipeResolver,
} from "@fitness-autopilot/domain";
import type { GeminiContentClient } from "./client";
import { extractJsonObjectFromModelText } from "./culinary-discovery-provider";
import { geminiResolvedRecipeResponseJsonSchema } from "./recipe-resolution-schema";
import { classifyGeminiProviderError, withGeminiRetries } from "./retry";

export type RecipeResolutionLogEvent = {
  provider: "gemini";
  model: string;
  promptVersion: typeof RECIPE_RESOLUTION_PROMPT_VERSION;
  requestId: string;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  candidateId?: string;
  candidateName?: string;
  searchGrounded?: boolean;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

export type GeminiRecipeResolverOptions = {
  model: string;
  client: GeminiContentClient;
  requestIdFactory?: () => string;
  now?: () => number;
  onLog?: (event: RecipeResolutionLogEvent) => void;
  /** Use Google Search grounding for source-backed candidates (default true). */
  enableSearchGrounding?: boolean;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

function createRequestId(): string {
  return `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeLogMessage(message: string): string {
  return message
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted-api-key]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

function coerceMealComponentType(value: unknown): string {
  if (typeof value !== "string") return "other";
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    main: "main",
    protein: "main",
    dish: "main",
    entree: "main",
    entrée: "main",
    carb_side: "carb_side",
    carb: "carb_side",
    carbohydrate: "carb_side",
    grain: "carb_side",
    rice: "carb_side",
    bread: "carb_side",
    tortilla: "carb_side",
    noodles: "carb_side",
    vegetable_side: "vegetable_side",
    vegetable: "vegetable_side",
    veg: "vegetable_side",
    salad: "vegetable_side",
    side: "vegetable_side",
    sides: "vegetable_side",
    sauce: "sauce",
    condiment: "condiment",
    chutney: "condiment",
    salsa: "condiment",
    crema: "condiment",
    garnish: "garnish",
    other: "other",
  };
  return aliases[normalized] ?? "other";
}

function coerceMealComponentRelationship(value: unknown, required: unknown): string {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (normalized === "intrinsic" || normalized === "core" || normalized === "essential") {
      return "intrinsic";
    }
    if (
      normalized === "recommended_side" ||
      normalized === "recommended" ||
      normalized === "side" ||
      normalized === "meal_completion"
    ) {
      return "recommended_side";
    }
    if (normalized === "optional") {
      return "optional";
    }
  }
  return required === false ? "optional" : "recommended_side";
}

/** Map Gemini prep-mode aliases onto canonical PrepIntent values. */
export function coerceRecipePrepMode(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    return "fresh";
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    fully_prepped: "fully_prepped",
    fully_cooked: "fully_prepped",
    fully_cooked_meal_prep: "fully_prepped",
    fully_prepped_meal: "fully_prepped",
    meal_prep: "fully_prepped",
    mealprep: "fully_prepped",
    batch_cooked: "fully_prepped",
    reheated: "fully_prepped",
    leftover: "fully_prepped",
    leftovers: "fully_prepped",
    component_prepped: "component_prepped",
    component_prep: "component_prepped",
    components_prepped: "component_prepped",
    prep_components: "component_prepped",
    prepped_components: "component_prepped",
    mise_en_place: "component_prepped",
    quick_fresh_finish: "quick_fresh_finish",
    quick_fresh: "quick_fresh_finish",
    quick_finish: "quick_fresh_finish",
    fresh_finish: "quick_fresh_finish",
    assemble_finish: "quick_fresh_finish",
    fresh: "fresh",
    fresh_only: "fresh",
    cook_fresh: "fresh",
    from_scratch: "fresh",
    made_to_order: "fresh",
  };
  return aliases[normalized] ?? "fresh";
}

function coerceIngredientRole(value: unknown): string {
  if (typeof value !== "string") return "other";
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    protein: "protein",
    carbohydrate: "carb",
    carbohydrates: "carb",
    carb: "carb",
    carbs: "carb",
    starch: "carb",
    grain: "carb",
    fat: "fat",
    oil: "fat",
    vegetable: "vegetable",
    veg: "vegetable",
    veggies: "vegetable",
    sauce: "sauce",
    seasoning: "seasoning",
    spice: "seasoning",
    spices: "seasoning",
    aromatic: "aromatic",
    aromatics: "aromatic",
    acid: "acid",
    acidity: "acid",
    garnish: "garnish",
    other: "other",
  };
  return aliases[normalized] ?? "other";
}

function coerceScalingBehavior(value: unknown): string {
  if (typeof value !== "string") return "fixed";
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    primary_scalable: "primary_scalable",
    primary: "primary_scalable",
    scalable: "primary_scalable",
    scale: "primary_scalable",
    secondary_scalable: "secondary_scalable",
    secondary: "secondary_scalable",
    ratio_bound: "ratio_bound",
    ratio: "ratio_bound",
    proportional: "ratio_bound",
    bound: "ratio_bound",
    fixed: "fixed",
    constant: "fixed",
    none: "fixed",
  };
  return aliases[normalized] ?? "fixed";
}

export function coerceResolvedRecipePayload(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = { ...(value as Record<string, unknown>) };
  if (Array.isArray(record.ingredients)) {
    record.ingredients = record.ingredients.map((item, index) => {
      if (item === null || typeof item !== "object") return item;
      const ingredient = { ...(item as Record<string, unknown>) };
      if (typeof ingredient.ingredientId !== "string" || ingredient.ingredientId.trim() === "") {
        ingredient.ingredientId = `ingredient_${index + 1}`;
      }
      if (ingredient.preparation === undefined) {
        ingredient.preparation = null;
      }
      ingredient.role = coerceIngredientRole(ingredient.role);
      ingredient.scalingBehavior = coerceScalingBehavior(ingredient.scalingBehavior);
      return ingredient;
    });
  }
  if (Array.isArray(record.instructions)) {
    record.instructions = record.instructions.map((item, index) => {
      if (typeof item === "string") {
        return { stepNumber: index + 1, text: item };
      }
      if (item === null || typeof item !== "object") return item;
      const step = { ...(item as Record<string, unknown>) };
      if (typeof step.stepNumber !== "number") {
        step.stepNumber = index + 1;
      }
      return step;
    });
  }
  if (Array.isArray(record.supportedPrepModes)) {
    record.supportedPrepModes = record.supportedPrepModes.map((item) => {
      if (item === null || typeof item !== "object") return item;
      const mode = { ...(item as Record<string, unknown>) };
      if (!Array.isArray(mode.advanceTasks)) mode.advanceTasks = [];
      if (!Array.isArray(mode.finishTasks) || mode.finishTasks.length === 0) {
        mode.finishTasks = ["Finish and serve"];
      }
      mode.mode = coerceRecipePrepMode(mode.mode);
      if (typeof mode.finishTimeMinutes !== "number" || !Number.isFinite(mode.finishTimeMinutes)) {
        mode.finishTimeMinutes = 15;
      }
      return mode;
    });
  } else {
    record.supportedPrepModes = [
      {
        mode: "fresh",
        advanceTasks: [],
        finishTasks: ["Cook and serve"],
        finishTimeMinutes: 30,
      },
    ];
  }
  if (Array.isArray(record.mealComponents)) {
    record.mealComponents = record.mealComponents.map((item, index) => {
      if (item === null || typeof item !== "object") return item;
      const component = { ...(item as Record<string, unknown>) };
      if (typeof component.componentId !== "string" || component.componentId.trim() === "") {
        component.componentId = `component_${index + 1}`;
      }
      component.type = coerceMealComponentType(component.type);
      component.relationship = coerceMealComponentRelationship(
        component.relationship,
        component.required,
      );
      if (typeof component.required !== "boolean") {
        component.required = component.relationship === "intrinsic";
      }
      if (typeof component.purpose !== "string" || component.purpose.trim() === "") {
        component.purpose = "Completes the meal.";
      }
      const rawName = typeof component.name === "string" ? component.name.trim() : "";
      if (!rawName || /^component[_\s-]?\d+$/i.test(rawName)) {
        // Prefer a short culinary label derived from purpose when the model omits a name.
        const purpose = String(component.purpose);
        component.name = purpose.split(/[.—,:]/)[0]?.trim().slice(0, 80) || `Component ${index + 1}`;
      } else {
        component.name = rawName;
      }
      return component;
    });
  }
  if (record.flavorProfile && typeof record.flavorProfile === "object") {
    const profile = { ...(record.flavorProfile as Record<string, unknown>) };
    if (!Array.isArray(profile.textureProfile)) profile.textureProfile = [];
    if (!Array.isArray(profile.flavorFamilies) || profile.flavorFamilies.length === 0) {
      profile.flavorFamilies = ["savory"];
    }
    if (!Array.isArray(profile.cookingTechniques) || profile.cookingTechniques.length === 0) {
      profile.cookingTechniques = ["cook"];
    }
    if (typeof profile.cuisineFamily !== "string" || profile.cuisineFamily.trim() === "") {
      profile.cuisineFamily = "unspecified";
    }
    record.flavorProfile = profile;
  }
  if (record.experienceProfile && typeof record.experienceProfile === "object") {
    const profile = { ...(record.experienceProfile as Record<string, unknown>) };
    if (!Array.isArray(profile.textureTags)) profile.textureTags = [];
    const moistureAliases: Record<string, string> = {
      dry: "dry",
      moderate: "moderate",
      medium: "moderate",
      moist: "moderate",
      juicy: "moderate",
      saucy: "saucy",
      wet: "saucy",
      gravy: "saucy",
      brothy: "saucy",
    };
    if (typeof profile.moistureLevel === "string") {
      const key = profile.moistureLevel.trim().toLowerCase();
      profile.moistureLevel = moistureAliases[key] ?? "moderate";
    } else {
      profile.moistureLevel = "moderate";
    }
    const intensityAliases: Record<string, string> = {
      mild: "mild",
      medium: "medium",
      moderate: "medium",
      bold: "bold",
      strong: "bold",
      spicy: "bold",
    };
    if (typeof profile.flavorIntensity === "string") {
      const key = profile.flavorIntensity.trim().toLowerCase();
      profile.flavorIntensity = intensityAliases[key] ?? "medium";
    } else {
      profile.flavorIntensity = "medium";
    }
    const prepAliases: Record<string, string> = {
      poor: "poor",
      bad: "poor",
      fair: "good",
      moderate: "good",
      okay: "good",
      good: "good",
      excellent: "excellent",
      great: "excellent",
    };
    if (typeof profile.mealPrepQuality === "string") {
      const key = profile.mealPrepQuality.trim().toLowerCase();
      profile.mealPrepQuality = prepAliases[key] ?? "good";
    } else {
      profile.mealPrepQuality = "good";
    }
    record.experienceProfile = profile;
  }
  if (typeof record.description !== "string" || record.description.trim() === "") {
    record.description = typeof record.name === "string" ? record.name : "Resolved recipe";
  }
  if (typeof record.recipeId !== "string" || record.recipeId.trim() === "") {
    record.recipeId = `rr_${Date.now().toString(36)}`;
  }
  return record;
}

function mergeFlavorProfileFromCandidate(
  coerced: unknown,
  candidate: RecipeResolutionRequest["candidate"],
): Record<string, unknown> {
  const fromModel =
    coerced !== null &&
    typeof coerced === "object" &&
    !Array.isArray(coerced) &&
    (coerced as { flavorProfile?: unknown }).flavorProfile !== null &&
    typeof (coerced as { flavorProfile?: unknown }).flavorProfile === "object"
      ? ({ ...((coerced as { flavorProfile: Record<string, unknown> }).flavorProfile) } as Record<
          string,
          unknown
        >)
      : {};

  const cuisineFamily =
    typeof fromModel.cuisineFamily === "string" &&
    fromModel.cuisineFamily.trim() !== "" &&
    fromModel.cuisineFamily !== "unspecified"
      ? fromModel.cuisineFamily
      : candidate.cuisineFamily;
  const flavorFamilies =
    Array.isArray(fromModel.flavorFamilies) &&
    fromModel.flavorFamilies.length > 0 &&
    !(fromModel.flavorFamilies.length === 1 && fromModel.flavorFamilies[0] === "savory")
      ? fromModel.flavorFamilies
      : candidate.flavorFamilies;
  const cookingTechniques =
    Array.isArray(fromModel.cookingTechniques) &&
    fromModel.cookingTechniques.length > 0 &&
    fromModel.cookingTechniques[0] !== "cook"
      ? fromModel.cookingTechniques
      : candidate.cookingTechniques;
  const textureProfile =
    Array.isArray(fromModel.textureProfile) && fromModel.textureProfile.length > 0
      ? fromModel.textureProfile
      : candidate.textureTags;

  return {
    ...fromModel,
    cuisineFamily,
    regionalStyle:
      fromModel.regionalStyle === undefined
        ? (candidate.regionalStyle ?? null)
        : fromModel.regionalStyle,
    flavorFamilies,
    cookingTechniques,
    textureProfile,
    primarySauce: fromModel.primarySauce === undefined ? null : fromModel.primarySauce,
  };
}

export class GeminiRecipeResolver implements RecipeResolver {
  readonly provider = "gemini" as const;
  private readonly model: string;
  private readonly client: GeminiContentClient;
  private readonly requestIdFactory: () => string;
  private readonly now: () => number;
  private readonly onLog?: (event: RecipeResolutionLogEvent) => void;
  private readonly enableSearchGrounding: boolean;
  private readonly maxAttempts: number;
  private readonly sleep?: (ms: number) => Promise<void>;

  constructor(options: GeminiRecipeResolverOptions) {
    this.model = options.model;
    this.client = options.client;
    this.requestIdFactory = options.requestIdFactory ?? createRequestId;
    this.now = options.now ?? (() => Date.now());
    this.onLog = options.onLog;
    this.enableSearchGrounding = options.enableSearchGrounding ?? true;
    this.maxAttempts = options.maxAttempts ?? 4;
    this.sleep = options.sleep;
  }

  async resolve(request: RecipeResolutionRequest): Promise<ResolvedRecipe> {
    const started = this.now();
    const requestId = this.requestIdFactory();
    const parsed = parseRecipeResolutionRequest(request);
    if (!parsed.ok) {
      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: false,
        errorCode: parsed.error.code,
        errorMessage: sanitizeLogMessage(parsed.error.message),
      });
      throw parsed.error;
    }

    const prompt = buildRecipeResolutionPrompt(parsed.value);
    const useSearch =
      this.enableSearchGrounding &&
      typeof parsed.value.candidate.source.url === "string" &&
      parsed.value.candidate.source.url.trim() !== "";

    const maxSchemaAttempts = 2;
    let usageMetadata: RecipeResolutionLogEvent["usageMetadata"];
    let searchGrounded = false;
    let lastStructuredError: RecipeResolutionError | null = null;

    for (let schemaAttempt = 1; schemaAttempt <= maxSchemaAttempts; schemaAttempt += 1) {
      const correctiveNudge =
        schemaAttempt === 1 || !lastStructuredError
          ? ""
          : [
              "",
              "CORRECTIVE RETRY: Previous JSON failed structured validation.",
              `Validation error: ${lastStructuredError.message}`,
              "supportedPrepModes[].mode MUST be exactly one of: fully_prepped, component_prepped, quick_fresh_finish, fresh.",
              "Do not invent aliases like fully_cooked_meal_prep or meal_prep.",
              "Return a single corrected JSON object only.",
            ].join("\n");

      let rawText: string;
      try {
        const result = await withGeminiRetries(
          async () => {
            if (useSearch) {
              // Structured-output schema suppresses Search grounding on Gemini 3.x.
              // Follow culinary-discovery pattern: Search + Zod after parse.
              return this.client.generateContent({
                model: this.model,
                contents: [
                  prompt.userPrompt,
                  "",
                  "After using Google Search to verify this dish's culinary identity,",
                  "return a single JSON object (optionally in a ```json fence) with the structured recipe.",
                  correctiveNudge,
                ]
                  .filter(Boolean)
                  .join("\n"),
                systemInstruction: prompt.systemInstruction,
                tools: [{ googleSearch: {} }],
                thinkingConfig: { thinkingLevel: "minimal" },
              });
            }
            return this.client.generateContent({
              model: this.model,
              contents: `${prompt.userPrompt}${correctiveNudge}`,
              systemInstruction: prompt.systemInstruction,
              responseMimeType: "application/json",
              responseJsonSchema: geminiResolvedRecipeResponseJsonSchema(),
            });
          },
          {
            maxAttempts: this.maxAttempts,
            sleep: this.sleep,
            shouldRetry: (error) => classifyGeminiProviderError(error).isRateLimited,
          },
        );
        rawText = result.text;
        usageMetadata = result.usageMetadata;
        searchGrounded = Boolean(result.groundingMetadata?.webSearchQueries?.length) || useSearch;
      } catch (error) {
        const mapped = mapProviderError(error);
        this.log({
          provider: "gemini",
          model: this.model,
          promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
          requestId,
          durationMs: this.now() - started,
          success: false,
          errorCode: mapped.code,
          errorMessage: sanitizeLogMessage(mapped.message),
          candidateId: parsed.value.candidate.candidateId,
          candidateName: parsed.value.candidate.name,
          searchGrounded: useSearch,
        });
        throw mapped;
      }

      let jsonValue: unknown;
      try {
        const jsonText = useSearch ? extractJsonObjectFromModelText(rawText) : rawText;
        jsonValue = JSON.parse(jsonText);
      } catch (error) {
        lastStructuredError = recipeResolutionError(
          "LLM_INVALID_STRUCTURED_OUTPUT",
          "Gemini returned non-JSON structured output for recipe resolution.",
          { cause: error instanceof Error ? error.message : String(error) },
        );
        continue;
      }

      const coerced = coerceResolvedRecipePayload(stripResolvedRecipeNutrition(jsonValue));
      const stamped = {
        ...(coerced as Record<string, unknown>),
        candidateId: parsed.value.candidate.candidateId,
        name:
          typeof (coerced as { name?: unknown }).name === "string" &&
          (coerced as { name: string }).name.trim() !== ""
            ? (coerced as { name: string }).name
            : parsed.value.candidate.name,
        source: {
          name: parsed.value.candidate.source.name,
          url: parsed.value.candidate.source.url,
          author: parsed.value.candidate.source.author ?? null,
        },
        flavorProfile: mergeFlavorProfileFromCandidate(coerced, parsed.value.candidate),
        resolutionMetadata: {
          provider: "gemini",
          model: this.model,
          promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
          requestId,
          durationMs: this.now() - started,
          searchGrounded,
        },
      };

      const validated = validateResolvedRecipe(stamped, parsed.value);
      if (!validated.ok) {
        lastStructuredError = validated.error;
        continue;
      }

      this.log({
        provider: "gemini",
        model: this.model,
        promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
        requestId,
        durationMs: this.now() - started,
        success: true,
        usageMetadata,
        candidateId: parsed.value.candidate.candidateId,
        candidateName: parsed.value.candidate.name,
        searchGrounded,
      });

      return validated.value;
    }

    const failure =
      lastStructuredError ??
      recipeResolutionError(
        "LLM_INVALID_STRUCTURED_OUTPUT",
        "Gemini failed recipe resolution structured validation.",
      );
    this.log({
      provider: "gemini",
      model: this.model,
      promptVersion: RECIPE_RESOLUTION_PROMPT_VERSION,
      requestId,
      durationMs: this.now() - started,
      success: false,
      errorCode: failure.code,
      errorMessage: sanitizeLogMessage(failure.message),
      usageMetadata,
      candidateId: parsed.value.candidate.candidateId,
      candidateName: parsed.value.candidate.name,
      searchGrounded,
    });
    throw failure;
  }

  private log(event: RecipeResolutionLogEvent): void {
    this.onLog?.(event);
  }
}

function mapProviderError(error: unknown): RecipeResolutionError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as RecipeResolutionError).code === "string" &&
    "message" in error
  ) {
    return error as RecipeResolutionError;
  }
  const message = error instanceof Error ? error.message : "Gemini provider request failed.";
  if (classifyGeminiProviderError(error).isRateLimited) {
    return recipeResolutionError("RATE_LIMITED", message);
  }
  return recipeResolutionError("LLM_PROVIDER_ERROR", message);
}
