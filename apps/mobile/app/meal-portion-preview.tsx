import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createMealPortionPreviewUiState,
  MEAL_PORTION_PREVIEW_LOADING,
  MEAL_PORTION_PREVIEW_TITLE,
  PORTION_PREVIEW_FIXTURES,
  runMealPortionPreview,
  type MealPortionPreviewUiState,
} from "../src/lib/meal-portion-preview";

export default function MealPortionPreviewScreen() {
  const [state, setState] = useState<MealPortionPreviewUiState>(createMealPortionPreviewUiState);

  function onSolve() {
    setState((s) => ({ ...s, busy: true, error: null }));
    const outcome = runMealPortionPreview(state);
    if (!outcome.ok) {
      setState((s) => ({ ...s, busy: false, error: outcome.error, result: null, diagnosticsText: null }));
      return;
    }
    setState((s) => ({
      ...s,
      busy: false,
      result: outcome.result,
      diagnosticsText: outcome.diagnosticsText,
    }));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{MEAL_PORTION_PREVIEW_TITLE}</Text>
      <Text style={styles.help}>
        PLAN-010 — deterministic complete-meal portion solver. No LLM / USDA calls.
        Manual intent below is developer/test input only — not production daily allocation
        (PLAN-011).
      </Text>

      <Text style={styles.label}>Reference meal</Text>
      <View style={styles.chips}>
        {PORTION_PREVIEW_FIXTURES.map((fixture) => (
          <Pressable
            key={fixture.id}
            style={[styles.chip, state.fixtureId === fixture.id && styles.chipActive]}
            onPress={() => setState((s) => ({ ...s, fixtureId: fixture.id, result: null }))}
          >
            <Text
              style={[styles.chipText, state.fixtureId === fixture.id && styles.chipTextActive]}
            >
              {fixture.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Developer / test MealNutritionIntent</Text>
      <View style={styles.form}>
        <Field
          label="Target calories"
          value={state.targetCalories}
          onChange={(targetCalories) => setState((s) => ({ ...s, targetCalories }))}
        />
        <Field
          label="Target protein (g)"
          value={state.targetProtein}
          onChange={(targetProtein) => setState((s) => ({ ...s, targetProtein }))}
        />
        <Field
          label="Target carbs (g, optional)"
          value={state.targetCarbs}
          onChange={(targetCarbs) => setState((s) => ({ ...s, targetCarbs }))}
        />
        <Field
          label="Target fat (g, optional)"
          value={state.targetFat}
          onChange={(targetFat) => setState((s) => ({ ...s, targetFat }))}
        />
        <Field
          label="Target fiber (g, optional)"
          value={state.targetFiber}
          onChange={(targetFiber) => setState((s) => ({ ...s, targetFiber }))}
        />
      </View>

      <Pressable
        style={[styles.button, state.busy && styles.buttonDisabled]}
        disabled={state.busy}
        onPress={onSolve}
      >
        {state.busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Solve portions</Text>
        )}
      </Pressable>
      {state.busy ? <Text style={styles.muted}>{MEAL_PORTION_PREVIEW_LOADING}</Text> : null}
      {state.error ? <Text style={styles.warn}>{state.error}</Text> : null}

      {state.result ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Solved portions</Text>
          <Text style={styles.muted}>Status: {state.result.status}</Text>
          {state.result.portions.map((portion) => (
            <View key={portion.componentId} style={styles.row}>
              <Text style={styles.body}>{portion.displayName}</Text>
              <Text style={styles.bodyStrong}>
                {portion.amount} {portion.unit}
              </Text>
            </View>
          ))}
          <Text style={styles.sectionTitle}>Nutrition</Text>
          <Text style={styles.body}>
            {state.result.nutrition.caloriesKcal} kcal · {state.result.nutrition.proteinGrams}g
            protein · {state.result.nutrition.carbsGrams}g carbs · {state.result.nutrition.fatGrams}
            g fat
            {state.result.nutrition.fiberGrams != null
              ? ` · ${state.result.nutrition.fiberGrams}g fiber`
              : ""}
          </Text>
          <Text style={styles.sectionTitle}>Diagnostics</Text>
          <Text style={styles.mono}>{state.diagnosticsText}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChange}
        keyboardType="decimal-pad"
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: "800", color: "#0B1F17" },
  help: { color: "#3D5A4C", lineHeight: 20 },
  label: { marginTop: 8, fontWeight: "700", color: "#0B1F17" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#9BB5A8",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#0B1F17", borderColor: "#0B1F17" },
  chipText: { color: "#0B1F17", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  form: { gap: 10 },
  field: { gap: 4 },
  fieldLabel: { color: "#3D5A4C", fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: "#9BB5A8",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    color: "#0B1F17",
  },
  button: {
    marginTop: 8,
    backgroundColor: "#0B1F17",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700" },
  muted: { color: "#5C7468" },
  warn: { color: "#8A2B2B" },
  section: { marginTop: 8, gap: 8 },
  sectionTitle: { fontWeight: "800", color: "#0B1F17", marginTop: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  body: { color: "#0B1F17", flex: 1 },
  bodyStrong: { color: "#0B1F17", fontWeight: "700" },
  mono: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#24352D",
    backgroundColor: "#E7EEE9",
    padding: 12,
    borderRadius: 10,
  },
});
