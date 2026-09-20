import {
  AVAILABILITY_DISCLAIMER,
  ProteinProductListFiltersSchema,
  type AliasResolveResult,
  type CanonicalIngredient,
  type IngredientAlias,
  type IngredientSubstitution,
  type ProteinFamily,
  type ProteinProduct,
  type ProteinProductDetail,
  type ProteinProductListFilters,
  type RetailerAvailabilityEvidence,
} from "@fitness-autopilot/contracts";
import { err, ok, type Result } from "@fitness-autopilot/validation";
import { normalizeIngredientAlias } from "./normalize";
import {
  AMBIGUOUS_ALIAS_TERMS,
  createSeedCatalogSnapshot,
  type IngredientCatalogSnapshot,
} from "./seed";
import { nutritionMappingStatus } from "./validate";

export type CatalogQueryError = {
  code: "invalid_filters" | "not_found" | "invalid_catalog_state";
  message: string;
};

export type IngredientCatalogStore = IngredientCatalogSnapshot;

export function createInMemoryCatalogStore(
  snapshot: IngredientCatalogSnapshot = createSeedCatalogSnapshot(),
): IngredientCatalogStore {
  return snapshot;
}

function matchesSearch(product: ProteinProduct, search: string): boolean {
  const needle = normalizeIngredientAlias(search);
  if (!needle) return true;
  const haystack = [
    product.displayName,
    product.canonicalKey,
    product.cut ?? "",
    product.form,
    product.fatDescriptor ?? "",
    product.species ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function listProteinProducts(
  store: IngredientCatalogStore,
  filters: Partial<ProteinProductListFilters> = {},
): Result<ProteinProduct[], CatalogQueryError> {
  const parsed = ProteinProductListFiltersSchema.safeParse(filters);
  if (!parsed.success) {
    return err({
      code: "invalid_filters",
      message: parsed.error.issues[0]?.message ?? "Invalid protein product filters",
    });
  }
  const { proteinFamily, availabilityClass, activeOnly, search } = parsed.data;
  let rows = store.proteinProducts.slice();
  if (activeOnly !== false) {
    rows = rows.filter((row) => row.active);
  }
  if (proteinFamily) {
    rows = rows.filter((row) => row.proteinFamily === proteinFamily);
  }
  if (availabilityClass) {
    rows = rows.filter((row) => row.availabilityClass === availabilityClass);
  }
  if (search && search.trim().length > 0) {
    rows = rows.filter((row) => matchesSearch(row, search));
  }
  rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return ok(rows);
}

export function getProteinProduct(
  store: IngredientCatalogStore,
  idOrKey: string,
): Result<ProteinProductDetail, CatalogQueryError> {
  const key = idOrKey.trim();
  const product = store.proteinProducts.find(
    (row) => row.id === key || row.canonicalKey === key,
  );
  if (!product) {
    return err({ code: "not_found", message: `Protein product not found: ${key}` });
  }
  const ingredient = store.ingredients.find((row) => row.id === product.ingredientId);
  if (!ingredient) {
    return err({
      code: "invalid_catalog_state",
      message: `Orphan protein product ${product.canonicalKey}`,
    });
  }
  const aliases = store.aliases.filter((row) => row.ingredientId === ingredient.id);
  const retailerEvidence = store.retailerEvidence.filter(
    (row) =>
      row.proteinProductId === product.id || row.ingredientId === ingredient.id,
  );
  const approvedSubstitutions = store.substitutions.filter(
    (row) =>
      row.approved &&
      (row.sourceIngredientId === ingredient.id ||
        row.substituteIngredientId === ingredient.id),
  );
  return ok({
    product,
    ingredient,
    nutritionMappingStatus: nutritionMappingStatus(ingredient),
    aliases,
    retailerEvidence,
    approvedSubstitutions,
    availabilityDisclaimer: AVAILABILITY_DISCLAIMER,
  });
}

export function listRetailerEvidenceForProtein(
  store: IngredientCatalogStore,
  proteinProductId: string,
): Result<RetailerAvailabilityEvidence[], CatalogQueryError> {
  const product = store.proteinProducts.find((row) => row.id === proteinProductId);
  if (!product) {
    return err({
      code: "not_found",
      message: `Protein product not found: ${proteinProductId}`,
    });
  }
  return ok(
    store.retailerEvidence.filter((row) => row.proteinProductId === proteinProductId),
  );
}

export function resolveIngredientAlias(
  store: IngredientCatalogStore,
  alias: string,
): AliasResolveResult {
  const normalized = normalizeIngredientAlias(alias);
  if (!normalized) {
    return { kind: "not_found", alias };
  }

  const ambiguous = AMBIGUOUS_ALIAS_TERMS.get(normalized);
  if (ambiguous) {
    return {
      kind: "ambiguous",
      alias: normalized,
      candidateIngredientIds: [...ambiguous],
      reason: "refinement_required",
    };
  }

  const aliasHits = store.aliases.filter((row) => row.normalizedAlias === normalized);
  if (aliasHits.length > 1) {
    return {
      kind: "ambiguous",
      alias: normalized,
      candidateIngredientIds: [...new Set(aliasHits.map((row) => row.ingredientId))],
      reason: "duplicate_alias",
    };
  }
  if (aliasHits.length === 1) {
    const ingredient = store.ingredients.find((row) => row.id === aliasHits[0]!.ingredientId);
    if (!ingredient) {
      return { kind: "not_found", alias: normalized };
    }
    return {
      kind: "resolved",
      ingredientId: ingredient.id,
      canonicalKey: ingredient.canonicalKey,
      displayName: ingredient.displayName,
    };
  }

  const ingredientByKey = store.ingredients.find(
    (row) =>
      row.canonicalKey === normalized.replace(/\s+/g, "_") ||
      normalizeIngredientAlias(row.displayName) === normalized,
  );
  if (ingredientByKey) {
    return {
      kind: "resolved",
      ingredientId: ingredientByKey.id,
      canonicalKey: ingredientByKey.canonicalKey,
      displayName: ingredientByKey.displayName,
    };
  }

  return { kind: "not_found", alias: normalized };
}

export function getIngredientById(
  store: IngredientCatalogStore,
  ingredientId: string,
): CanonicalIngredient | undefined {
  return store.ingredients.find((row) => row.id === ingredientId);
}

export function listAliasesForIngredient(
  store: IngredientCatalogStore,
  ingredientId: string,
): IngredientAlias[] {
  return store.aliases.filter((row) => row.ingredientId === ingredientId);
}

export function listApprovedSubstitutionsFrom(
  store: IngredientCatalogStore,
  sourceIngredientId: string,
): IngredientSubstitution[] {
  return store.substitutions.filter(
    (row) => row.approved && row.sourceIngredientId === sourceIngredientId,
  );
}

/** Read-only catalog facade — no mutation methods. */
export type ProteinCatalogService = {
  listProteinProducts: (
    filters?: Partial<ProteinProductListFilters>,
  ) => Result<ProteinProduct[], CatalogQueryError>;
  getProteinProduct: (idOrKey: string) => Result<ProteinProductDetail, CatalogQueryError>;
  resolveIngredientAlias: (alias: string) => AliasResolveResult;
  listRetailerEvidenceForProtein: (
    proteinProductId: string,
  ) => Result<RetailerAvailabilityEvidence[], CatalogQueryError>;
  listFamiliesPresent: () => ProteinFamily[];
};

export function createProteinCatalogService(
  store: IngredientCatalogStore = createInMemoryCatalogStore(),
): ProteinCatalogService {
  return {
    listProteinProducts: (filters) => listProteinProducts(store, filters),
    getProteinProduct: (idOrKey) => getProteinProduct(store, idOrKey),
    resolveIngredientAlias: (alias) => resolveIngredientAlias(store, alias),
    listRetailerEvidenceForProtein: (proteinProductId) =>
      listRetailerEvidenceForProtein(store, proteinProductId),
    listFamiliesPresent: () => {
      const families = new Set(
        store.proteinProducts.filter((row) => row.active).map((row) => row.proteinFamily),
      );
      return [...families].sort();
    },
  };
}
