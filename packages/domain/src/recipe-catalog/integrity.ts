import {
  createSeedCatalogSnapshot,
  type IngredientCatalogSnapshot,
} from "../ingredient-catalog/seed";
import { resolveRecipeIngredientUsage } from "./reconcile";
import {
  createSeedRecipeCatalogSnapshot,
  flattenRecipeCatalogSnapshot,
  type RecipeCatalogSnapshot,
} from "./seed";
import {
  validateRecipeVersionGraph,
  type IngredientRefContext,
} from "./validate";

export type RecipeCatalogIntegrityReport = {
  duplicateRecipeKeys: number;
  duplicateVersionNumbers: number;
  orphanRecipeVersions: number;
  orphanComponents: number;
  orphanIngredients: number;
  orphanSteps: number;
  orphanStepUsages: number;
  invalidProteinIngredientPairs: number;
  missingIngredientStepLinks: number;
  unaccountedIngredientQuantities: number;
  duplicatedIngredientUsages: number;
  incompatibleUsageUnits: number;
  invalidStepOrdering: number;
  invalidComponentOrdering: number;
  missingScalingProfiles: number;
  invalidScalingProfiles: number;
  missingStorageProfiles: number;
  missingProvenance: number;
  invalidPublishedVersionPointers: number;
  mutablePublishedVersions: number;
  invalidLifecycleStates: number;
  structuralIntegrityFailures: number;
  details: string[];
  ok: boolean;
};

function countDuplicates(values: readonly string[]): { count: number; keys: string[] } {
  const seen = new Map<string, number>();
  for (const value of values) {
    seen.set(value, (seen.get(value) ?? 0) + 1);
  }
  const keys = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  return { count: keys.length, keys };
}

