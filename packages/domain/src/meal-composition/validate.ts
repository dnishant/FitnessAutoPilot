import type {
  MealCompositionProposal,
  MealCompositionRequest,
} from "@fitness-autopilot/contracts";
import {
  MEAL_COMPOSITION_PROMPT_VERSION,
  MealCompositionProposalSchema,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import {
  looksLikeCompoundComponent,
  namesLikelyEquivalent,
  normalizeComponentName,
} from "./component-identity";

export type MealCompositionErrorCode =
  | "COMPOSITION_PROVIDER_ERROR"
  | "INVALID_COMPOSITION"
  | "HARD_CONSTRAINT_CONFLICT"
  | "COMPONENT_RESOLUTION_FAILED"
  | "INVALID_COMPOSITION_REQUEST"
  | "LLM_CONFIGURATION_ERROR"
  | "RATE_LIMITED";

export type MealCompositionError = {
  code: MealCompositionErrorCode;
  message: string;
  details?: unknown;
  candidateId?: string;
  candidateName?: string;
};

export function mealCompositionError(
  code: MealCompositionErrorCode,
  message: string,
  details?: unknown,
): MealCompositionError {
  return details === undefined ? { code, message } : { code, message, details };
}

const BANNED_DETAILED_RECIPE_KEYS = [
  "recipeIngredients",
  "instructions",
  "ingredients",
  "steps",
];

const BANNED_NUTRITION_KEYS = [
  "calories",
  "caloriesKcal",
  "targetCalories",
  "proteinG",
  "proteinGrams",
  "carbsG",
  "carbohydrateG",
  "carbohydrateGrams",
  "fatG",
  "fatGrams",
  "fiberG",
  "fiberGrams",
  "macros",
  "nutrition",
  "nutritionTotals",
  "estimatedCalories",
  "estimatedProteinGrams",
  "servingGrams",
  "portionGrams",
  "quantityGrams",
];

function assertNoAuthoritativeNutrition(
  value: unknown,
  path = "",
): Result<void, MealCompositionError> {
  if (value === null || typeof value !== "object") return ok(undefined);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const nested = assertNoAuthoritativeNutrition(value[i], `${path}[${i}]`);
      if (!nested.ok) return nested;
    }
    return ok(undefined);
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (BANNED_NUTRITION_KEYS.includes(key)) {
      return err(
        mealCompositionError(
          "INVALID_COMPOSITION",
          `Composition must not include authoritative nutrition field "${key}".`,
          { field: key, path },
        ),
      );
    }
    if (
      BANNED_DETAILED_RECIPE_KEYS.includes(key) &&
      path.includes("addedComponents")
    ) {
      return err(
        mealCompositionError(
          "INVALID_COMPOSITION",
          `Lightweight composition must not include detailed recipe field "${key}".`,
          { field: key, path },
        ),
      );
    }
    if (
      (key === "grams" ||
        key === "servingGrams" ||
        key === "portionGrams" ||
        key === "quantityGrams" ||
        key === "quantity" ||
        key === "unit") &&
      path.includes("addedComponents")
    ) {
      return err(
        mealCompositionError(
          "INVALID_COMPOSITION",
          `Lightweight composition must not include quantity field "${key}".`,
          { field: key, path },
        ),
      );
    }
    const nested = assertNoAuthoritativeNutrition(record[key], path ? `${path}.${key}` : key);
    if (!nested.ok) return nested;
  }
  return ok(undefined);
}

function constraintTokens(values: readonly string[]): string[] {
  return values.map((v) => normalizeComponentName(v)).filter(Boolean);
}

function violatesHardConstraint(name: string, tokens: readonly string[]): string | null {
  const n = normalizeComponentName(name);
  for (const token of tokens) {
    if (!token) continue;
    if (n === token || n.includes(token) || token.includes(n)) {
      return token;
    }
  }
  return null;
}

/**
 * Deterministically validate a Gemini (or mock) meal composition proposal.
 */
