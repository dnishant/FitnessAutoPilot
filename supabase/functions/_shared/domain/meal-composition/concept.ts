import type {
  CandidateCompositionTrace,
  CulinaryDiscoveryCandidate,
  MealCompositionDiagnostics,
  MealCompositionFailure,
  MealCompositionProposal,
  MealCompositionRequest,
  MealConcept,
  MealConceptComponent,
  RankedCulinaryCandidate,
  ResolvedRecipe,
  WeeklyMealConceptResult,
} from "../../contracts/index.ts";
import {
  DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
  FIBER_POLICY_VERSION,
  MEAL_COMPOSITION_POLICY_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
} from "../../contracts/index.ts";
import { err, ok, type Result } from "../../validation/index.ts";
import { calculateFiberTarget } from "../nutrition/fiber.ts";
import { mapWithConcurrency } from "../recipes/recipe-resolution.ts";
import {
  candidateFromResolvedRecipe,
  detectRolesForCompositionRequest,
} from "./candidate-role-detection.ts";
import { buildNormalizedComponentKey, namesLikelyEquivalent } from "./component-identity.ts";
import { subjectCandidateFromRequest } from "./prompt.ts";
import type { MealCompositionProvider } from "./provider.ts";
import { summarizeMealConceptRepertoire } from "./repertoire.ts";
import { missingRolesFromProfile } from "./role-detection.ts";
import {
  mealCompositionError,
  validateMealCompositionProposal,
  type MealCompositionError,
} from "./validate.ts";

export {
  DEFAULT_MEAL_COMPOSITION_CONCURRENCY,
  MEAL_COMPOSITION_POLICY_VERSION,
  MEAL_COMPOSITION_PROMPT_VERSION,
};

function likelyCompleteFromProfile(
  profile: MealConcept["compositionProfile"],
  missing: string[],
): boolean {
  return (
    missing.length === 0 &&
    profile.hasPrimaryProtein &&
    profile.hasMeaningfulCarbohydrate &&
    profile.hasMeaningfulVegetableOrFruit
  );
}

function mergeProposalIntoConcept(input: {
  candidate: CulinaryDiscoveryCandidate;
  mealType?: MealConcept["mealType"];
  proposal: MealCompositionProposal;
  existing: MealConceptComponent[];
  providerMeta: {
    provider?: string;
    model?: string;
    requestId?: string;
    durationMs?: number;
    providerCalled: boolean;
  };
  createdAt: string;
  existingRoles: MealConcept["compositionProfile"];
}): MealConcept {
  const companions = [...input.existing.filter((c) => c.role !== "main")];
  const main =
    input.existing.find((c) => c.role === "main") ??
    ({
      componentId: "main",
      role: "main" as const,
      name: input.candidate.name,
      relationship: "intrinsic" as const,
      source: "candidate" as const,
      reason: "Ranked main-dish candidate",
      definitionKind: "recipe_component" as const,
      normalizedComponentKey: `main:${input.candidate.name.toLowerCase()}`,
    } satisfies MealConceptComponent);

  const addedRoles: MealConcept["compositionProfile"]["addedComponentRoles"] = [];
  let idx = 0;
  for (const added of input.proposal.addedComponents) {
    if (companions.some((c) => c.role === added.role && namesLikelyEquivalent(c.name, added.name))) {
      continue;
    }
    addedRoles.push(added.role);
    companions.push({
      componentId: `added-${idx}-${added.role}`,
      role: added.role,
      name: added.name,
      relationship: added.relationship,
      source: "composition_engine",
      reason: added.reason,
      definitionKind: added.definitionKind,
      normalizedComponentKey: buildNormalizedComponentKey(added.role, added.name),
    });
    idx += 1;
  }

  const profile = {
    ...input.existingRoles,
    addedComponentRoles: addedRoles,
  };
  for (const role of addedRoles) {
    if (role === "carbohydrate") profile.hasMeaningfulCarbohydrate = true;
    if (role === "vegetable" || role === "fruit") {
      profile.hasMeaningfulVegetableOrFruit = true;
      profile.hasMeaningfulFiberSource = true;
    }
    if (role === "legume") {
      profile.hasMeaningfulVegetableOrFruit = true;
      profile.hasMeaningfulFiberSource = true;
      profile.hasMeaningfulCarbohydrate = true;
    }
    if (role === "sauce_condiment") profile.hasSauceOrMoistureComponent = true;
  }

  return {
    candidateId: input.candidate.candidateId,
    name: input.proposal.mealName || input.candidate.name,
    mealType: input.mealType,
    main,
    components: companions,
    compositionProfile: profile,
    compositionSummary: input.proposal.compositionSummary,
    metadata: {
      provider: input.providerMeta.provider,
      model: input.providerMeta.model,
      promptVersion: MEAL_COMPOSITION_PROMPT_VERSION,
      policyVersion: MEAL_COMPOSITION_POLICY_VERSION,
      requestId: input.providerMeta.requestId,
      durationMs: input.providerMeta.durationMs,
      createdAt: input.createdAt,
      providerCalled: input.providerMeta.providerCalled,
    },
  };
}

