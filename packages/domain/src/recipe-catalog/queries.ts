import {
  RecipeCatalogListFiltersSchema,
  type CatalogRecipe,
  type CatalogRecipeVersion,
  type RecipeCatalogListFilters,
  type RecipeCatalogListItem,
  type RecipeCatalogVersionDetail,
  type RecipeSection,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import {
  createSeedCatalogSnapshot,
  type IngredientCatalogSnapshot,
} from "../ingredient-catalog/seed";
import {
  assertCanMutateVersion,
  assertValidStatusTransition,
  validateRecipeVersionGraph,
  type IngredientRefContext,
  type RecipeVersionGraph,
} from "./validate";
import {
  createSeedRecipeCatalogSnapshot,
  flattenRecipeCatalogSnapshot,
  type RecipeCatalogSnapshot,
} from "./seed";
import type { RecipeCatalogFailureCode } from "@fitness-autopilot/contracts";

function newUuid(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  // Deterministic-enough fallback for non-crypto test environments.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export type RecipeCatalogQueryError = {
  code: RecipeCatalogFailureCode;
  message: string;
};

export type RecipeCatalogStore = {
  recipeSnapshot: RecipeCatalogSnapshot;
  ingredientSnapshot: IngredientCatalogSnapshot;
};

export function createInMemoryRecipeCatalogStore(
  recipeSnapshot: RecipeCatalogSnapshot = createSeedRecipeCatalogSnapshot(),
  ingredientSnapshot: IngredientCatalogSnapshot = createSeedCatalogSnapshot(),
): RecipeCatalogStore {
  return { recipeSnapshot, ingredientSnapshot };
}

function buildRefContext(ingredients: IngredientCatalogSnapshot): IngredientRefContext {
  return {
    canonicalIngredientIds: new Set(ingredients.ingredients.map((i) => i.id)),
    proteinProductIngredient: new Map(
      ingredients.proteinProducts.map((p) => [p.id, p.ingredientId]),
    ),
  };
}

function proteinDisplayName(
  store: RecipeCatalogStore,
  proteinProductId: string | undefined,
): string | undefined {
  if (!proteinProductId) return undefined;
  return store.ingredientSnapshot.proteinProducts.find((p) => p.id === proteinProductId)
    ?.displayName;
}

function primaryProteinId(graph: RecipeVersionGraph): string | undefined {
  const withProtein = graph.ingredients.find((i) => i.proteinProductId);
  return withProtein?.proteinProductId;
}

function toListItem(
  store: RecipeCatalogStore,
  graph: RecipeVersionGraph,
): RecipeCatalogListItem {
  const proteinId = primaryProteinId(graph);
  return {
    recipe: graph.recipe,
    version: graph.version,
    primaryProteinProductId: proteinId,
    primaryProteinDisplayName: proteinDisplayName(store, proteinId),
    cuisines: graph.classifications.cuisines,
    totalMinutes: graph.version.activeMinutes + graph.version.passiveMinutes,
  };
}

function matchesSearch(graph: RecipeVersionGraph, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return (
    graph.version.title.toLowerCase().includes(needle) ||
    graph.recipe.canonicalKey.includes(needle) ||
    (graph.version.description?.toLowerCase().includes(needle) ?? false)
  );
}

export function listRecipes(
  store: RecipeCatalogStore,
  filters: Partial<RecipeCatalogListFilters> = {},
): Result<RecipeCatalogListItem[], RecipeCatalogQueryError> {
  const parsed = RecipeCatalogListFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    return err({
      code: "INVALID_FILTERS",
      message: parsed.error.issues[0]?.message ?? "Invalid recipe filters",
    });
  }
  const {
    section,
    proteinProductId,
    cuisine,
    status,
    search,
    publishedOnly,
    includeInternal,
  } = parsed.data;

  let graphs = store.recipeSnapshot.graphs.slice();

  if (publishedOnly !== false && !includeInternal) {
    graphs = graphs.filter(
      (g) =>
        g.version.status === "published" &&
        g.recipe.currentPublishedVersionId === g.version.id,
    );
  } else if (status) {
    graphs = graphs.filter((g) => g.version.status === status);
  }

  if (section) {
    graphs = graphs.filter((g) => g.recipe.section === section);
  }
  if (cuisine) {
    graphs = graphs.filter((g) => g.classifications.cuisines.includes(cuisine));
  }
  if (proteinProductId) {
    graphs = graphs.filter((g) =>
      g.ingredients.some((i) => i.proteinProductId === proteinProductId),
    );
  }
  if (search && search.trim()) {
    graphs = graphs.filter((g) => matchesSearch(g, search));
  }

  graphs.sort((a, b) => a.version.title.localeCompare(b.version.title));
  return ok(graphs.map((g) => toListItem(store, g)));
}

