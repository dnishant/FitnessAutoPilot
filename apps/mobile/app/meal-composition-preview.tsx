import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { CompleteMeal } from "@fitness-autopilot/contracts";
import { useSession } from "../src/state/session";
import {
  createMealCompositionPreviewUiState,
  MEAL_COMPOSITION_PREVIEW_LOADING,
  MEAL_COMPOSITION_PREVIEW_TITLE,
  humanizeMealCompositionError,
  resolutionLabel,
  roleCheck,
  sourceLabel,
  weeklyCompositionSummaryRows,
  type MealCompositionPreviewUiState,
} from "../src/lib/meal-composition-preview";

function MealCard({ meal }: { meal: CompleteMeal }) {
  const profile = meal.compositionProfile;
  const added = meal.components.filter((c) => c.source === "composition_engine");
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{meal.name}</Text>
      <Text style={styles.muted}>candidate: {meal.candidateId}</Text>

      <Text style={styles.label}>Already satisfies</Text>
      <Text style={styles.body}>{roleCheck("primary protein", profile.hasPrimaryProtein)}</Text>
      <Text style={styles.body}>
        {roleCheck("meaningful carbohydrate", profile.hasMeaningfulCarbohydrate)}
      </Text>
      <Text style={styles.body}>
        {roleCheck("meaningful fiber/vegetable", profile.hasMeaningfulVegetableOrFruit)}
      </Text>
      <Text style={styles.body}>
        {roleCheck("flavor/sauce structure", profile.hasSauceOrMoistureComponent)}
      </Text>
      <Text style={styles.body}>
        {roleCheck("meaningful fiber source", profile.hasMeaningfulFiberSource)}
      </Text>

      {added.length > 0 ? (
        <>
          <Text style={styles.label}>ADDED</Text>
          {added.map((c) => (
            <View key={c.componentId} style={styles.componentBlock}>
              <Text style={styles.bodyBold}>{c.name}</Text>
              <Text style={styles.muted}>
                Role: {c.role} · {c.definitionKind} · {c.relationship}
              </Text>
              <Text style={styles.muted}>{sourceLabel(c.source)}</Text>
              <Text style={styles.body}>{c.reason}</Text>
              <Text style={styles.muted}>{resolutionLabel(c)}</Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.label}>No additions needed</Text>
      )}

      <Text style={styles.label}>Complete meal components</Text>
      {meal.components.map((c) => (
        <Text key={c.componentId} style={styles.body}>
          • [{c.role}] {c.name} — {sourceLabel(c.source)}
        </Text>
      ))}

      {meal.nutritionSignals ? (
        <>
          <Text style={styles.label}>Nutrition signals (deterministic)</Text>
          <Text style={styles.muted}>
            P {meal.nutritionSignals.proteinPresence} · C{" "}
            {meal.nutritionSignals.carbohydratePresence} · Fiber{" "}
            {meal.nutritionSignals.fiberPresence}
          </Text>
        </>
      ) : null}
    </View>
  );
}

export default function MealCompositionPreviewScreen() {
  const { composeMeals, useLocalMode } = useSession();
  const [state, setState] = useState<MealCompositionPreviewUiState>(
    createMealCompositionPreviewUiState,
  );

  const selected = useMemo(() => {
    if (!state.result || !state.selectedCandidateId) return null;
    return state.result.mealsByCandidateId[state.selectedCandidateId] ?? null;
  }, [state.result, state.selectedCandidateId]);

  async function onCompose() {
    setState((s) => ({ ...s, busy: true, error: null }));
    const response = await composeMeals({
      recipes: state.recipes,
      uniqueCandidateIds: state.recipes.map((r) => r.candidateId),
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
      result: response.result,
      meta: response.meta,
      selectedCandidateId:
        response.result.uniqueCandidateIds[0] ?? s.selectedCandidateId,
    }));
  }

  const summary = weeklyCompositionSummaryRows(state.result);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{MEAL_COMPOSITION_PREVIEW_TITLE}</Text>
      <Text style={styles.subtitle}>
        PLAN-009.5 — complete the plate (culinary). No personalized portions.
        {useLocalMode ? " (local compose via mock when Edge unavailable)" : ""}
      </Text>

      <Pressable
        style={[styles.button, state.busy && styles.buttonDisabled]}
        disabled={state.busy}
        onPress={onCompose}
      >
        {state.busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Compose six dishes</Text>
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
          <Text style={styles.label}>Weekly diagnostics</Text>
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

      {state.result ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {state.result.uniqueCandidateIds.map((id) => {
            const meal = state.result!.mealsByCandidateId[id];
            const active = id === state.selectedCandidateId;
            return (
              <Pressable
                key={id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setState((s) => ({ ...s, selectedCandidateId: id }))}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {meal?.name ?? id}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {selected ? <MealCard meal={selected} /> : null}

      <Pressable
        onPress={() => setState((s) => ({ ...s, showRaw: !s.showRaw }))}
        style={styles.link}
      >
        <Text style={styles.linkText}>{state.showRaw ? "Hide raw JSON" : "Show raw JSON"}</Text>
      </Pressable>
      {state.showRaw && state.result ? (
        <Text style={styles.raw}>{JSON.stringify(state.result, null, 2)}</Text>
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
  componentBlock: { marginTop: 6, gap: 2 },
  errorBox: {
    backgroundColor: "#ffe3e3",
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  errorText: { color: "#c92a2a", fontWeight: "600" },
  chipRow: { maxHeight: 44 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#e0e7ff",
    marginRight: 8,
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
