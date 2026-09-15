import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { RecipeNutritionResult } from "@fitness-autopilot/contracts";
import { useSession } from "../src/state/session";
import {
  createFoodResolutionPreviewUiState,
  FOOD_RESOLUTION_PREVIEW_LOADING,
  FOOD_RESOLUTION_PREVIEW_TITLE,
  formatNutritionLine,
  humanizeFoodResolutionError,
  weeklyNutritionSummaryRows,
  type FoodResolutionPreviewUiState,
} from "../src/lib/food-resolution-preview";

function IngredientCard({
  row,
}: {
  row: RecipeNutritionResult["ingredients"][number];
}) {
  const fr = row.foodResolution;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{row.recipeIngredient.name}</Text>
      <Text style={styles.muted}>
        {row.recipeIngredient.quantity} {row.recipeIngredient.unit}
        {row.recipeIngredient.measurementState
          ? ` · ${row.recipeIngredient.measurementState}`
          : ""}
      </Text>
      {fr.status === "resolved" ? (
        <>
          <Text style={styles.label}>Canonical food</Text>
          <Text style={styles.body}>
            {fr.food.description}
            {"\n"}USDA ID: {fr.food.source.externalId}
            {"\n"}confidence: {fr.confidence} · {fr.resolutionMethod}
          </Text>
          <Text style={styles.label}>Quantity normalization</Text>
          <Text style={styles.body}>
            {row.normalizedQuantity
              ? `${row.normalizedQuantity.grams.toFixed(2)} g · ${row.normalizedQuantity.method} · ${row.normalizedQuantity.confidence}`
              : row.quantityStatus}
          </Text>
          <Text style={styles.label}>Nutrition contribution</Text>
          <Text style={styles.body}>
            {row.nutrition ? formatNutritionLine(row.nutrition) : "—"}
          </Text>
        </>
      ) : fr.status === "ambiguous" ? (
        <>
          <Text style={styles.warn}>Needs review — ambiguous</Text>
          <Text style={styles.muted}>{fr.reason}</Text>
          {fr.candidates.map((c) => (
            <Text key={c.externalId} style={styles.body}>
              • {c.description} (ID {c.externalId}, score {c.score.toFixed(1)})
            </Text>
          ))}
        </>
      ) : (
        <>
          <Text style={styles.warn}>Not found</Text>
          <Text style={styles.muted}>{fr.reason}</Text>
        </>
      )}
    </View>
  );
}