export function getRecipeVersion(
  store: RecipeCatalogStore,
  recipeVersionId: string,
  options: { includeInternal?: boolean } = {},
): Result<RecipeCatalogVersionDetail, RecipeCatalogQueryError> {
  const graph = store.recipeSnapshot.graphs.find((g) => g.version.id === recipeVersionId);
  if (!graph) {
    return err({
      code: "RECIPE_VERSION_NOT_FOUND",
      message: `Recipe version not found: ${recipeVersionId}`,
    });
  }
  if (!options.includeInternal && graph.version.status !== "published") {
    return err({
      code: "RECIPE_VERSION_NOT_FOUND",
      message: `Recipe version not found: ${recipeVersionId}`,
    });
  }

  const refs = buildRefContext(store.ingredientSnapshot);
  const validated = validateRecipeVersionGraph(graph, refs);
  if (!validated.ok) {
    return err({
      code: validated.error.code,
      message: validated.error.message,
    });
  }

  return ok({
    recipe: graph.recipe,
    version: graph.version,
    components: [...graph.components].sort((a, b) => a.displayOrder - b.displayOrder),
    ingredients: [...graph.ingredients].sort((a, b) => a.displayOrder - b.displayOrder),
    steps: [...graph.steps].sort((a, b) => a.order - b.order),
    usages: graph.usages.slice(),
    classifications: graph.classifications,
    scaling: graph.scaling,
    storage: graph.storage,
    provenance: graph.provenance,
    structureValidated:
      graph.version.status === "validated" || graph.version.status === "published",
    kitchenTested: graph.version.kitchenTestStatus === "passed",
  });
}

export function getCurrentPublishedRecipeVersion(
  store: RecipeCatalogStore,
  recipeId: string,
): Result<RecipeCatalogVersionDetail, RecipeCatalogQueryError> {
  const graph = store.recipeSnapshot.graphs.find((g) => g.recipe.id === recipeId);
  if (!graph) {
    return err({ code: "RECIPE_NOT_FOUND", message: `Recipe not found: ${recipeId}` });
  }
  const publishedId = graph.recipe.currentPublishedVersionId;
  if (!publishedId) {
    return err({
      code: "RECIPE_VERSION_NOT_FOUND",
      message: `Recipe ${recipeId} has no published version`,
    });
  }
  return getRecipeVersion(store, publishedId);
}

export function validateRecipeVersion(
  store: RecipeCatalogStore,
  recipeVersionId: string,
): Result<true, RecipeCatalogQueryError> {
  const graph = store.recipeSnapshot.graphs.find((g) => g.version.id === recipeVersionId);
  if (!graph) {
    return err({
      code: "RECIPE_VERSION_NOT_FOUND",
      message: `Recipe version not found: ${recipeVersionId}`,
    });
  }
  const result = validateRecipeVersionGraph(graph, buildRefContext(store.ingredientSnapshot));
  if (!result.ok) {
    return err({ code: result.error.code, message: result.error.message });
  }
  return ok(true);
}

function remapId(map: Map<string, string>, oldId: string): string {
  const existing = map.get(oldId);
  if (existing) return existing;
  const next = newUuid();
  map.set(oldId, next);
  return next;
}

/**
 * Copy an existing version into a new draft version identity (does not mutate the source).
 * In-memory store helper for domain tests / future admin tooling.
 */
export function createRecipeVersionFromExisting(
  store: RecipeCatalogStore,
  recipeVersionId: string,
): Result<{ store: RecipeCatalogStore; newVersionId: string }, RecipeCatalogQueryError> {
  const source = store.recipeSnapshot.graphs.find((g) => g.version.id === recipeVersionId);
  if (!source) {
    return err({
      code: "RECIPE_VERSION_NOT_FOUND",
      message: `Recipe version not found: ${recipeVersionId}`,
    });
  }

  const mutableCheck = assertCanMutateVersion("draft");
  if (!mutableCheck.ok) {
    return err({ code: mutableCheck.error.code, message: mutableCheck.error.message });
  }

  const flat = flattenRecipeCatalogSnapshot(store.recipeSnapshot);
  const siblings = flat.versions.filter((v) => v.recipeId === source.recipe.id);
  const nextVersionNumber = Math.max(...siblings.map((v) => v.version)) + 1;

  const componentIds = new Map<string, string>();
  const newVersionId = newUuid();

  const newVersion: CatalogRecipeVersion = {
    ...source.version,
    id: newVersionId,
    version: nextVersionNumber,
    status: "draft",
    kitchenTestStatus: "not_tested",
    publishedAt: undefined,
    retiredAt: undefined,
    createdAt: new Date().toISOString(),
  };

  const components = source.components.map((c) => ({
    ...c,
    id: remapId(componentIds, c.id),
    recipeVersionId: newVersionId,
  }));
  const ingredientIds = new Map<string, string>();
  const ingredients = source.ingredients.map((i) => ({
    ...i,
    id: remapId(ingredientIds, i.id),
    recipeVersionId: newVersionId,
    componentId: i.componentId ? componentIds.get(i.componentId) : undefined,
  }));
  const stepIds = new Map<string, string>();
  const steps = source.steps.map((s) => ({
    ...s,
    id: remapId(stepIds, s.id),
    recipeVersionId: newVersionId,
    componentId: s.componentId ? componentIds.get(s.componentId) : undefined,
  }));
  const usages = source.usages.map((u) => ({
    ...u,
    id: newUuid(),
    recipeStepId: stepIds.get(u.recipeStepId)!,
    recipeIngredientId: ingredientIds.get(u.recipeIngredientId)!,
  }));

  const newGraph: RecipeVersionGraph = {
    recipe: source.recipe,
    version: newVersion,
    components,
    ingredients,
    steps,
    usages,
    classifications: { ...source.classifications, recipeVersionId: newVersionId },
    scaling: { ...source.scaling, recipeVersionId: newVersionId },
    storage: { ...source.storage, recipeVersionId: newVersionId },
    provenance: {
      ...source.provenance,
      recipeVersionId: newVersionId,
      kitchenTestedAt: undefined,
    },
  };

  const nextStore: RecipeCatalogStore = {
    ...store,
    recipeSnapshot: {
      graphs: [...store.recipeSnapshot.graphs, newGraph],
    },
  };
  return ok({ store: nextStore, newVersionId });
}

