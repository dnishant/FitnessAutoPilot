import type {
  CompleteMeal,
  CompleteMealComponent,
  MealCompositionProposal,
  MealCompositionRequest,
  MealConceptComponent,
  MealUnderstanding,
} from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";
import { namesLikelyEquivalent, normalizeComponentName } from "./component-identity.ts";
import { isUnresolvedPlaceholderName } from "./placeholders.ts";
import {
  mealCompositionError,
  type MealCompositionError,
} from "./validate.ts";

export type StructureValidationFailure = MealCompositionError;

function existingNamesFromRequest(request: MealCompositionRequest): string[] {
  return [
    request.candidate?.name,
    request.ranked?.candidate.name,
    request.recipe?.name,
    ...(request.recipe?.mealComponents.map((c) => c.name) ?? []),
    ...(request.recipe?.ingredients.map((i) => i.name) ?? []),
  ].filter((name): name is string => typeof name === "string" && name.length > 0);
}

function existingNamesFromUnderstanding(understanding: MealUnderstanding): string[] {
  return understanding.existingComponents.map((c) => c.name);
}

/**
 * Semantic duplicate: same culinary side/companion, not mere ingredient overlap.
 * Yogurt-in-marinade vs cucumber raita should NOT match — different purpose/role.
 */
export function isSemanticDuplicateSide(input: {
  proposedName: string;
  proposedRole: string;
  existingName: string;
  existingRole?: string;
  existingPurpose?: string;
  proposedPurpose?: string;
}): boolean {
  if (namesLikelyEquivalent(input.proposedName, input.existingName)) return true;

  const a = normalizeComponentName(input.proposedName);
  const b = normalizeComponentName(input.existingName);
  if (!a || !b) return false;

  // Shared distinctive head noun + same role → likely same side (arugula salad variants).
  const aTokens = new Set(a.split(" ").filter((t) => t.length > 2));
  const bTokens = new Set(b.split(" ").filter((t) => t.length > 2));
  const shared = [...aTokens].filter((t) => bTokens.has(t));
  const distinctive = shared.filter(
    (t) =>
      !["with", "and", "the", "light", "mixed", "fresh", "simple", "side"].includes(t),
  );

  if (
    input.existingRole &&
    input.proposedRole === input.existingRole &&
    distinctive.length >= 2 &&
    (a.includes("salad") || b.includes("salad") || a.includes("slaw") || b.includes("slaw"))
  ) {
    return true;
  }

  // Purpose clash: marinade vs accompaniment — not duplicates.
  const purpose = `${input.existingPurpose ?? ""} ${input.proposedPurpose ?? ""}`.toLowerCase();
  if (/\bmarinade\b/.test(purpose) && /\b(raita|chutney|sauce|dressing|salad)\b/.test(a + " " + b)) {
    return false;
  }

  return false;
}

/**
 * Validate Culinary Meal Architect proposal structure before merge.
 */
export function validateMealArchitectProposalStructure(
  proposal: MealCompositionProposal,
  request: MealCompositionRequest,
  existingComponents: readonly MealConceptComponent[],
): Result<MealCompositionProposal, StructureValidationFailure> {
  const understanding = proposal.mealUnderstanding;

  if (understanding.confidence === "low") {
    return err(
      mealCompositionError(
        "MEAL_STRUCTURE_UNRESOLVED",
        "Culinary Meal Architect returned low-confidence meal understanding.",
        { confidence: understanding.confidence },
      ),
    );
  }

  if (understanding.additionsRecommended === false && proposal.addedComponents.length > 0) {
    return err(
      mealCompositionError(
        "INVALID_COMPOSITION",
        "additionsRecommended was false but addedComponents is non-empty.",
      ),
    );
  }

  if (
    (proposal.noAdditionsNeeded || understanding.isStandaloneMeal) &&
    proposal.addedComponents.length > 0 &&
    understanding.additionsRecommended === false
  ) {
    return err(
      mealCompositionError(
        "INVALID_COMPOSITION",
        "Standalone / no-additions meal must not introduce added components.",
      ),
    );
  }

  const existingNames = [
    ...existingNamesFromRequest(request),
    ...existingNamesFromUnderstanding(understanding),
    ...existingComponents.map((c) => c.name),
  ];

  for (const added of proposal.addedComponents) {
    if (isUnresolvedPlaceholderName(added.name)) {
      return err(
        mealCompositionError(
          "UNRESOLVED_COMPONENT_IDENTITY",
          `Added component "${added.name}" is a planning placeholder, not edible food.`,
          { component: added.name },
        ),
      );
    }

    if (understanding.additionsRecommended && !added.satisfiesMissingNeed && !added.culinaryReason) {
      // Soft: prefer justification; reason field may stand in for culinaryReason.
      if (!added.reason) {
        return err(
          mealCompositionError(
            "INVALID_COMPOSITION",
            `Addition "${added.name}" lacks a culinary justification for a missing need.`,
          ),
        );
      }
    }

    for (const existing of existingComponents) {
      if (
        isSemanticDuplicateSide({
          proposedName: added.name,
          proposedRole: added.role,
          existingName: existing.name,
          existingRole: existing.role,
          existingPurpose: existing.reason,
          proposedPurpose: added.culinaryReason ?? added.reason,
        })
      ) {
        return err(
          mealCompositionError(
            "SEMANTIC_DUPLICATE_COMPONENT",
            `Added component "${added.name}" duplicates existing "${existing.name}".`,
            { proposed: added.name, existing: existing.name },
          ),
        );
      }
    }

    for (const name of existingNames) {
      if (
        isSemanticDuplicateSide({
          proposedName: added.name,
          proposedRole: added.role,
          existingName: name,
          proposedPurpose: added.culinaryReason ?? added.reason,
        })
      ) {
        return err(
          mealCompositionError(
            "SEMANTIC_DUPLICATE_COMPONENT",
            `Added component "${added.name}" duplicates existing food "${name}".`,
            { proposed: added.name, existing: name },
          ),
        );
      }
    }
  }

  return ok(proposal);
}

