import type { IngredientCatalogSnapshot } from "./seed";
import { createSeedCatalogSnapshot } from "./seed";
import { normalizeIngredientAlias } from "./normalize";
import {
  validateCanonicalIngredient,
  validateIngredientAlias,
  validateIngredientSubstitution,
  validateProteinProduct,
  validateRetailerEvidence,
  nutritionMappingStatus,
} from "./validate";

export type CatalogIntegrityReport = {
  duplicateCanonicalIngredientKeys: number;
  duplicateProteinProductKeys: number;
  orphanProteinProducts: number;
  duplicateNormalizedAliases: number;
  ambiguousAliases: number;
  invalidRetailerEvidence: number;
  verifiedEvidenceMissingSource: number;
  verifiedEvidenceMissingTimestamp: number;
  selfSubstitutions: number;
  orphanSubstitutions: number;
  structuralIntegrityFailures: number;
  unmappedNutritionRecords: number;
  inactiveOrMalformedSeedRecords: number;
  details: string[];
  ok: boolean;
};

function countDuplicates(values: readonly string[]): { count: number; keys: string[] } {
  const seen = new Map<string, number>();
  for (const value of values) {
    seen.set(value, (seen.get(value) ?? 0) + 1);
  }
  const keys = [...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key);
  return { count: keys.length, keys };
}