export function retireRecipeVersion(
  store: RecipeCatalogStore,
  recipeVersionId: string,
): Result<RecipeCatalogStore, RecipeCatalogQueryError> {
  const idx = store.recipeSnapshot.graphs.findIndex((g) => g.version.id === recipeVersionId);
  if (idx < 0) {
    return err({
      code: "RECIPE_VERSION_NOT_FOUND",
      message: `Recipe version not found: ${recipeVersionId}`,
    });
  }
  const graph = store.recipeSnapshot.graphs[idx]!;
  const transition = assertValidStatusTransition(graph.version.status, "retired");
  if (!transition.ok) {
    return err({ code: transition.error.code, message: transition.error.message });
  }
  const updated: RecipeVersionGraph = {
    ...graph,
    version: {
      ...graph.version,
      status: "retired",
      retiredAt: new Date().toISOString(),
    },
    recipe:
      graph.recipe.currentPublishedVersionId === graph.version.id
        ? { ...graph.recipe, currentPublishedVersionId: undefined }
        : graph.recipe,
  };
  const graphs = store.recipeSnapshot.graphs.slice();
  graphs[idx] = updated;
  // Keep historical identity of other graphs pointing at same recipe identity
  for (let i = 0; i < graphs.length; i += 1) {
    if (graphs[i]!.recipe.id === updated.recipe.id) {
      graphs[i] = { ...graphs[i]!, recipe: updated.recipe };
    }
  }
  return ok({ ...store, recipeSnapshot: { graphs } });
}

export type RecipeCatalogService = {
  listRecipes: (
    filters?: Partial<RecipeCatalogListFilters>,
  ) => Result<RecipeCatalogListItem[], RecipeCatalogQueryError>;
  getRecipeVersion: (
    recipeVersionId: string,
    options?: { includeInternal?: boolean },
  ) => Result<RecipeCatalogVersionDetail, RecipeCatalogQueryError>;
  getCurrentPublishedRecipeVersion: (
    recipeId: string,
  ) => Result<RecipeCatalogVersionDetail, RecipeCatalogQueryError>;
  validateRecipeVersion: (
    recipeVersionId: string,
  ) => Result<true, RecipeCatalogQueryError>;
  createRecipeVersionFromExisting: (
    recipeVersionId: string,
  ) => Result<{ newVersionId: string }, RecipeCatalogQueryError>;
  listSectionsPresent: () => RecipeSection[];
};

export function createRecipeCatalogService(
  initial: RecipeCatalogStore = createInMemoryRecipeCatalogStore(),
): RecipeCatalogService {
  let store = initial;
  return {
    listRecipes: (filters) => listRecipes(store, filters),
    getRecipeVersion: (id, options) => getRecipeVersion(store, id, options),
    getCurrentPublishedRecipeVersion: (recipeId) =>
      getCurrentPublishedRecipeVersion(store, recipeId),
    validateRecipeVersion: (id) => validateRecipeVersion(store, id),
    createRecipeVersionFromExisting: (id) => {
      const result = createRecipeVersionFromExisting(store, id);
      if (!result.ok) return result;
      store = result.value.store;
      return ok({ newVersionId: result.value.newVersionId });
    },
    listSectionsPresent: () => {
      const sections = new Set(store.recipeSnapshot.graphs.map((g) => g.recipe.section));
      return (["breakfast", "meal", "snack"] as RecipeSection[]).filter((s) =>
        sections.has(s),
      );
    },
  };
}

export function getRecipeByCanonicalKey(
  store: RecipeCatalogStore,
  canonicalKey: string,
): CatalogRecipe | undefined {
  return store.recipeSnapshot.graphs.find((g) => g.recipe.canonicalKey === canonicalKey)
    ?.recipe;
}
