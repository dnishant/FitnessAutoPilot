#!/usr/bin/env node
/**
 * RECIPE-001 integrity check — run via `pnpm recipe-catalog:integrity`.
 */
import {
  formatRecipeCatalogIntegrityReport,
  validateRecipeCatalogIntegrity,
} from "../packages/domain/src/recipe-catalog/integrity.ts";

const report = validateRecipeCatalogIntegrity();
const text = formatRecipeCatalogIntegrityReport(report);
console.log(text);
process.exit(report.ok ? 0 : 1);