export function validateCatalogIntegrity(
  snapshot: IngredientCatalogSnapshot = createSeedCatalogSnapshot(),
): CatalogIntegrityReport {
  const details: string[] = [];
  let invalidRetailerEvidence = 0;
  let verifiedEvidenceMissingSource = 0;
  let verifiedEvidenceMissingTimestamp = 0;
  let selfSubstitutions = 0;
  let orphanSubstitutions = 0;
  let inactiveOrMalformedSeedRecords = 0;
  let orphanProteinProducts = 0;
  let ambiguousAliases = 0;

  const ingredientIds = new Set(snapshot.ingredients.map((row) => row.id));
  const productIds = new Set(snapshot.proteinProducts.map((row) => row.id));

  for (const ingredient of snapshot.ingredients) {
    const result = validateCanonicalIngredient(ingredient);
    if (!result.ok) {
      inactiveOrMalformedSeedRecords += 1;
      details.push(`malformed ingredient ${ingredient.canonicalKey}: ${result.error.message}`);
    }
  }

  const ingredientKeyDupes = countDuplicates(
    snapshot.ingredients.map((row) => row.canonicalKey),
  );
  for (const key of ingredientKeyDupes.keys) {
    details.push(`duplicate canonical ingredient key: ${key}`);
  }

  for (const product of snapshot.proteinProducts) {
    const result = validateProteinProduct(product, ingredientIds);
    if (!result.ok) {
      if (result.error.code === "orphan_protein_product") {
        orphanProteinProducts += 1;
      } else {
        inactiveOrMalformedSeedRecords += 1;
      }
      details.push(`protein ${product.canonicalKey}: ${result.error.message}`);
    }
  }

  const productKeyDupes = countDuplicates(
    snapshot.proteinProducts.map((row) => row.canonicalKey),
  );
  for (const key of productKeyDupes.keys) {
    details.push(`duplicate protein-product key: ${key}`);
  }

  const aliasDupes = countDuplicates(
    snapshot.aliases.map((row) => normalizeIngredientAlias(row.normalizedAlias)),
  );
  for (const key of aliasDupes.keys) {
    details.push(`duplicate normalized alias: ${key}`);
  }

  const aliasGroups = new Map<string, string[]>();
  for (const alias of snapshot.aliases) {
    const result = validateIngredientAlias(alias);
    if (!result.ok) {
      inactiveOrMalformedSeedRecords += 1;
      details.push(`malformed alias ${alias.displayAlias}: ${result.error.message}`);
    }
    if (!ingredientIds.has(alias.ingredientId)) {
      orphanSubstitutions += 1;
      details.push(`alias ${alias.normalizedAlias} references missing ingredient`);
    }
    const group = aliasGroups.get(alias.normalizedAlias) ?? [];
    group.push(alias.ingredientId);
    aliasGroups.set(alias.normalizedAlias, group);
  }
  for (const [alias, ingredientList] of aliasGroups) {
    const unique = new Set(ingredientList);
    if (unique.size > 1) {
      ambiguousAliases += 1;
      details.push(`ambiguous alias "${alias}" → ${[...unique].join(", ")}`);
    }
  }

  for (const evidence of snapshot.retailerEvidence) {
    const result = validateRetailerEvidence(evidence);
    if (!result.ok) {
      invalidRetailerEvidence += 1;
      details.push(`invalid evidence ${evidence.id}: ${result.error.message}`);
      if (evidence.confidence === "verified" && !evidence.sourceUrl) {
        verifiedEvidenceMissingSource += 1;
      }
      if (evidence.confidence === "verified" && !evidence.verifiedAt) {
        verifiedEvidenceMissingTimestamp += 1;
      }
      continue;
    }
    const targetOk =
      (evidence.proteinProductId && productIds.has(evidence.proteinProductId)) ||
      (evidence.ingredientId && ingredientIds.has(evidence.ingredientId));
    if (!targetOk) {
      invalidRetailerEvidence += 1;
      details.push(`evidence ${evidence.id} targets missing catalog row`);
    }
  }

  for (const substitution of snapshot.substitutions) {
    const result = validateIngredientSubstitution(substitution);
    if (!result.ok) {
      if (result.error.code === "self_substitution") {
        selfSubstitutions += 1;
      } else {
        inactiveOrMalformedSeedRecords += 1;
      }
      details.push(`substitution ${substitution.id}: ${result.error.message}`);
    }
    if (
      !ingredientIds.has(substitution.sourceIngredientId) ||
      !ingredientIds.has(substitution.substituteIngredientId)
    ) {
      orphanSubstitutions += 1;
      details.push(`substitution ${substitution.id} references missing ingredient`);
    }
  }

  const unmappedNutritionRecords = snapshot.ingredients.filter(
    (row) => nutritionMappingStatus(row) === "unmapped",
  ).length;

  const structuralIntegrityFailures =
    ingredientKeyDupes.count +
    productKeyDupes.count +
    orphanProteinProducts +
    aliasDupes.count +
    ambiguousAliases +
    invalidRetailerEvidence +
    verifiedEvidenceMissingSource +
    verifiedEvidenceMissingTimestamp +
    selfSubstitutions +
    orphanSubstitutions +
    inactiveOrMalformedSeedRecords;

  return {
    duplicateCanonicalIngredientKeys: ingredientKeyDupes.count,
    duplicateProteinProductKeys: productKeyDupes.count,
    orphanProteinProducts,
    duplicateNormalizedAliases: aliasDupes.count,
    ambiguousAliases,
    invalidRetailerEvidence,
    verifiedEvidenceMissingSource,
    verifiedEvidenceMissingTimestamp,
    selfSubstitutions,
    orphanSubstitutions,
    structuralIntegrityFailures,
    unmappedNutritionRecords,
    inactiveOrMalformedSeedRecords,
    details,
    ok: structuralIntegrityFailures === 0,
  };
}

export function formatCatalogIntegrityReport(report: CatalogIntegrityReport): string {
  const lines = [
    `duplicate canonical ingredient keys = ${report.duplicateCanonicalIngredientKeys}`,
    `duplicate protein-product keys = ${report.duplicateProteinProductKeys}`,
    `orphan protein products = ${report.orphanProteinProducts}`,
    `duplicate normalized aliases = ${report.duplicateNormalizedAliases}`,
    `ambiguous aliases = ${report.ambiguousAliases}`,
    `invalid retailer evidence = ${report.invalidRetailerEvidence}`,
    `verified evidence missing source = ${report.verifiedEvidenceMissingSource}`,
    `verified evidence missing timestamp = ${report.verifiedEvidenceMissingTimestamp}`,
    `self-substitutions = ${report.selfSubstitutions}`,
    `orphan substitutions = ${report.orphanSubstitutions}`,
    `structural integrity failures = ${report.structuralIntegrityFailures}`,
    `unmapped nutrition records = ${report.unmappedNutritionRecords}`,
    `inactive or malformed seed records = ${report.inactiveOrMalformedSeedRecords}`,
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