/**
 * Deterministic CompleteMeal structural validation before PLAN-010.
 */
export function validateCompleteMealStructure(
  meal: CompleteMeal,
): Result<CompleteMeal, StructureValidationFailure> {
  const seenIndependentKeys = new Set<string>();
  const seenIndependentIds = new Set<string>();
  let independentMainCount = 0;

  for (const component of meal.components) {
    if (isUnresolvedPlaceholderName(component.name)) {
      return err(
        mealCompositionError(
          "UNRESOLVED_COMPONENT_IDENTITY",
          `Placeholder "${component.name}" cannot proceed to authoritative nutrition.`,
          { componentId: component.componentId, mealId: meal.mealId },
        ),
      );
    }

    const ownership = component.nutritionOwnership ?? "independent";
    if (ownership !== "independent") continue;

    if (seenIndependentIds.has(component.componentId)) {
      return err(
        mealCompositionError(
          "DUPLICATE_COMPONENT_OWNERSHIP",
          `Duplicate independent componentId "${component.componentId}".`,
          { componentId: component.componentId },
        ),
      );
    }
    seenIndependentIds.add(component.componentId);

    if (seenIndependentKeys.has(component.normalizedComponentKey)) {
      return err(
        mealCompositionError(
          "DUPLICATE_COMPONENT_OWNERSHIP",
          `Duplicate independent component key "${component.normalizedComponentKey}".`,
          { key: component.normalizedComponentKey },
        ),
      );
    }
    seenIndependentKeys.add(component.normalizedComponentKey);

    if (component.role === "main") independentMainCount += 1;
  }

  if (independentMainCount !== 1) {
    return err(
      mealCompositionError(
        "MEAL_STRUCTURE_UNRESOLVED",
        `Meal "${meal.name}" must have exactly one independent main nutritional owner (found ${independentMainCount}).`,
      ),
    );
  }

  // Parent + child both independent for overlapping food is already prevented by
  // ownership assignment; additionally reject identical names across ownership.
  const independent = meal.components.filter(
    (c) => (c.nutritionOwnership ?? "independent") === "independent",
  );
  for (let i = 0; i < independent.length; i += 1) {
    for (let j = i + 1; j < independent.length; j += 1) {
      const a = independent[i]!;
      const b = independent[j]!;
      if (
        isSemanticDuplicateSide({
          proposedName: a.name,
          proposedRole: a.role,
          existingName: b.name,
          existingRole: b.role,
        })
      ) {
        return err(
          mealCompositionError(
            "DUPLICATE_COMPONENT_OWNERSHIP",
            `Independent components "${a.name}" and "${b.name}" represent the same food.`,
          ),
        );
      }
    }
  }

  return ok(meal);
}

export function filterPlaceholdersFromComponents<T extends { name: string }>(
  components: readonly T[],
): T[] {
  return components.filter((c) => !isUnresolvedPlaceholderName(c.name));
}

export function assertIndependentOwnersHaveStableIds(
  components: readonly CompleteMealComponent[],
): boolean {
  const ids = components
    .filter((c) => (c.nutritionOwnership ?? "independent") === "independent")
    .map((c) => c.componentId);
  return ids.length === new Set(ids).size;
}
