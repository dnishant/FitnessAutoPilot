import {
  CUISINE_OPTIONS,
  KITCHEN_TEST_STATUS_LABELS,
  RECIPE_SECTION_LABELS,
  RECIPE_VERSION_STATUS_LABELS,
  type CuisineValue,
  type RecipeCatalogListItem,
  type RecipeCatalogVersionDetail,
  type RecipeSection,
} from "@fitness-autopilot/contracts";
import {
  createRecipeCatalogService,
  createSeedCatalogSnapshot,
  SEED_PRODUCT_IDS,
  type RecipeCatalogQueryError,
} from "@fitness-autopilot/domain";

export const RECIPE_CATALOG_ROUTE = "/catalog/recipes";
export const RECIPE_CATALOG_TITLE = "Recipe Catalog";

const ingredientSnapshot = createSeedCatalogSnapshot();
const ingredientNameById = new Map(
  ingredientSnapshot.ingredients.map((row) => [row.id, row.displayName]),
);
const proteinNameById = new Map(
  ingredientSnapshot.proteinProducts.map((row) => [row.id, row.displayName]),
);

export type RecipeCatalogUiState = {
  section: RecipeSection;
  search: string;
  filterCuisine: CuisineValue | "all";
  filterProteinProductId: string | "all";
  items: RecipeCatalogListItem[];
  selectedVersionId: string | null;
  detail: RecipeCatalogVersionDetail | null;
  loading: boolean;
  error: string | null;
};

const catalog = createRecipeCatalogService();

export function createRecipeCatalogUiState(): RecipeCatalogUiState {
  return {
    section: "breakfast",
    search: "",
    filterCuisine: "all",
    filterProteinProductId: "all",
    items: [],
    selectedVersionId: null,
    detail: null,
    loading: true,
    error: null,
  };
}

export function humanizeRecipeCatalogError(
  error: RecipeCatalogQueryError | string,
): string {
  if (typeof error === "string") return error;
  if (error.code === "INVALID_FILTERS") {
    return "Those filters are not valid. Clear filters and try again.";
  }
  if (error.code === "RECIPE_VERSION_NOT_FOUND" || error.code === "RECIPE_NOT_FOUND") {
    return "That recipe was not found in the catalog.";
  }
  return error.message;
}

export function loadRecipeCatalog(state: RecipeCatalogUiState): RecipeCatalogUiState {
  const result = catalog.listRecipes({
    section: state.section,
    search: state.search.trim() ? state.search : undefined,
    cuisine: state.filterCuisine === "all" ? undefined : state.filterCuisine,
    proteinProductId:
      state.section === "meal" && state.filterProteinProductId !== "all"
        ? state.filterProteinProductId
        : undefined,
    publishedOnly: true,
    includeInternal: true,
  });
  if (!result.ok) {
    return {
      ...state,
      loading: false,
      error: humanizeRecipeCatalogError(result.error),
      items: [],
      detail: null,
    };
  }

  let detail = state.detail;
  let selectedVersionId = state.selectedVersionId;
  if (selectedVersionId) {
    const stillVisible = result.value.some((row) => row.version.id === selectedVersionId);
    if (!stillVisible) {
      selectedVersionId = null;
      detail = null;
    } else {
      const detailResult = catalog.getRecipeVersion(selectedVersionId, {
        includeInternal: true,
      });
      detail = detailResult.ok ? detailResult.value : null;
    }
  }

  return {
    ...state,
    loading: false,
    error: null,
    items: result.value,
    selectedVersionId,
    detail,
  };
}

export function openRecipeVersion(
  state: RecipeCatalogUiState,
  versionId: string,
): RecipeCatalogUiState {
  const result = catalog.getRecipeVersion(versionId, { includeInternal: true });
  if (!result.ok) {
    return {
      ...state,
      error: humanizeRecipeCatalogError(result.error),
      selectedVersionId: null,
      detail: null,
    };
  }
  return {
    ...state,
    error: null,
    selectedVersionId: versionId,
    detail: result.value,
  };
}

export function closeRecipeVersion(state: RecipeCatalogUiState): RecipeCatalogUiState {
  return { ...state, selectedVersionId: null, detail: null };
}

export function sectionLabel(section: RecipeSection): string {
  return RECIPE_SECTION_LABELS[section];
}

export function statusLabel(status: RecipeCatalogListItem["version"]["status"]): string {
  return RECIPE_VERSION_STATUS_LABELS[status];
}

export function kitchenTestLabel(
  status: RecipeCatalogListItem["version"]["kitchenTestStatus"],
): string {
  return KITCHEN_TEST_STATUS_LABELS[status];
}

export function cuisineFilterOptions(): Array<{ value: CuisineValue | "all"; label: string }> {
  return [
    { value: "all", label: "All cuisines" },
    ...CUISINE_OPTIONS.filter((o) => o.value !== "surprise_me").map((o) => ({
      value: o.value,
      label: o.label,
    })),
  ];
}

export function proteinFilterOptions(): Array<{ value: string; label: string }> {
  return [
    { value: "all", label: "All proteins" },
    {
      value: SEED_PRODUCT_IDS.groundChicken,
      label: "Ground chicken",
    },
    {
      value: SEED_PRODUCT_IDS.largeChickenEggs,
      label: "Large chicken eggs",
    },
  ];
}

export function resolveIngredientName(canonicalIngredientId: string): string {
  return ingredientNameById.get(canonicalIngredientId) ?? canonicalIngredientId;
}

export function resolveProteinName(proteinProductId: string): string {
  return proteinNameById.get(proteinProductId) ?? proteinProductId;
}

export function componentName(
  detail: RecipeCatalogVersionDetail,
  componentId: string | undefined,
): string {
  if (!componentId) return "Ungrouped";
  return detail.components.find((c) => c.id === componentId)?.name ?? "Component";
}
