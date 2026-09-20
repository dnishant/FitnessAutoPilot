import {
  AVAILABILITY_CLASS_LABELS,
  AVAILABILITY_DISCLAIMER,
  CONFIDENCE_LABELS,
  PROTEIN_FAMILY_LABELS,
  RETAILER_LABELS,
  type AvailabilityClass,
  type ProteinFamily,
  type ProteinProduct,
  type ProteinProductDetail,
} from "@fitness-autopilot/contracts";
import {
  createProteinCatalogService,
  type CatalogQueryError,
} from "@fitness-autopilot/domain";

export const PROTEIN_CATALOG_ROUTE = "/catalog/proteins";
export const PROTEIN_CATALOG_TITLE = "Protein Catalog";

export type ProteinCatalogUiState = {
  search: string;
  filterFamily: ProteinFamily | "all";
  filterAvailability: AvailabilityClass | "all";
  products: ProteinProduct[];
  selectedKey: string | null;
  detail: ProteinProductDetail | null;
  loading: boolean;
  error: string | null;
};

const catalog = createProteinCatalogService();

export function createProteinCatalogUiState(): ProteinCatalogUiState {
  return {
    search: "",
    filterFamily: "all",
    filterAvailability: "all",
    products: [],
    selectedKey: null,
    detail: null,
    loading: true,
    error: null,
  };
}

export function humanizeCatalogError(error: CatalogQueryError | string): string {
  if (typeof error === "string") return error;
  if (error.code === "invalid_filters") return "Those filters are not valid. Clear filters and try again.";
  if (error.code === "not_found") return "That protein product was not found in the catalog.";
  return error.message;
}

export function loadProteinCatalog(
  state: ProteinCatalogUiState,
): ProteinCatalogUiState {
  const result = catalog.listProteinProducts({
    proteinFamily: state.filterFamily === "all" ? undefined : state.filterFamily,
    availabilityClass:
      state.filterAvailability === "all" ? undefined : state.filterAvailability,
    search: state.search.trim() ? state.search : undefined,
    activeOnly: true,
  });
  if (!result.ok) {
    return {
      ...state,
      loading: false,
      error: humanizeCatalogError(result.error),
      products: [],
      detail: null,
    };
  }
  let detail = state.detail;
  let selectedKey = state.selectedKey;
  if (selectedKey) {
    const stillVisible = result.value.some(
      (row) => row.id === selectedKey || row.canonicalKey === selectedKey,
    );
    if (!stillVisible) {
      selectedKey = null;
      detail = null;
    } else {
      const detailResult = catalog.getProteinProduct(selectedKey);
      detail = detailResult.ok ? detailResult.value : null;
    }
  }
  return {
    ...state,
    loading: false,
    error: null,
    products: result.value,
    selectedKey,
    detail,
  };
}

export function openProteinProduct(
  state: ProteinCatalogUiState,
  idOrKey: string,
): ProteinCatalogUiState {
  const result = catalog.getProteinProduct(idOrKey);
  if (!result.ok) {
    return {
      ...state,
      error: humanizeCatalogError(result.error),
      selectedKey: null,
      detail: null,
    };
  }
  return {
    ...state,
    error: null,
    selectedKey: result.value.product.canonicalKey,
    detail: result.value,
  };
}

export function closeProteinProduct(state: ProteinCatalogUiState): ProteinCatalogUiState {
  return { ...state, selectedKey: null, detail: null };
}

export function familyLabel(family: ProteinFamily): string {
  return PROTEIN_FAMILY_LABELS[family];
}

export function availabilityLabel(value: AvailabilityClass): string {
  return AVAILABILITY_CLASS_LABELS[value];
}

export function productSubtitle(product: ProteinProduct): string {
  const parts = [
    familyLabel(product.proteinFamily),
    product.cut ? `Cut: ${product.cut.replace(/_/g, " ")}` : null,
    product.form ? `Form: ${product.form.replace(/_/g, " ")}` : null,
    product.fatDescriptor ? `Fat: ${product.fatDescriptor}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function nutritionStatusLabel(status: "mapped" | "unmapped"): string {
  return status === "mapped" ? "Nutrition mapped" : "Nutrition unmapped";
}

export function confidenceLabel(confidence: keyof typeof CONFIDENCE_LABELS): string {
  return CONFIDENCE_LABELS[confidence];
}

export function retailerLabel(retailer: keyof typeof RETAILER_LABELS): string {
  return RETAILER_LABELS[retailer];
}

export function availabilityDisclaimer(): string {
  return AVAILABILITY_DISCLAIMER;
}

export function claimsLiveInventory(text: string): boolean {
  if (/\bin stock\b/i.test(text)) return true;
  if (/\bcurrently available at your (local )?store\b/i.test(text)) return true;
  // Negated disclaimer language is allowed.
  if (/\bnot live (local )?inventory\b/i.test(text)) return false;
  return /\blive (local )?inventory\b/i.test(text);
}

export function familyFilterOptions(): Array<{ value: ProteinFamily | "all"; label: string }> {
  return [
    { value: "all", label: "All families" },
    ...catalog.listFamiliesPresent().map((value) => ({
      value,
      label: familyLabel(value),
    })),
  ];
}

export function availabilityFilterOptions(): Array<{
  value: AvailabilityClass | "all";
  label: string;
}> {
  return [
    { value: "all", label: "All availability" },
    ...(Object.keys(AVAILABILITY_CLASS_LABELS) as AvailabilityClass[]).map((value) => ({
      value,
      label: availabilityLabel(value),
    })),
  ];
}

/** Read-only service used by the verification UI (no mutation surface). */
export function getProteinCatalogReadApi() {
  return catalog;
}
