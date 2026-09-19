import type {
  GroceryAggregationDiagnostics,
  GroceryList,
  GrocerySection,
} from "../../contracts/index.ts";
import { GROCERY_AGGREGATION_POLICY_VERSION } from "../../contracts/index.ts";
import { aggregateIngredientRequirements, formatGroceryItemDiagnostics } from "./aggregate.ts";
import {
  collectGroceryDemands,
  expandIngredientRequirements,
  type GroceryDerivationContext,
} from "./expand.ts";
import { GROCERY_CATEGORY_ORDER } from "./policy.ts";
import type { GroceryDerivationIssue, IngredientRequirement } from "./types.ts";

export type DeriveGroceryListResult =
  | {
      ok: true;
      groceryList: GroceryList;
      requirements: IngredientRequirement[];
      issues: GroceryDerivationIssue[];
    }
  | {
      ok: false;
      code: GroceryDerivationIssue["code"];
      message: string;
      issues: GroceryDerivationIssue[];
      groceryList?: GroceryList;
    };

/**
 * PLAN-012 entry point: derive a deterministic grocery list from a finalized plan.
 *
 * Idempotent: same finalized plan + recipes + policy → same requirements.
 * Does not mutate the nutrition plan.
 */
export function deriveGroceryList(ctx: GroceryDerivationContext): DeriveGroceryListResult {
  const plan = ctx.personalizedWeeklyPlan;
  if (!plan.finalization || plan.finalization.validationStatus !== "finalized") {
    return {
      ok: false,
      code: "MISSING_FINALIZED_PLAN",
      message: "Grocery aggregation requires a PLAN-011 finalized weekly nutrition plan.",
      issues: [
        {
          code: "MISSING_FINALIZED_PLAN",
          message: "Plan is not finalized.",
          preservable: false,
        },
      ],
    };
  }

  const collected = collectGroceryDemands(ctx);
  const expanded = expandIngredientRequirements(
    ctx,
    collected.recipeBuckets,
    collected.atomicDemands,
  );
  const issues = [...collected.issues, ...expanded.issues];

  const hardFailures = issues.filter((i) => !i.preservable);
  // Only fail the whole list when we cannot produce any requirements and have hard failures.
  if (expanded.requirements.length === 0 && hardFailures.length > 0) {
    return {
      ok: false,
      code: hardFailures[0]!.code,
      message: hardFailures[0]!.message,
      issues,
    };
  }

  if (
    expanded.requirements.filter((r) => !r.excludedAsNonPurchased && r.quantity > 0).length === 0 &&
    hardFailures.length === 0
  ) {
    return {
      ok: false,
      code: "EMPTY_PLAN",
      message: "No grocery demand could be derived from the finalized plan.",
      issues,
    };
  }

  const { items, reconciliation } = aggregateIngredientRequirements(expanded.requirements);

  const sectionsMap = new Map<GrocerySection["category"], GrocerySection>();
  for (const category of GROCERY_CATEGORY_ORDER) {
    sectionsMap.set(category, { category, items: [] });
  }
  for (const item of items) {
    const section = sectionsMap.get(item.category) ?? {
      category: item.category,
      items: [],
    };
    section.items.push(item);
    sectionsMap.set(item.category, section);
  }
  const sections = GROCERY_CATEGORY_ORDER.map((c) => sectionsMap.get(c)!).filter(
    (s) => s.items.length > 0,
  );

  const diagnostics: GroceryAggregationDiagnostics = {
    policyVersion: GROCERY_AGGREGATION_POLICY_VERSION,
    sourceIngredientRequirementCount: reconciliation.sourceIngredientRequirementCount,
    aggregatedItemCount: reconciliation.aggregatedItemCount,
    droppedRequirementCount: reconciliation.droppedRequirementCount,
    duplicateRequirementCount: reconciliation.duplicateRequirementCount,
    excludedNonPurchasedCount: reconciliation.excludedNonPurchasedCount,
    incompatibleQuantityLineCount: reconciliation.incompatibleQuantityLineCount,
    issues,
  };

  const groceryList: GroceryList = {
    generatedPlanId: plan.generatedPlanId,
    weekStart: plan.weekStart,
    weekEnd: plan.weekEnd,
    aggregationPolicyVersion: GROCERY_AGGREGATION_POLICY_VERSION,
    sections,
    generatedAt: ctx.generatedAt ?? plan.generatedAt,
    available: sections.length > 0,
    progress: {
      totalItems: items.length,
      readyItems: 0,
    },
    diagnostics,
  };

  return {
    ok: true,
    groceryList,
    requirements: expanded.requirements,
    issues,
  };
}

/**
 * Attach a derived grocery list onto a consumer weekly plan without altering nutrition.
 */
export function attachGroceryList<T extends { groceryList?: GroceryList }>(
  plan: T,
  groceryList: GroceryList,
): T {
  return {
    ...plan,
    groceryList,
  };
}

/** Developer diagnostics dump for a grocery list. */
export function formatGroceryListDiagnostics(list: GroceryList): string {
  const lines: string[] = [
    `PLAN-012 grocery list`,
    `  plan: ${list.generatedPlanId ?? "—"}`,
    `  policy: ${list.aggregationPolicyVersion}`,
    `  available: ${list.available === true}`,
    `  items: ${list.progress?.totalItems ?? list.sections.reduce((n, s) => n + s.items.length, 0)}`,
  ];
  if (list.diagnostics) {
    const d = list.diagnostics;
    lines.push(
      `  reconciliation: source=${d.sourceIngredientRequirementCount} aggregated=${d.aggregatedItemCount} dropped=${d.droppedRequirementCount} dupes=${d.duplicateRequirementCount} excluded=${d.excludedNonPurchasedCount} incompatibleLines=${d.incompatibleQuantityLineCount}`,
    );
  }
  for (const section of list.sections) {
    lines.push(`  [${section.category}]`);
    for (const item of section.items) {
      lines.push(formatGroceryItemDiagnostics(item).replace(/^/gm, "    "));
    }
  }
  return lines.join("\n");
}

export type { GroceryDerivationContext };