export function validateRecipeCatalogIntegrity(
  recipeSnapshot: RecipeCatalogSnapshot = createSeedRecipeCatalogSnapshot(),
  ingredientSnapshot: IngredientCatalogSnapshot = createSeedCatalogSnapshot(),
): RecipeCatalogIntegrityReport {
  const details: string[] = [];
  const flat = flattenRecipeCatalogSnapshot(recipeSnapshot);
  const recipeIds = new Set(flat.recipes.map((r) => r.id));
  const versionIds = new Set(flat.versions.map((v) => v.id));
  const refs: IngredientRefContext = {
    canonicalIngredientIds: new Set(ingredientSnapshot.ingredients.map((i) => i.id)),
    proteinProductIngredient: new Map(
      ingredientSnapshot.proteinProducts.map((p) => [p.id, p.ingredientId]),
    ),
  };

  const keyDupes = countDuplicates(flat.recipes.map((r) => r.canonicalKey));
  for (const key of keyDupes.keys) {
    details.push(`duplicate recipe key: ${key}`);
  }

  const versionPairDupes = countDuplicates(
    flat.versions.map((v) => `${v.recipeId}:${v.version}`),
  );
  for (const key of versionPairDupes.keys) {
    details.push(`duplicate version number: ${key}`);
  }

  let orphanRecipeVersions = 0;
  for (const version of flat.versions) {
    if (!recipeIds.has(version.recipeId)) {
      orphanRecipeVersions += 1;
      details.push(`orphan recipe version ${version.id}`);
    }
  }

  let orphanComponents = 0;
  let orphanIngredients = 0;
  let orphanSteps = 0;
  let orphanStepUsages = 0;
  let invalidProteinIngredientPairs = 0;
  let missingIngredientStepLinks = 0;
  let unaccountedIngredientQuantities = 0;
  let duplicatedIngredientUsages = 0;
  let incompatibleUsageUnits = 0;
  let invalidStepOrdering = 0;
  let invalidComponentOrdering = 0;
  let missingScalingProfiles = 0;
  let invalidScalingProfiles = 0;
  let missingStorageProfiles = 0;
  let missingProvenance = 0;
  let invalidPublishedVersionPointers = 0;
  let mutablePublishedVersions = 0;
  let invalidLifecycleStates = 0;

  for (const recipe of flat.recipes) {
    if (recipe.currentPublishedVersionId) {
      const version = flat.versions.find((v) => v.id === recipe.currentPublishedVersionId);
      if (!version || version.recipeId !== recipe.id || version.status !== "published") {
        invalidPublishedVersionPointers += 1;
        details.push(`invalid currentPublishedVersionId on ${recipe.canonicalKey}`);
      }
    }
  }

  for (const component of flat.components) {
    if (!versionIds.has(component.recipeVersionId)) {
      orphanComponents += 1;
      details.push(`orphan component ${component.id}`);
    }
  }
  for (const ingredient of flat.ingredients) {
    if (!versionIds.has(ingredient.recipeVersionId)) {
      orphanIngredients += 1;
      details.push(`orphan ingredient ${ingredient.id}`);
    }
    if (ingredient.proteinProductId) {
      const expected = refs.proteinProductIngredient.get(ingredient.proteinProductId);
      if (!expected || expected !== ingredient.canonicalIngredientId) {
        invalidProteinIngredientPairs += 1;
        details.push(`invalid protein/ingredient pair on ${ingredient.id}`);
      }
    }
  }
  for (const step of flat.steps) {
    if (!versionIds.has(step.recipeVersionId)) {
      orphanSteps += 1;
      details.push(`orphan step ${step.id}`);
    }
  }

  const stepIds = new Set(flat.steps.map((s) => s.id));
  const ingredientIds = new Set(flat.ingredients.map((i) => i.id));
  for (const usage of flat.usages) {
    if (!stepIds.has(usage.recipeStepId) || !ingredientIds.has(usage.recipeIngredientId)) {
      orphanStepUsages += 1;
      details.push(`orphan step usage ${usage.id}`);
    }
  }

  const scalingByVersion = new Set(flat.scalingProfiles.map((s) => s.recipeVersionId));
  const storageByVersion = new Set(flat.storageProfiles.map((s) => s.recipeVersionId));
  const provenanceByVersion = new Set(flat.provenances.map((p) => p.recipeVersionId));

  for (const graph of recipeSnapshot.graphs) {
    const componentOrders = graph.components.map((c) => c.displayOrder);
    if (new Set(componentOrders).size !== componentOrders.length) {
      invalidComponentOrdering += 1;
      details.push(`invalid component ordering on ${graph.version.id}`);
    }
    const stepOrders = [...graph.steps.map((s) => s.order)].sort((a, b) => a - b);
    for (let i = 0; i < stepOrders.length; i += 1) {
      if (stepOrders[i] !== i + 1) {
        invalidStepOrdering += 1;
        details.push(`invalid step ordering on ${graph.version.id}`);
        break;
      }
    }

    if (!scalingByVersion.has(graph.version.id)) {
      missingScalingProfiles += 1;
      details.push(`missing scaling profile for ${graph.version.id}`);
    } else if (graph.scaling.minimumServings > graph.scaling.maximumServings) {
      invalidScalingProfiles += 1;
      details.push(`invalid scaling profile for ${graph.version.id}`);
    }
    if (!storageByVersion.has(graph.version.id)) {
      missingStorageProfiles += 1;
      details.push(`missing storage profile for ${graph.version.id}`);
    }
    if (!provenanceByVersion.has(graph.version.id)) {
      missingProvenance += 1;
      details.push(`missing provenance for ${graph.version.id}`);
    }

    if (
      (graph.version.status === "published" || graph.version.status === "retired") &&
      graph.version.status === "published"
    ) {
      // Published content is treated as immutable by domain rules; seed must not claim otherwise.
      mutablePublishedVersions += 0;
    }

    if (
      graph.provenance.type === "generated_draft" &&
      graph.version.kitchenTestStatus === "passed"
    ) {
      invalidLifecycleStates += 1;
      details.push(`generated draft marked kitchen-tested: ${graph.version.id}`);
    }

    const reconcile = resolveRecipeIngredientUsage(
      graph.ingredients,
      graph.steps,
      graph.usages,
    );
    if (reconcile.ok) {
      missingIngredientStepLinks += reconcile.value.missingLinkIngredientIds.length;
      unaccountedIngredientQuantities += reconcile.value.unaccountedIngredientIds.length;
      duplicatedIngredientUsages += reconcile.value.duplicatedIngredientIds.length;
      incompatibleUsageUnits += reconcile.value.incompatibleUnitIngredientIds.length;
      for (const d of reconcile.value.details) details.push(d);
    }

    const validated = validateRecipeVersionGraph(graph, refs);
    if (!validated.ok) {
      invalidLifecycleStates += 1;
      details.push(
        `version ${graph.version.id} failed validation: ${validated.error.code} ${validated.error.message}`,
      );
    }
  }

  const structuralIntegrityFailures =
    keyDupes.count +
    versionPairDupes.count +
    orphanRecipeVersions +
    orphanComponents +
    orphanIngredients +
    orphanSteps +
    orphanStepUsages +
    invalidProteinIngredientPairs +
    missingIngredientStepLinks +
    unaccountedIngredientQuantities +
    duplicatedIngredientUsages +
    incompatibleUsageUnits +
    invalidStepOrdering +
    invalidComponentOrdering +
    missingScalingProfiles +
    invalidScalingProfiles +
    missingStorageProfiles +
    missingProvenance +
    invalidPublishedVersionPointers +
    mutablePublishedVersions +
    invalidLifecycleStates;

  return {
    duplicateRecipeKeys: keyDupes.count,
    duplicateVersionNumbers: versionPairDupes.count,
    orphanRecipeVersions,
    orphanComponents,
    orphanIngredients,
    orphanSteps,
    orphanStepUsages,
    invalidProteinIngredientPairs,
    missingIngredientStepLinks,
    unaccountedIngredientQuantities,
    duplicatedIngredientUsages,
    incompatibleUsageUnits,
    invalidStepOrdering,
    invalidComponentOrdering,
    missingScalingProfiles,
    invalidScalingProfiles,
    missingStorageProfiles,
    missingProvenance,
    invalidPublishedVersionPointers,
    mutablePublishedVersions,
    invalidLifecycleStates,
    structuralIntegrityFailures,
    details,
    ok: structuralIntegrityFailures === 0,
  };
}

