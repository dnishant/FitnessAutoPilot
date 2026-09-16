import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { MealConcept } from "@fitness-autopilot/contracts";
import { useSession } from "../src/state/session";
import {
  createMealCompositionPreviewUiState,
  MEAL_COMPOSITION_PREVIEW_LOADING,
  MEAL_COMPOSITION_PREVIEW_TITLE,
  humanizeMealCompositionError,
  plateLines,
  roleCheck,
  sourceLabel,
  weeklyCompositionSummaryRows,
  type MealCompositionPreviewUiState,
} from "../src/lib/meal-composition-preview";

function PipelineStages({ concept, selected }: { concept: MealConcept; selected: boolean }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>RANKED CANDIDATE</Text>
      <Text style={styles.cardTitle}>{concept.main.name}</Text>
      <Text style={styles.muted}>candidate: {concept.candidateId}</Text>

      <Text style={styles.arrow}>↓</Text>
      <Text style={styles.label}>LIGHTWEIGHT COMPOSITION</Text>
      {plateLines(concept).map((name) => (
        <Text key={name} style={styles.body}>
          • {name}
        </Text>
      ))}

      <Text style={styles.arrow}>↓</Text>
      <Text style={styles.label}>WEEKLY STRATEGY</Text>
      <Text style={styles.body}>Selected: {selected ? "yes (when this plate is in the week)" : "inspect after PLAN-007"}</Text>
      <Text style={styles.muted}>
        Weekly strategy now schedules complete plates, not mains only.
      </Text>

      <Text style={styles.arrow}>↓</Text>
      <Text style={styles.label}>DETAILED RESOLUTION</Text>
      <Text style={styles.muted}>
        Main + compound sides resolve only after selection (PLAN-008 / component-recipe-v1).
      </Text>

      <Text style={styles.arrow}>↓</Text>
      <Text style={styles.label}>USDA</Text>
      <Text style={styles.muted}>Canonical nutrition stays downstream of selected recipes.</Text>
    </View>
  );
}

