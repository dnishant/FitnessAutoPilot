import {
  CatalogRecipeClassificationsSchema,
  CatalogRecipeComponentSchema,
  CatalogRecipeIngredientSchema,
  CatalogRecipeProvenanceSchema,
  CatalogRecipeScalingProfileSchema,
  CatalogRecipeSchema,
  CatalogRecipeStepIngredientUsageSchema,
  CatalogRecipeStepSchema,
  CatalogRecipeStorageProfileSchema,
  CatalogRecipeVersionSchema,
  RecipeSectionSchema,
  type CatalogRecipe,
  type CatalogRecipeClassifications,
  type CatalogRecipeComponent,
  type CatalogRecipeIngredient,
  type CatalogRecipeProvenance,
  type CatalogRecipeScalingProfile,
  type CatalogRecipeStep,
  type CatalogRecipeStepIngredientUsage,
  type CatalogRecipeStorageProfile,
  type CatalogRecipeVersion,
  type RecipeCatalogFailureCode,
  type RecipeSection,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import {
  isPublishedContentImmutable,
  transitionRecipeVersionStatus,
} from "./lifecycle";
import { resolveRecipeIngredientUsage } from "./reconcile";

export type RecipeCatalogValidationError = {
  code: RecipeCatalogFailureCode;
  message: string;
  details?: string[];
};

export type RecipeVersionGraph = {
  recipe: CatalogRecipe;
  version: CatalogRecipeVersion;
  components: CatalogRecipeComponent[];
  ingredients: CatalogRecipeIngredient[];
  steps: CatalogRecipeStep[];
  usages: CatalogRecipeStepIngredientUsage[];
  classifications: CatalogRecipeClassifications;
  scaling: CatalogRecipeScalingProfile;
  storage: CatalogRecipeStorageProfile;
  provenance: CatalogRecipeProvenance;
};

export type IngredientRefContext = {
  canonicalIngredientIds: ReadonlySet<string>;
  /** proteinProductId → canonicalIngredientId */
  proteinProductIngredient: ReadonlyMap<string, string>;
};

export function parseRecipeSection(
  value: unknown,
): Result<RecipeSection, RecipeCatalogValidationError> {
  const parsed = RecipeSectionSchema.safeParse(value);
  if (!parsed.success) {
    return err({
      code: "INVALID_RECIPE_SECTION",
      message: `Invalid recipe section: ${String(value)}`,
    });
  }
  return ok(parsed.data);
}

export function validateCatalogRecipe(
  input: unknown,
): Result<CatalogRecipe, RecipeCatalogValidationError> {
  const parsed = CatalogRecipeSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_CATALOG_STATE",
      message: parsed.error.issues[0]?.message ?? "Invalid catalog recipe",
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  return ok(parsed.data);
}

export function validateCatalogRecipeVersion(
  input: unknown,
): Result<CatalogRecipeVersion, RecipeCatalogValidationError> {
  const parsed = CatalogRecipeVersionSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_LIFECYCLE_STATE",
      message: parsed.error.issues[0]?.message ?? "Invalid recipe version",
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  if (parsed.data.referenceServings <= 0) {
    return err({
      code: "INVALID_REFERENCE_YIELD",
      message: "referenceServings must be positive",
    });
  }
  return ok(parsed.data);
}

function assertContiguousOrders(
  orders: number[],
  label: string,
): RecipeCatalogValidationError | null {
  const sorted = [...orders].sort((a, b) => a - b);
  const unique = new Set(sorted);
  if (unique.size !== sorted.length) {
    return {
      code: "INVALID_CATALOG_STATE",
      message: `Duplicate ${label} order values`,
    };
  }
  for (let i = 0; i < sorted.length; i += 1) {
    const expected = label === "step" ? i + 1 : i;
    if (sorted[i] !== expected && label === "step") {
      // Steps: 1..n contiguous
      if (sorted[i] !== i + 1) {
        return {
          code: "INVALID_CATALOG_STATE",
          message: `Step order must be contiguous starting at 1; got ${sorted.join(",")}`,
        };
      }
    }
  }
  if (label === "step") {
    for (let i = 0; i < sorted.length; i += 1) {
      if (sorted[i] !== i + 1) {
        return {
          code: "INVALID_CATALOG_STATE",
          message: `Step order must be contiguous starting at 1; got ${sorted.join(",")}`,
        };
      }
    }
  }
  return null;
}

export function validateRecipeVersionGraph(
  graph: RecipeVersionGraph,
  refs: IngredientRefContext,
): Result<RecipeVersionGraph, RecipeCatalogValidationError> {
  const recipeResult = validateCatalogRecipe(graph.recipe);
  if (!recipeResult.ok) return recipeResult;

  const versionResult = validateCatalogRecipeVersion(graph.version);
  if (!versionResult.ok) return versionResult;

  if (graph.version.recipeId !== graph.recipe.id) {
    return err({
      code: "INVALID_CATALOG_STATE",
      message: "Version recipeId does not match recipe.id",
    });
  }

  if (
    graph.recipe.currentPublishedVersionId &&
    graph.recipe.currentPublishedVersionId === graph.version.id &&
    graph.version.status !== "published"
  ) {
    return err({
      code: "INVALID_CURRENT_PUBLISHED_VERSION",
      message: "currentPublishedVersionId must point at a published version",
    });
  }

  if (graph.recipe.section !== "meal") {
    if (graph.version.lunchSuitability || graph.version.dinnerSuitability) {
      // Allow omitting; if present on non-meal, reject
      return err({
        code: "INVALID_RECIPE_SECTION",
        message: "Lunch/dinner suitability is only valid for meal section recipes",
      });
    }
  }

  const componentIds = new Set<string>();
  const componentNames = new Set<string>();
  const componentOrders: number[] = [];
  for (const component of graph.components) {
    const parsed = CatalogRecipeComponentSchema.safeParse(component);
    if (!parsed.success) {
      return err({
        code: "MISSING_RECIPE_COMPONENT",
        message: parsed.error.issues[0]?.message ?? "Invalid component",
      });
    }
    if (component.recipeVersionId !== graph.version.id) {
      return err({
        code: "MISSING_RECIPE_COMPONENT",
        message: `Component ${component.id} belongs to another version`,
      });
    }
    if (componentNames.has(component.name.toLowerCase())) {
      return err({
        code: "INVALID_CATALOG_STATE",
        message: `Duplicate component name within version: ${component.name}`,
      });
    }
    componentNames.add(component.name.toLowerCase());
    componentIds.add(component.id);
    componentOrders.push(component.displayOrder);
  }
  const sortedComponentOrders = [...componentOrders].sort((a, b) => a - b);
  if (new Set(sortedComponentOrders).size !== sortedComponentOrders.length) {
    return err({
      code: "INVALID_CATALOG_STATE",
      message: "Duplicate component displayOrder",
    });
  }

  const ingredientIds = new Set<string>();
  for (const ingredient of graph.ingredients) {
    const parsed = CatalogRecipeIngredientSchema.safeParse(ingredient);
    if (!parsed.success) {
      return err({
        code: "MISSING_CANONICAL_INGREDIENT",
        message: parsed.error.issues[0]?.message ?? "Invalid ingredient",
      });
    }
    if (ingredient.recipeVersionId !== graph.version.id) {
      return err({
        code: "UNACCOUNTED_INGREDIENT",
        message: `Ingredient ${ingredient.id} belongs to another version`,
      });
    }
    if (!refs.canonicalIngredientIds.has(ingredient.canonicalIngredientId)) {
      return err({
        code: "MISSING_CANONICAL_INGREDIENT",
        message: `Unknown canonical ingredient ${ingredient.canonicalIngredientId}`,
      });
    }
    if (ingredient.proteinProductId) {
      const expected = refs.proteinProductIngredient.get(ingredient.proteinProductId);
      if (!expected) {
        return err({
          code: "INVALID_PROTEIN_INGREDIENT_PAIR",
          message: `Unknown protein product ${ingredient.proteinProductId}`,
        });
      }
      if (expected !== ingredient.canonicalIngredientId) {
        return err({
          code: "INVALID_PROTEIN_INGREDIENT_PAIR",
          message: `Protein product ${ingredient.proteinProductId} does not match canonical ingredient`,
        });
      }
    }
    if (ingredient.componentId && !componentIds.has(ingredient.componentId)) {
      return err({
        code: "MISSING_RECIPE_COMPONENT",
        message: `Ingredient ${ingredient.id} references missing component`,
      });
    }
    ingredientIds.add(ingredient.id);
  }

  const stepOrders: number[] = [];
  const stepIds = new Set<string>();
  for (const step of graph.steps) {
    const parsed = CatalogRecipeStepSchema.safeParse(step);
    if (!parsed.success) {
      return err({
        code: "MISSING_RECIPE_STEP",
        message: parsed.error.issues[0]?.message ?? "Invalid step",
      });
    }
    if (step.recipeVersionId !== graph.version.id) {
      return err({
        code: "MISSING_RECIPE_STEP",
        message: `Step ${step.id} belongs to another version`,
      });
    }
    if (step.componentId && !componentIds.has(step.componentId)) {
      return err({
        code: "MISSING_RECIPE_COMPONENT",
        message: `Step ${step.id} references missing component`,
      });
    }
    stepOrders.push(step.order);
    stepIds.add(step.id);
  }
  const stepOrderError = assertContiguousOrders(stepOrders, "step");
  if (stepOrderError) return err(stepOrderError);
  if (graph.steps.length === 0) {
    return err({
      code: "MISSING_RECIPE_STEP",
      message: "Recipe version requires at least one step",
    });
  }

  for (const usage of graph.usages) {
    const parsed = CatalogRecipeStepIngredientUsageSchema.safeParse(usage);
    if (!parsed.success) {
      return err({
        code: "MISSING_INGREDIENT_STEP_LINK",
        message: parsed.error.issues[0]?.message ?? "Invalid usage",
      });
    }
    if (!stepIds.has(usage.recipeStepId)) {
      return err({
        code: "MISSING_RECIPE_STEP",
        message: `Usage references unknown step`,
      });
    }
    if (!ingredientIds.has(usage.recipeIngredientId)) {
      return err({
        code: "UNACCOUNTED_INGREDIENT",
        message: `Usage references ingredient from another version`,
      });
    }
  }

  const reconcile = resolveRecipeIngredientUsage(
    graph.ingredients,
    graph.steps,
    graph.usages,
  );
  if (!reconcile.ok) return reconcile;
  if (!reconcile.value.ok) {
    if (reconcile.value.missingLinkIngredientIds.length > 0) {
      return err({
        code: "MISSING_INGREDIENT_STEP_LINK",
        message: reconcile.value.details[0] ?? "Missing ingredient-step link",
        details: reconcile.value.details,
      });
    }
    if (reconcile.value.duplicatedIngredientIds.length > 0) {
      return err({
        code: "DUPLICATED_INGREDIENT_USAGE",
        message: reconcile.value.details[0] ?? "Duplicated ingredient usage",
        details: reconcile.value.details,
      });
    }
    if (reconcile.value.incompatibleUnitIngredientIds.length > 0) {
      return err({
        code: "INCOMPATIBLE_USAGE_UNIT",
        message: reconcile.value.details[0] ?? "Incompatible usage unit",
        details: reconcile.value.details,
      });
    }
    return err({
      code: "UNACCOUNTED_INGREDIENT",
      message: reconcile.value.details[0] ?? "Unaccounted ingredient",
      details: reconcile.value.details,
    });
  }

  const scaling = CatalogRecipeScalingProfileSchema.safeParse(graph.scaling);
  if (!scaling.success) {
    return err({
      code: "INVALID_SCALING_PROFILE",
      message: scaling.error.issues[0]?.message ?? "Invalid scaling profile",
    });
  }
  if (scaling.data.recipeVersionId !== graph.version.id) {
    return err({
      code: "INVALID_SCALING_PROFILE",
      message: "Scaling profile version mismatch",
    });
  }

  const storage = CatalogRecipeStorageProfileSchema.safeParse(graph.storage);
  if (!storage.success) {
    return err({
      code: "MISSING_STORAGE_PROFILE",
      message: storage.error.issues[0]?.message ?? "Invalid storage profile",
    });
  }
  if (storage.data.recipeVersionId !== graph.version.id) {
    return err({
      code: "MISSING_STORAGE_PROFILE",
      message: "Storage profile version mismatch",
    });
  }

  const provenance = CatalogRecipeProvenanceSchema.safeParse(graph.provenance);
  if (!provenance.success) {
    return err({
      code: "MISSING_PROVENANCE",
      message: provenance.error.issues[0]?.message ?? "Invalid provenance",
    });
  }
  if (provenance.data.recipeVersionId !== graph.version.id) {
    return err({
      code: "MISSING_PROVENANCE",
      message: "Provenance version mismatch",
    });
  }
  if (
    provenance.data.type === "generated_draft" &&
    graph.version.kitchenTestStatus === "passed"
  ) {
    return err({
      code: "INVALID_LIFECYCLE_STATE",
      message: "Generated drafts cannot be marked kitchen-tested passed",
    });
  }

  const classifications = CatalogRecipeClassificationsSchema.safeParse(
    graph.classifications,
  );
  if (!classifications.success) {
    return err({
      code: "INVALID_CATALOG_STATE",
      message: classifications.error.issues[0]?.message ?? "Invalid classifications",
    });
  }

  if (
    graph.version.status === "published" ||
    graph.version.status === "validated"
  ) {
    // Publication / validation gate: must pass full structural checks (already done)
  }

  return ok(graph);
}

export function assertCanMutateVersion(
  status: CatalogRecipeVersion["status"],
): Result<true, RecipeCatalogValidationError> {
  if (isPublishedContentImmutable(status)) {
    return err({
      code: "IMMUTABLE_PUBLISHED_VERSION",
      message: `Cannot mutate ${status} recipe version content`,
    });
  }
  return ok(true);
}

export function assertValidStatusTransition(
  from: CatalogRecipeVersion["status"],
  to: CatalogRecipeVersion["status"],
): Result<CatalogRecipeVersion["status"], RecipeCatalogValidationError> {
  return transitionRecipeVersionStatus(from, to);
}
