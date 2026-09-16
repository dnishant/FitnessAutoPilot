import type {
  ComponentReuseEntry,
  CompositionComplexitySignal,
  MealConcept,
  MealConceptComponent,
} from "@fitness-autopilot/contracts";

export type MealConceptRepertoireSummary = {
  uniqueMains: number;
  uniqueComponents: number;
  reusedComponents: number;
  exclusiveComponentCount: number;
  reuseIndex: ComponentReuseEntry[];
  complexitySignal: CompositionComplexitySignal;
};

function plateComponents(concept: MealConcept): MealConceptComponent[] {
  const all = [concept.main, ...concept.components];
  const seen = new Set<string>();
  const out: MealConceptComponent[] = [];
  for (const component of all) {
    if (seen.has(component.normalizedComponentKey)) continue;
    seen.add(component.normalizedComponentKey);
    out.push(component);
  }
  return out;
}

/**
 * Normalize lightweight component identities across a ranked repertoire
 * so weekly strategy can see reuse without treating it as meal repetition.
 */
export function summarizeMealConceptRepertoire(
  concepts: readonly MealConcept[],
): MealConceptRepertoireSummary {
  const usage = new Map<
    string,
    {
      name: string;
      role: MealConceptComponent["role"];
      usedByCandidateIds: string[];
      usedByNames: string[];
    }
  >();

  for (const concept of concepts) {
    for (const component of plateComponents(concept)) {
      if (component.role === "main") continue;
      const existing = usage.get(component.normalizedComponentKey);
      if (existing) {
        if (!existing.usedByCandidateIds.includes(concept.candidateId)) {
          existing.usedByCandidateIds.push(concept.candidateId);
          existing.usedByNames.push(concept.name);
        }
      } else {
        usage.set(component.normalizedComponentKey, {
          name: component.name,
          role: component.role,
          usedByCandidateIds: [concept.candidateId],
          usedByNames: [concept.name],
        });
      }
    }
  }

  const reuseIndex: ComponentReuseEntry[] = [...usage.entries()]
    .map(([normalizedComponentKey, value]) => ({
      normalizedComponentKey,
      name: value.name,
      role: value.role,
      usedByCandidateIds: value.usedByCandidateIds,
      usedByNames: value.usedByNames,
    }))
    .sort((a, b) => {
      if (b.usedByCandidateIds.length !== a.usedByCandidateIds.length) {
        return b.usedByCandidateIds.length - a.usedByCandidateIds.length;
      }
      return a.normalizedComponentKey.localeCompare(b.normalizedComponentKey);
    });

  const uniqueMains = concepts.length;
  const uniqueComponents = reuseIndex.length;
  const reusedComponents = reuseIndex.filter((entry) => entry.usedByCandidateIds.length > 1).length;
  const exclusiveComponentCount = uniqueComponents - reusedComponents;

  return {
    uniqueMains,
    uniqueComponents,
    reusedComponents,
    exclusiveComponentCount,
    reuseIndex,
    complexitySignal: classifyCompositionComplexity({
      uniqueMains,
      uniqueComponents,
      reusedComponents,
    }),
  };
}

export function classifyCompositionComplexity(input: {
  uniqueMains: number;
  uniqueComponents: number;
  reusedComponents: number;
}): CompositionComplexitySignal {
  if (input.uniqueMains <= 0) return "unknown";
  const sidesPerMain = input.uniqueComponents / input.uniqueMains;
  const reuseRatio = input.uniqueComponents === 0 ? 0 : input.reusedComponents / input.uniqueComponents;
  if (sidesPerMain >= 3 && reuseRatio < 0.2) {
    return "high_unique_sides";
  }
  if (sidesPerMain <= 2.5 && reuseRatio >= 0.2) {
    return "compact_reusable";
  }
  return "mixed";
}

export function formatComponentReuseForPrompt(reuseIndex: readonly ComponentReuseEntry[]): string {
  const reused = reuseIndex.filter((entry) => entry.usedByCandidateIds.length > 1);
  if (reused.length === 0) {
    return "(no shared side components detected in this ranked repertoire)";
  }
  return reused
    .map(
      (entry) =>
        `${entry.name} (${entry.role}) used by ${entry.usedByCandidateIds.length} meals: ${entry.usedByNames.join(", ")}`,
    )
    .join("\n");
}
