#!/usr/bin/env node
/**
 * CATALOG-001 integrity check — run via `pnpm catalog:integrity`.
 */
import {
  formatCatalogIntegrityReport,
  validateCatalogIntegrity,
} from "../packages/domain/src/ingredient-catalog/integrity.ts";

const report = validateCatalogIntegrity();
const text = formatCatalogIntegrityReport(report);
console.log(text);
process.exit(report.ok ? 0 : 1);