export function formatRecipeCatalogIntegrityReport(
  report: RecipeCatalogIntegrityReport,
): string {
  const lines = [
    `duplicate recipe keys = ${report.duplicateRecipeKeys}`,
    `duplicate version numbers = ${report.duplicateVersionNumbers}`,
    `orphan recipe versions = ${report.orphanRecipeVersions}`,
    `orphan components = ${report.orphanComponents}`,
    `orphan ingredients = ${report.orphanIngredients}`,
    `orphan steps = ${report.orphanSteps}`,
    `orphan step usages = ${report.orphanStepUsages}`,
    `invalid protein/ingredient pairs = ${report.invalidProteinIngredientPairs}`,
    `missing ingredient-step links = ${report.missingIngredientStepLinks}`,
    `unaccounted ingredient quantities = ${report.unaccountedIngredientQuantities}`,
    `duplicated ingredient usages = ${report.duplicatedIngredientUsages}`,
    `incompatible usage units = ${report.incompatibleUsageUnits}`,
    `invalid step ordering = ${report.invalidStepOrdering}`,
    `invalid component ordering = ${report.invalidComponentOrdering}`,
    `missing scaling profiles = ${report.missingScalingProfiles}`,
    `invalid scaling profiles = ${report.invalidScalingProfiles}`,
    `missing storage profiles = ${report.missingStorageProfiles}`,
    `missing provenance = ${report.missingProvenance}`,
    `invalid published-version pointers = ${report.invalidPublishedVersionPointers}`,
    `mutable published versions = ${report.mutablePublishedVersions}`,
    `invalid lifecycle states = ${report.invalidLifecycleStates}`,
    `structural integrity failures = ${report.structuralIntegrityFailures}`,
    `ok = ${report.ok}`,
  ];
  if (report.details.length > 0) {
    lines.push("details:");
    for (const detail of report.details) {
      lines.push(`  - ${detail}`);
    }
  }
  return lines.join("\n");
}