export type ComposeMealConceptOptions = {
  provider: MealCompositionProvider;
  providerMeta?: {
    provider?: string;
    model?: string;
    requestId?: string;
  };
  existingComponentKeys?: string[];
  otherSelectedMealNames?: string[];
  now?: () => Date;
};

export async function composeMealConcept(
  request: MealCompositionRequest,
  options: ComposeMealConceptOptions,
): Promise<Result<MealConcept, MealCompositionError>> {
  const candidate = subjectCandidateFromRequest(request);
  const detected = detectRolesForCompositionRequest({
    candidate,
    recipe: request.recipe,
  });
  const enrichedRequest: MealCompositionRequest = {
    ...request,
    candidate,
    compositionContext: {
      otherSelectedMealNames:
        request.compositionContext?.otherSelectedMealNames ?? options.otherSelectedMealNames,
      existingComponentKeys:
        request.compositionContext?.existingComponentKeys ?? options.existingComponentKeys,
      existingRoles: request.compositionContext?.existingRoles ?? detected.profile,
      nutritionSignals: request.compositionContext?.nutritionSignals,
    },
  };

  let proposal: MealCompositionProposal;
  let providerCalled = false;
  const started = Date.now();
  try {
    const missing = missingRolesFromProfile(
      detected.profile,
      detected.profile.hasMeaningfulFiberSource
        ? { proteinPresence: "meaningful", carbohydratePresence: detected.profile.hasMeaningfulCarbohydrate ? "meaningful" : "low", fiberPresence: "meaningful" }
        : { proteinPresence: "meaningful", carbohydratePresence: detected.profile.hasMeaningfulCarbohydrate ? "meaningful" : "low", fiberPresence: "low" },
    );
    if (likelyCompleteFromProfile(detected.profile, missing)) {
      proposal = {
        mealName: candidate.name,
        alreadySatisfiedRoles: [
          "main",
          ...(detected.profile.hasMeaningfulCarbohydrate ? (["carbohydrate"] as const) : []),
          ...(detected.profile.hasMeaningfulVegetableOrFruit ? (["vegetable"] as const) : []),
          ...(detected.profile.hasSauceOrMoistureComponent ? (["sauce_condiment"] as const) : []),
        ],
        missingRoles: [],
        addedComponents: [],
        compositionSummary: "Meal already substantially complete; no additions required.",
        noAdditionsNeeded: true,
      };
    } else {
      providerCalled = true;
      proposal = await options.provider.compose(enrichedRequest);
    }
  } catch (error) {
    return err(
      mealCompositionError(
        "COMPOSITION_PROVIDER_ERROR",
        error instanceof Error ? error.message : "Meal composition provider failed.",
        { candidateId: candidate.candidateId },
      ),
    );
  }

  const validated = validateMealCompositionProposal(proposal, enrichedRequest);
  if (!validated.ok) {
    return err({
      ...validated.error,
      candidateId: candidate.candidateId,
      candidateName: candidate.name,
    });
  }

  return ok(
    mergeProposalIntoConcept({
      candidate,
      mealType: request.mealType,
      proposal: validated.value,
      existing: detected.existingComponents,
      existingRoles: detected.profile,
      providerMeta: {
        provider: options.providerMeta?.provider ?? "unknown",
        model: options.providerMeta?.model,
        requestId: options.providerMeta?.requestId,
        durationMs: Date.now() - started,
        providerCalled,
      },
      createdAt: (options.now ?? (() => new Date()))().toISOString(),
    }),
  );
}

