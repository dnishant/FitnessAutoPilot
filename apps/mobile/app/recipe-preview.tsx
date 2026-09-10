import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { MealType } from "@fitness-autopilot/contracts";
import { useSession } from "../src/state/session";
import {
  RECIPE_PREVIEW_MEAL_TYPES,
  beginRecipeGeneration,
  buildAiDetailsRows,
  buildGenerationContextRows,
  buildRecipeGenerationRequest,
  canStartGeneration,
  createRecipePreviewUiState,
  failRecipeGeneration,
  formatIngredientLine,
  formatRecipeTotalMinutes,
  mealTypeLabel,
  selectHistoryEntry,
  succeedRecipeGeneration,
  type RecipePreviewUiState,
} from "../src/lib/recipe-preview";

function CollapsibleSection(props: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable onPress={props.onToggle} style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {props.open ? "▼" : "▶"} {props.title}
        </Text>
      </Pressable>
      {props.open ? <View style={styles.sectionBody}>{props.children}</View> : null}
    </View>
  );
}

function KeyValueRows(props: { rows: Array<{ label: string; value: string }> }) {
  return (
    <View style={styles.kvList}>
      {props.rows.map((row) => (
        <View key={row.label} style={styles.kvRow}>
          <Text style={styles.kvLabel}>{row.label}</Text>
          <Text style={styles.kvValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function RecipePreviewScreen() {
  const {
    nutritionTarget,
    mealPreferences,
    cookingPreferences,
    generateRecipe,
    useLocalMode,
  } = useSession();
  const [state, setState] = useState<RecipePreviewUiState>(() => createRecipePreviewUiState());

  const draftRequest = useMemo(
    () =>
      buildRecipeGenerationRequest(state.mealType, {
        nutritionTarget,
        mealPreferences,
        cookingPreferences,
      }),
    [state.mealType, nutritionTarget, mealPreferences, cookingPreferences],
  );

  const contextRows = useMemo(
    () => buildGenerationContextRows(draftRequest),
    [draftRequest],
  );

  async function runGenerate() {
    let started = false;
    setState((prev) => {
      if (!canStartGeneration(prev)) {
        return prev;
      }
      started = true;
      return beginRecipeGeneration(prev);
    });
    if (!started) {
      return;
    }
    const result = await generateRecipe(draftRequest);
    if (!result.ok) {
      setState((prev) =>
        failRecipeGeneration(prev, {
          message: result.error,
          code: result.code,
          diagnostics: result.diagnostics,
        }),
      );
      return;
    }
    setState((prev) =>
      succeedRecipeGeneration(prev, {
        request: draftRequest,
        recipe: result.recipe,
        meta: result.meta,
      }),
    );
  }

  function selectMealType(mealType: MealType) {
    if (state.busy) {
      return;
    }
    setState((prev) => ({ ...prev, mealType, error: null }));
  }

  const current = state.current;
  const aiRows = current
    ? buildAiDetailsRows(current.recipe, current.meta)
    : [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Recipe Preview</Text>
      <Text style={styles.help}>
        Dev/internal tool: generate one PLAN-003 recipe from your saved nutrition and
        preference profile. AI nutrition is never treated as verified.
      </Text>

      {useLocalMode ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Local planner mode</Text>
          <Text style={styles.warnBody}>
            Recipe generation requires Supabase remote mode (`EXPO_PUBLIC_USE_LOCAL_PLANNER=false`)
            and server-side `GEMINI_API_KEY`. The client never calls Gemini directly.
          </Text>
        </View>
      ) : null}

      <Text style={styles.label}>Meal type</Text>
      <View style={styles.mealRow}>
        {RECIPE_PREVIEW_MEAL_TYPES.map((mealType) => {
          const selected = state.mealType === mealType;
          return (
            <Pressable
              key={mealType}
              style={[styles.mealChip, selected ? styles.mealChipSelected : null]}
              disabled={state.busy}
              onPress={() => selectMealType(mealType)}
            >
              <Text style={[styles.mealChipText, selected ? styles.mealChipTextSelected : null]}>
                {mealTypeLabel(mealType)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <CollapsibleSection
        title="Generation Context"
        open={state.showContext}
        onToggle={() => setState((prev) => ({ ...prev, showContext: !prev.showContext }))}
      >
        <KeyValueRows rows={contextRows} />
        <Text style={styles.note}>
          Requested targets are meal-share guidance from your daily nutrition target — not
          verified recipe nutrition.
        </Text>
      </CollapsibleSection>

      <Pressable
        style={[styles.primary, !canStartGeneration(state) ? styles.primaryDisabled : null]}
        disabled={!canStartGeneration(state)}
        onPress={runGenerate}
      >
        {state.busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.primaryText}>Generating recipe...</Text>
          </View>
        ) : (
          <Text style={styles.primaryText}>
            {current ? "Generate Another" : "Generate Recipe"}
          </Text>
        )}
      </Pressable>

      {state.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Generation failed</Text>
          <Text style={styles.errorMessage}>{state.error.message}</Text>
          {state.error.code ? (
            <Text style={styles.errorCode}>Code: {state.error.code}</Text>
          ) : null}
          {state.error.diagnostics ? (
            <Text style={styles.errorDiagnostics}>{state.error.diagnostics}</Text>
          ) : null}
          <Pressable
            style={styles.retry}
            disabled={!canStartGeneration(state)}
            onPress={runGenerate}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {state.history.length > 1 ? (
        <View style={styles.historyBox}>
          <Text style={styles.label}>Session history</Text>
          <View style={styles.historyRow}>
            {state.history.map((entry) => {
              const selected = current?.id === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  style={[styles.historyChip, selected ? styles.historyChipSelected : null]}
                  disabled={state.busy}
                  onPress={() => setState((prev) => selectHistoryEntry(prev, entry.id))}
                >
                  <Text
                    style={[
                      styles.historyChipText,
                      selected ? styles.historyChipTextSelected : null,
                    ]}
                  >
                    {entry.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {current ? (
        <View style={styles.resultBox}>
          <Text style={styles.recipeName}>{current.recipe.name}</Text>
          {current.recipe.description ? (
            <Text style={styles.recipeDescription}>{current.recipe.description}</Text>
          ) : null}
          <Text style={styles.recipeMeta}>
            {[current.recipe.cuisineFamily, mealTypeLabel(current.recipe.mealType)]
              .filter(Boolean)
              .join(" • ")}
          </Text>
          <Text style={styles.recipeMeta}>
            {current.recipe.servings} serving{current.recipe.servings === 1 ? "" : "s"}
          </Text>
          <Text style={styles.recipeMeta}>Prep: {current.recipe.prepMinutes} min</Text>
          <Text style={styles.recipeMeta}>Cook: {current.recipe.cookMinutes} min</Text>
          <Text style={styles.recipeMeta}>
            Total: {formatRecipeTotalMinutes(current.recipe)} min
          </Text>

          <Text style={styles.subheading}>Ingredients</Text>
          {current.recipe.ingredients.map((ingredient, index) => (
            <Text key={`${ingredient.name}-${index}`} style={styles.listItem}>
              • {formatIngredientLine(ingredient)}
            </Text>
          ))}

          <Text style={styles.subheading}>Instructions</Text>
          {current.recipe.instructions.map((step, index) => (
            <Text key={`step-${index}`} style={styles.listItem}>
              {index + 1}. {step}
            </Text>
          ))}

          <CollapsibleSection
            title="AI Details"
            open={state.showAiDetails}
            onToggle={() =>
              setState((prev) => ({ ...prev, showAiDetails: !prev.showAiDetails }))
            }
          >
            <KeyValueRows rows={aiRows} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Raw RecipeCandidate"
            open={state.showRaw}
            onToggle={() => setState((prev) => ({ ...prev, showRaw: !prev.showRaw }))}
          >
            <Text style={styles.rawJson}>{JSON.stringify(current.recipe, null, 2)}</Text>
          </CollapsibleSection>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: "800", color: "#0B1F17" },
  help: { color: "#3D5A4C", marginTop: -6 },
  label: { fontWeight: "700", color: "#0B1F17" },
  note: { color: "#3D5A4C", fontSize: 12, marginTop: 8 },
  mealRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mealChip: {
    borderWidth: 1,
    borderColor: "#C9D9CF",
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mealChipSelected: { backgroundColor: "#1F6F4A", borderColor: "#1F6F4A" },
  mealChipText: { color: "#0B1F17", fontWeight: "600" },
  mealChipTextSelected: { color: "#fff" },
  section: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D9CF",
    overflow: "hidden",
  },
  sectionHeader: { padding: 12 },
  sectionTitle: { fontWeight: "700", color: "#0B1F17" },
  sectionBody: { paddingHorizontal: 12, paddingBottom: 12 },
  kvList: { gap: 8 },
  kvRow: { gap: 2 },
  kvLabel: { color: "#3D5A4C", fontSize: 12, fontWeight: "600" },
  kvValue: { color: "#0B1F17" },
  primary: {
    backgroundColor: "#1F6F4A",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: "#fff", fontWeight: "700" },
  busyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  errorBox: {
    backgroundColor: "#FCE8E8",
    borderRadius: 8,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "#E7B6B6",
  },
  errorTitle: { color: "#9B1C1C", fontWeight: "800" },
  errorMessage: { color: "#9B1C1C" },
  errorCode: { color: "#9B1C1C", fontFamily: "monospace", fontSize: 12 },
  errorDiagnostics: { color: "#7A3B3B", fontSize: 12 },
  retry: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: "#9B1C1C",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryText: { color: "#fff", fontWeight: "700" },
  warnBox: {
    backgroundColor: "#FFF6DF",
    borderRadius: 8,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: "#E6D3A0",
  },
  warnTitle: { fontWeight: "800", color: "#7A5A10" },
  warnBody: { color: "#7A5A10" },
  historyBox: { gap: 8 },
  historyRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  historyChip: {
    borderWidth: 1,
    borderColor: "#C9D9CF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  historyChipSelected: { backgroundColor: "#0B1F17", borderColor: "#0B1F17" },
  historyChipText: { color: "#0B1F17", fontWeight: "600", fontSize: 12 },
  historyChipTextSelected: { color: "#fff" },
  resultBox: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D9CF",
    padding: 16,
    gap: 8,
  },
  recipeName: { fontSize: 22, fontWeight: "800", color: "#0B1F17" },
  recipeDescription: { color: "#3D5A4C" },
  recipeMeta: { color: "#0B1F17" },
  subheading: { marginTop: 8, fontWeight: "800", color: "#0B1F17" },
  listItem: { color: "#0B1F17", lineHeight: 20 },
  rawJson: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#0B1F17",
    backgroundColor: "#F3F7F4",
    padding: 8,
  },
});