export function validateMealCompositionProposal(
  input: unknown,
  request: MealCompositionRequest,
): Result<MealCompositionProposal, MealCompositionError> {
  const nutritionCheck = assertNoAuthoritativeNutrition(input);
  if (!nutritionCheck.ok) return nutritionCheck;

  const parsed = MealCompositionProposalSchema.safeParse(input);
  if (!parsed.success) {
    return err(
      mealCompositionError(
        "INVALID_COMPOSITION",
        parsed.error.issues[0]?.message ?? "Composition proposal failed schema validation.",
        parsed.error.flatten(),
      ),
    );
  }

  const proposal = parsed.data;
  const allergyTokens = constraintTokens(request.allergies);
  const restrictionTokens = constraintTokens(request.dietaryRestrictions);
  const dislikeTokens = constraintTokens(request.dislikes);

  for (const added of proposal.addedComponents) {
    const allergyHit = violatesHardConstraint(added.name, allergyTokens);
    if (allergyHit) {
      return err(
        mealCompositionError(
          "HARD_CONSTRAINT_CONFLICT",
          `Added component "${added.name}" conflicts with allergy "${allergyHit}".`,
          { component: added.name, allergy: allergyHit },
        ),
      );
    }
    const restrictionHit = violatesHardConstraint(added.name, restrictionTokens);
    if (restrictionHit) {
      return err(
        mealCompositionError(
          "HARD_CONSTRAINT_CONFLICT",
          `Added component "${added.name}" conflicts with dietary restriction "${restrictionHit}".`,
          { component: added.name, restriction: restrictionHit },
        ),
      );
    }
    const dislikeHit = violatesHardConstraint(added.name, dislikeTokens);
    if (dislikeHit) {
      return err(
        mealCompositionError(
          "HARD_CONSTRAINT_CONFLICT",
          `Added component "${added.name}" conflicts with dislike "${dislikeHit}".`,
          { component: added.name, dislike: dislikeHit },
        ),
      );
    }

    if (added.role === ("main" as string)) {
      return err(
        mealCompositionError(
          "INVALID_COMPOSITION",
          "Composition must not add a second main protein dish.",
        ),
      );
    }

    // Protein stacking heuristic: reject obvious secondary proteins.
    if (
      /\b(chicken|beef|pork|lamb|shrimp|fish|egg|tofu|turkey)\b/i.test(added.name) &&
      (added.role === "fat" || added.role === "garnish" || added.role === "sauce_condiment") ===
        false &&
      added.role !== "legume"
    ) {
      // Allow legumes; block another animal/soy protein side when main already provides protein.
      if (request.compositionContext?.existingRoles.hasPrimaryProtein !== false) {
        if (
          added.role === "vegetable" ||
          added.role === "fruit" ||
          added.role === "carbohydrate"
        ) {
          // e.g. "chicken stock rice" unlikely; "shrimp" as vegetable impossible
          if (/^(chicken|beef|pork|lamb|shrimp|fish|eggs?|tofu|turkey)\b/i.test(added.name.trim())) {
            return err(
              mealCompositionError(
                "INVALID_COMPOSITION",
                `Avoid protein stacking: "${added.name}" looks like a second main protein.`,
              ),
            );
          }
        }
      }
    }

    if (added.definitionKind === "atomic_food" && looksLikeCompoundComponent(added.name)) {
      return err(
        mealCompositionError(
          "INVALID_COMPOSITION",
          `Component "${added.name}" looks compound and must use definitionKind "recipe_component", not a fake atomic food.`,
        ),
      );
    }

    // Lightweight v2: compound vs atomic is a routing hint only. Ingredients come later.
  }

  // Dedup within the same meal
  for (let i = 0; i < proposal.addedComponents.length; i += 1) {
    for (let j = i + 1; j < proposal.addedComponents.length; j += 1) {
      const a = proposal.addedComponents[i]!;
      const b = proposal.addedComponents[j]!;
      if (a.role === b.role && namesLikelyEquivalent(a.name, b.name)) {
        return err(
          mealCompositionError(
            "INVALID_COMPOSITION",
            `Duplicate equivalent components within the meal: "${a.name}" and "${b.name}".`,
          ),
        );
      }
    }
  }

  // Do not duplicate roles already covered by intrinsic / PLAN-008 components.
  const existing = request.compositionContext?.existingRoles;
  if (existing) {
    for (const added of proposal.addedComponents) {
      const existingNames = [
        request.candidate?.name,
        request.ranked?.candidate.name,
        request.recipe?.name,
        ...(request.recipe?.mealComponents.map((c) => c.name) ?? []),
        ...(request.recipe?.ingredients.map((i) => i.name) ?? []),
      ].filter((name): name is string => typeof name === "string" && name.length > 0);
      if (existingNames.some((n) => namesLikelyEquivalent(n, added.name))) {
        return err(
          mealCompositionError(
            "INVALID_COMPOSITION",
            `Added component "${added.name}" duplicates an intrinsic or existing recipe component.`,
          ),
        );
      }

      // Don't add a second carbohydrate when meaningful carb already present (e.g. tortillas).
      if (added.role === "carbohydrate" && existing.hasMeaningfulCarbohydrate) {
        return err(
          mealCompositionError(
            "INVALID_COMPOSITION",
            `Unnecessary carbohydrate "${added.name}" — meal already has a meaningful carbohydrate source.`,
          ),
        );
      }
    }
  }

  if (proposal.noAdditionsNeeded && proposal.addedComponents.length > 0) {
    return err(
      mealCompositionError(
        "INVALID_COMPOSITION",
        "noAdditionsNeeded was true but addedComponents is non-empty.",
      ),
    );
  }

  return ok(proposal);
}

export function stripCompositionNutrition(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripCompositionNutrition);
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (BANNED_NUTRITION_KEYS.includes(key)) continue;
    out[key] = stripCompositionNutrition(nested);
  }
  return out;
}

export { MEAL_COMPOSITION_PROMPT_VERSION };