export type ComposeMealConceptsInput = {
  rankedCandidates?: readonly RankedCulinaryCandidate[];
  candidates?: readonly CulinaryDiscoveryCandidate[];
  uniqueCandidateIds?: readonly string[];
  mealType?: MealCompositionRequest["mealType"];
  allergies?: string[];
  dietaryRestrictions?: string[];
  dislikes?: string[];
  cookingStyleHint?: string;
  targetCalories?: number;
  concurrency?: number;
  slotCount?: number;
  recipesByCandidateId?: Record<string, ResolvedRecipe>;
  provider: MealCompositionProvider;
  providerMeta?: { provider?: string; model?: string };
};

export function uniqueRankedCandidates(
  ranked: readonly RankedCulinaryCandidate[],
): RankedCulinaryCandidate[] {
  const seen = new Set<string>();
  const unique: RankedCulinaryCandidate[] = [];
  for (const item of ranked) {
    const id = item.candidate.candidateId;
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(item);
  }
  return unique;
}

export async function composeMealConcepts(
  input: ComposeMealConceptsInput,
): Promise<{
  result: WeeklyMealConceptResult;
  failures: MealCompositionFailure[];
}> {
  const ranked = input.rankedCandidates
    ? uniqueRankedCandidates(input.rankedCandidates)
    : (input.candidates ?? []).map((candidate, index) => ({
        candidate,
        score: 80 - index,
        baseScore: 80 - index,
        scoreBreakdown: {
          userPreferenceFit: 0.7,
          culinaryInterest: 0.7,
          sourceQuality: 0.7,
          prepFit: 0.7,
          fitnessAdaptability: 0.7,
          novelty: 0.7,
          repetitionPenalty: 0,
          similarityPenalty: 0,
        },
        rank: index + 1,
        decision: "selected" as const,
        reasons: ["Composition subject"],
      }));

  const byId = new Map(ranked.map((item) => [item.candidate.candidateId, item]));
  const ids =
    input.uniqueCandidateIds && input.uniqueCandidateIds.length > 0
      ? [...new Set(input.uniqueCandidateIds)].filter((id) => byId.has(id))
      : ranked.map((item) => item.candidate.candidateId);
  const selected = ids
    .map((id) => byId.get(id))
    .filter((item): item is RankedCulinaryCandidate => item != null);

  const otherNames = selected.map((item) => item.candidate.name);
  const conceptsByCandidateId: Record<string, MealConcept> = {};
  const failures: MealCompositionFailure[] = [];
  const sharedKeys = new Set<string>();
  let reusedComponents = 0;
  const concurrency = input.concurrency ?? DEFAULT_MEAL_COMPOSITION_CONCURRENCY;

  const outcomes = await mapWithConcurrency(selected, concurrency, async (rankedItem) => {
    const candidate = rankedItem.candidate;
    const request: MealCompositionRequest = {
      mealType: input.mealType ?? "dinner",
      candidate,
      ranked: rankedItem,
      recipe: input.recipesByCandidateId?.[candidate.candidateId],
      allergies: input.allergies ?? [],
      dietaryRestrictions: input.dietaryRestrictions ?? [],
      dislikes: input.dislikes ?? [],
      cookingStyleHint: input.cookingStyleHint,
      cuisineFamily: candidate.cuisineFamily,
      regionalStyle: candidate.regionalStyle,
      compositionContext: {
        existingRoles: detectRolesForCompositionRequest({
          candidate,
          recipe: input.recipesByCandidateId?.[candidate.candidateId],
        }).profile,
        otherSelectedMealNames: otherNames.filter((name) => name !== candidate.name),
        existingComponentKeys: [...sharedKeys],
      },
    };
    const composed = await composeMealConcept(request, {
      provider: input.provider,
      providerMeta: input.providerMeta,
      existingComponentKeys: [...sharedKeys],
      otherSelectedMealNames: otherNames.filter((name) => name !== candidate.name),
    });
    return { rankedItem, composed };
  });

  for (const { rankedItem, composed } of outcomes) {
    if (!composed.ok) {
      failures.push({
        candidateId: rankedItem.candidate.candidateId,
        candidateName: rankedItem.candidate.name,
        code: composed.error.code,
        message: composed.error.message,
        details: composed.error.details,
      });
      continue;
    }
    const concept = composed.value;
    for (const component of [concept.main, ...concept.components]) {
      if (component.role === "main") continue;
      if (sharedKeys.has(component.normalizedComponentKey)) {
        reusedComponents += 1;
      } else if (component.source === "composition_engine") {
        sharedKeys.add(component.normalizedComponentKey);
      }
    }
    conceptsByCandidateId[concept.candidateId] = concept;
  }

  const concepts = Object.values(conceptsByCandidateId);
  const summary = summarizeMealConceptRepertoire(concepts);
  const providerCalls = concepts.filter((c) => c.metadata.providerCalled).length;
  const mealsAlreadyComplete = concepts.filter(
    (c) => c.compositionProfile.addedComponentRoles.length === 0,
  ).length;
  const mealsWithAddedComponents = concepts.length - mealsAlreadyComplete;
  const totalAddedComponents = concepts.reduce(
    (sum, c) => sum + c.components.filter((comp) => comp.source === "composition_engine").length,
    0,
  );
  const atomicComponents = concepts.reduce(
    (sum, c) =>
      sum +
      c.components.filter(
        (comp) => comp.source === "composition_engine" && comp.definitionKind === "atomic_food",
      ).length,
    0,
  );
  const recipeComponents = concepts.reduce(
    (sum, c) =>
      sum +
      c.components.filter(
        (comp) =>
          comp.source === "composition_engine" && comp.definitionKind === "recipe_component",
      ).length,
    0,
  );

  const candidateTrace: CandidateCompositionTrace[] = selected.map((item) => {
    const concept = conceptsByCandidateId[item.candidate.candidateId];
    return {
      candidateId: item.candidate.candidateId,
      name: item.candidate.name,
      composed: Boolean(concept),
      providerCalled: concept?.metadata.providerCalled ?? false,
      componentNames: concept
        ? [concept.main.name, ...concept.components.map((c) => c.name)]
        : [item.candidate.name],
    };
  });

  let fiberTarget: WeeklyMealConceptResult["fiberTarget"];
  if (input.targetCalories != null) {
    const fiber = calculateFiberTarget({ targetCalories: input.targetCalories });
    if (fiber.ok) {
      fiberTarget = {
        fiberGrams: fiber.value.fiberGrams,
        targetCalories: fiber.value.targetCalories,
        policyVersion: FIBER_POLICY_VERSION,
        displayFiberGrams: fiber.value.displayFiberGrams,
      };
    }
  }

  const diagnostics: MealCompositionDiagnostics = {
    weeklyMealSlots: input.slotCount ?? selected.length,
    rankedCandidates: (input.rankedCandidates ?? input.candidates ?? []).length,
    uniqueCandidatesComposed: concepts.length,
    uniqueMainRecipes: concepts.length,
    compositionProviderCalls: providerCalls,
    mealsAlreadyComplete,
    mealsWithAddedComponents,
    totalAddedComponents,
    uniqueAddedComponents: sharedKeys.size,
    reusedComponents,
    atomicComponents,
    recipeComponents,
    unresolvedComponents: 0,
    componentComplexitySignal: summary.complexitySignal,
  };

  return {
    result: {
      conceptsByCandidateId,
      uniqueCandidateIds: selected.map((item) => item.candidate.candidateId),
      sharedComponentKeys: [...sharedKeys],
      componentReuse: summary.reuseIndex,
      conceptCount: concepts.length,
      diagnostics,
      fiberTarget,
      candidateTrace,
      policyVersions: {
        mealComposition: MEAL_COMPOSITION_POLICY_VERSION,
        prompt: MEAL_COMPOSITION_PROMPT_VERSION,
        fiber: fiberTarget ? FIBER_POLICY_VERSION : undefined,
      },
    },
    failures,
  };
}

export function mealConceptsByCandidateIdFromResult(
  result: WeeklyMealConceptResult,
): Record<string, MealConcept> {
  return result.conceptsByCandidateId;
}

export { candidateFromResolvedRecipe };