export default function FoodResolutionPreviewScreen() {
  const { resolveRecipeNutrition, useLocalMode } = useSession();
  const [state, setState] = useState<FoodResolutionPreviewUiState>(
    createFoodResolutionPreviewUiState,
  );

  const selected = useMemo(() => {
    if (!state.result || !state.selectedCandidateId) return null;
    return state.result.recipesByCandidateId[state.selectedCandidateId] ?? null;
  }, [state.result, state.selectedCandidateId]);

  async function onResolve() {
    setState((s) => ({ ...s, busy: true, error: null }));
    const response = await resolveRecipeNutrition({
      recipes: state.recipes,
      uniqueCandidateIds: state.recipes.map((r) => r.candidateId),
    });
    if (!response.ok) {
      setState((s) => ({
        ...s,
        busy: false,
        error: {
          message: humanizeFoodResolutionError({
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
        s.selectedCandidateId ?? response.result.uniqueCandidateIds[0] ?? null,
    }));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{FOOD_RESOLUTION_PREVIEW_TITLE}</Text>
      <Text style={styles.help}>
        PLAN-009 — canonical USDA foods + deterministic nutrition for PLAN-008 base
        recipes. Does not portion for user targets.
      </Text>
      {useLocalMode ? (
        <Text style={styles.warn}>
          Local planner mode cannot call USDA. Switch to remote Supabase.
        </Text>
      ) : null}

      <Pressable
        style={[styles.button, state.busy && styles.buttonDisabled]}
        disabled={state.busy || useLocalMode}
        onPress={onResolve}
      >
        {state.busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Resolve 6-recipe nutrition</Text>
        )}
      </Pressable>
      {state.busy ? <Text style={styles.muted}>{FOOD_RESOLUTION_PREVIEW_LOADING}</Text> : null}

      {state.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.warn}>{state.error.message}</Text>
          {state.error.diagnostics ? (
            <Text style={styles.mono}>{state.error.diagnostics}</Text>
          ) : null}
        </View>
      ) : null}

      {state.result ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly diagnostics</Text>
          {weeklyNutritionSummaryRows(state.result).map((row) => (
            <Text key={row.label} style={styles.body}>
              {row.label}: {row.value}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.chips}>
        {state.recipes.map((recipe) => (
          <Pressable
            key={recipe.candidateId}
            style={[
              styles.chip,
              state.selectedCandidateId === recipe.candidateId && styles.chipActive,
            ]}
            onPress={() =>
              setState((s) => ({ ...s, selectedCandidateId: recipe.candidateId }))
            }
          >
            <Text
              style={[
                styles.chipText,
                state.selectedCandidateId === recipe.candidateId && styles.chipTextActive,
              ]}
            >
              {recipe.name}
            </Text>
          </Pressable>
        ))}
      </View>

      {selected ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{selected.recipeName}</Text>
          <Text style={styles.muted}>
            Status: {selected.resolutionQuality.status} · base servings{" "}
            {selected.baseServings}
          </Text>
          {selected.nutrition ? (
            <>
              <Text style={styles.label}>Recipe total</Text>
              <Text style={styles.body}>{formatNutritionLine(selected.nutrition.total)}</Text>
              <Text style={styles.label}>Per base serving</Text>
              <Text style={styles.body}>
                {formatNutritionLine(selected.nutrition.perBaseServing)}
              </Text>
            </>
          ) : (
            <Text style={styles.warn}>Totals withheld / incomplete</Text>
          )}
          <Text style={styles.label}>Meal components</Text>
          {selected.mealComponents.map((c) => (
            <Text key={c.mealComponent.componentId} style={styles.body}>
              {c.mealComponent.name} — {c.status}
            </Text>
          ))}
          <Text style={styles.sectionTitle}>Ingredients</Text>
          {selected.ingredients.map((row) => (
            <IngredientCard key={row.recipeIngredient.ingredientId} row={row} />
          ))}
        </View>
      ) : null}

      <Pressable
        style={styles.secondary}
        onPress={() => setState((s) => ({ ...s, showRaw: !s.showRaw }))}
      >
        <Text style={styles.secondaryText}>{state.showRaw ? "Hide" : "Show"} raw JSON</Text>
      </Pressable>
      {state.showRaw && state.result ? (
        <Text style={styles.mono}>{JSON.stringify(state.result, null, 2).slice(0, 8000)}</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: "800", color: "#0B1F17" },
  help: { color: "#3D5A4C" },
  button: {
    backgroundColor: "#1F6F4A",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700" },
  secondary: { paddingVertical: 8 },
  secondaryText: { color: "#1F6F4A", fontWeight: "700" },
  section: { gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#0B1F17", marginTop: 8 },
  label: { fontWeight: "700", color: "#0B1F17", marginTop: 6 },
  body: { color: "#0B1F17" },
  muted: { color: "#3D5A4C" },
  warn: { color: "#8A3B12", fontWeight: "700" },
  errorBox: {
    backgroundColor: "#F8E8DE",
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  card: {
    backgroundColor: "#E4F0E8",
    borderRadius: 10,
    padding: 12,
    gap: 4,
    marginTop: 8,
  },
  cardTitle: { fontWeight: "800", color: "#0B1F17" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#1F6F4A",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: "#1F6F4A" },
  chipText: { color: "#1F6F4A", fontWeight: "600", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  mono: { fontFamily: "monospace", fontSize: 11, color: "#0B1F17" },
});