function ConceptCard({ concept }: { concept: MealConcept }) {
  const added = concept.components.filter((c) => c.source === "composition_engine");
  const before = [concept.main, ...concept.components.filter((c) => c.source !== "composition_engine")];
  const hasRole = (role: MealConcept["components"][number]["role"]) =>
    before.some((c) => c.role === role);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{concept.name}</Text>
      <Text style={styles.muted}>prompt {concept.metadata.promptVersion}</Text>
      <Text style={styles.label}>Already satisfies</Text>
      <Text style={styles.body}>{roleCheck("primary protein", hasRole("main"))}</Text>
      <Text style={styles.body}>
        {roleCheck("meaningful carbohydrate", hasRole("carbohydrate") || hasRole("legume"))}
      </Text>
      <Text style={styles.body}>
        {roleCheck(
          "meaningful fiber/vegetable",
          hasRole("vegetable") || hasRole("fruit") || hasRole("legume"),
        )}
      </Text>
      <Text style={styles.body}>
        {roleCheck("flavor/sauce structure", hasRole("sauce_condiment"))}
      </Text>
      {added.length > 0 ? (
        <>
          <Text style={styles.label}>ADDED CONCEPTS</Text>
          {added.map((c) => (
            <View key={c.componentId} style={styles.componentBlock}>
              <Text style={styles.bodyBold}>{c.name}</Text>
              <Text style={styles.muted}>
                Role: {c.role} · {c.definitionKind} · {c.relationship}
              </Text>
              <Text style={styles.muted}>{sourceLabel(c.source)}</Text>
              <Text style={styles.body}>{c.reason}</Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.label}>No additions needed</Text>
      )}
      <Text style={styles.label}>Complete plate</Text>
      {plateLines(concept).map((name, index) => (
        <Text key={`${name}-${index}`} style={styles.body}>
          • {name}
        </Text>
      ))}
    </View>
  );
}

export default function MealCompositionPreviewScreen() {
  const { composeMealConcepts, useLocalMode } = useSession();
  const [state, setState] = useState<MealCompositionPreviewUiState>(
    createMealCompositionPreviewUiState,
  );

  const selected = useMemo(() => {
    if (!state.concepts || !state.selectedCandidateId) return null;
    return state.concepts.conceptsByCandidateId[state.selectedCandidateId] ?? null;
  }, [state.concepts, state.selectedCandidateId]);

  async function onCompose() {
    setState((s) => ({ ...s, busy: true, error: null }));
    const response = await composeMealConcepts({
      rankedCandidates: state.rankedCandidates,
      uniqueCandidateIds: state.rankedCandidates.map((item) => item.candidate.candidateId),
      targetCalories: state.targetCalories,
    });
    if (!response.ok) {
      setState((s) => ({
        ...s,
        busy: false,
        error: {
          message: humanizeMealCompositionError({
            message: response.error,
            code: response.code,
            diagnostics: response.diagnostics,
          }),
          code: response.code,
          diagnostics: response.diagnostics,
        },
      }));
      return;
    }
    setState((s) => ({
      ...s,
      busy: false,
      concepts: response.concepts,
      meta: response.meta,
      selectedCandidateId:
        response.concepts.uniqueCandidateIds[0] ?? s.selectedCandidateId,
    }));
  }

  const summary = weeklyCompositionSummaryRows(state.concepts);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{MEAL_COMPOSITION_PREVIEW_TITLE}</Text>
      <Text style={styles.subtitle}>
        Rank → lightweight complete-plate composition → weekly strategy → selected detailed
        resolution → USDA. This screen composes unique ranked candidates only.
        {useLocalMode ? " (local mock provider)" : ""}
      </Text>

      <Pressable
        style={[styles.button, state.busy && styles.buttonDisabled]}
        disabled={state.busy}
        onPress={onCompose}
      >
        {state.busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Compose ranked repertoire</Text>
        )}
      </Pressable>
      {state.busy ? <Text style={styles.muted}>{MEAL_COMPOSITION_PREVIEW_LOADING}</Text> : null}

      {state.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{state.error.message}</Text>
          {state.error.diagnostics ? (
            <Text style={styles.muted}>{state.error.diagnostics}</Text>
          ) : null}
        </View>
      ) : null}

      {summary.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.label}>Pipeline diagnostics</Text>
          {summary.map((row) => (
            <Text key={row.label} style={styles.body}>
              {row.label}: {row.value}
            </Text>
          ))}
          {state.meta ? (
            <Text style={styles.muted}>
              {state.meta.provider}
              {state.meta.model ? ` · ${state.meta.model}` : ""} · {state.meta.durationMs}ms
            </Text>
          ) : null}
        </View>
      ) : null}

      {state.concepts ? (
        <View style={styles.chipWrap}>
          {state.concepts.uniqueCandidateIds.map((id) => {
            const concept = state.concepts!.conceptsByCandidateId[id];
            const active = id === state.selectedCandidateId;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setState((s) => ({ ...s, selectedCandidateId: id }))}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {concept?.name ?? id}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {selected ? (
        <>
          <PipelineStages concept={selected} selected={false} />
          <ConceptCard concept={selected} />
        </>
      ) : null}

      {state.concepts?.candidateTrace ? (
        <View style={styles.card}>
          <Text style={styles.label}>candidate → composition</Text>
          {state.concepts.candidateTrace.map((row) => (
            <Text key={row.candidateId} style={styles.body}>
              {row.name}: {row.componentNames.join(" + ")}
              {row.providerCalled ? " · provider" : " · skipped"}
            </Text>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => setState((s) => ({ ...s, showRaw: !s.showRaw }))}
        style={styles.link}
      >
        <Text style={styles.linkText}>{state.showRaw ? "Hide raw JSON" : "Show raw JSON"}</Text>
      </Pressable>
      {state.showRaw && state.concepts ? (
        <Text style={styles.raw}>{JSON.stringify(state.concepts, null, 2)}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#14213d" },
  subtitle: { fontSize: 14, color: "#52606d", marginBottom: 4 },
  button: {
    backgroundColor: "#1d3557",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600" },
  card: {
    backgroundColor: "#f7f9fc",
    borderRadius: 10,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: "#d9e2ec",
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#102a43" },
  label: { marginTop: 8, fontWeight: "700", color: "#243b53" },
  body: { color: "#334e68", fontSize: 14, lineHeight: 20 },
  bodyBold: { color: "#102a43", fontWeight: "600", fontSize: 15 },
  muted: { color: "#627d98", fontSize: 13 },
  arrow: { color: "#9fb3c8", fontWeight: "700", marginTop: 8 },
  componentBlock: { marginTop: 6, gap: 2 },
  errorBox: {
    backgroundColor: "#ffe3e3",
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  errorText: { color: "#c92a2a", fontWeight: "600" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#e0e7ff",
  },
  chipActive: { backgroundColor: "#1d3557" },
  chipText: { color: "#1d3557", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  link: { paddingVertical: 8 },
  linkText: { color: "#1d4ed8", fontWeight: "600" },
  raw: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#334e68",
    backgroundColor: "#f1f5f9",
    padding: 10,
    borderRadius: 8,
  },
});
