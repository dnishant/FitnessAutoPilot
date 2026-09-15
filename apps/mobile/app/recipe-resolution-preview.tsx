import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { ResolvedRecipe } from "@fitness-autopilot/contracts";
import { useSession } from "../src/state/session";
import {
  RECIPE_RESOLUTION_PREVIEW_LOADING,
  RECIPE_RESOLUTION_PREVIEW_TITLE,
  buildRecipeResolutionPromptPreview,
  createRecipeResolutionPreviewUiState,
  dedupeProofRows,
  formatRecipeResolutionFailureLine,
  humanizeRecipeResolutionError,
  recipeCardSummaryRows,
  slotUsageCountForCandidate,
  type RecipeResolutionPreviewUiState,
} from "../src/lib/recipe-resolution-preview";

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
      {props.rows.map((row, index) => (
        <View key={`${row.label}:${index}`} style={styles.kvRow}>
          <Text style={styles.kvLabel}>{row.label}</Text>
          <Text style={styles.kvValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

function RecipeDetailCard(props: {
  recipe: ResolvedRecipe;
  slotCount: number;
}) {
  const { recipe, slotCount } = props;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{recipe.name}</Text>
      <Text style={styles.muted}>Used in {slotCount} weekly meal slot{slotCount === 1 ? "" : "s"}</Text>
      <Text style={styles.body}>{recipe.description}</Text>
      <KeyValueRows rows={recipeCardSummaryRows(recipe)} />

      <Text style={styles.subhead}>Ingredients</Text>
      {recipe.ingredients.map((ing) => (
        <Text key={ing.ingredientId} style={styles.listItem}>
          • {ing.quantity} {ing.unit} {ing.name}
          {ing.preparation ? ` (${ing.preparation})` : ""} — {ing.role} / {ing.scalingBehavior}
          {ing.scalingReferenceIngredientId
            ? ` → ${ing.scalingReferenceIngredientId}`
            : ""}
        </Text>
      ))}

      <Text style={styles.subhead}>Instructions</Text>
      {recipe.instructions.map((step) => (
        <Text key={step.stepNumber} style={styles.listItem}>
          {step.stepNumber}. {step.text}
        </Text>
      ))}

      <Text style={styles.subhead}>Prep modes</Text>
      {recipe.supportedPrepModes.map((mode) => (
        <View key={mode.mode} style={styles.modeBlock}>
          <Text style={styles.modeTitle}>
            {mode.mode} · finish ~{mode.finishTimeMinutes} min
          </Text>
          {mode.advanceTasks.length > 0 ? (
            <Text style={styles.listItem}>Advance: {mode.advanceTasks.join("; ")}</Text>
          ) : null}
          <Text style={styles.listItem}>Finish: {mode.finishTasks.join("; ")}</Text>
          {mode.storageInstructions ? (
            <Text style={styles.listItem}>Storage: {mode.storageInstructions}</Text>
          ) : null}
        </View>
      ))}

      <Text style={styles.subhead}>Meal components</Text>
      {recipe.mealComponents.map((c) => (
        <Text key={c.componentId} style={styles.listItem}>
          • {c.name} ({c.type} / {c.relationship}
          {c.required ? ", required" : ", optional"}) — {c.purpose}
        </Text>
      ))}

      {recipe.storageInstructions ? (
        <>
          <Text style={styles.subhead}>Storage</Text>
          <Text style={styles.body}>{recipe.storageInstructions}</Text>
        </>
      ) : null}
      {recipe.reheatingInstructions ? (
        <>
          <Text style={styles.subhead}>Reheating</Text>
          <Text style={styles.body}>{recipe.reheatingInstructions}</Text>
        </>
      ) : null}

      <Text style={styles.subhead}>Flavor profile</Text>
      <Text style={styles.body}>
        {recipe.flavorProfile.cuisineFamily}
        {recipe.flavorProfile.regionalStyle ? ` · ${recipe.flavorProfile.regionalStyle}` : ""}
        {"\n"}
        Flavors: {recipe.flavorProfile.flavorFamilies.join(", ")}
        {"\n"}
        Techniques: {recipe.flavorProfile.cookingTechniques.join(", ")}
      </Text>
    </View>
  );
}

export default function RecipeResolutionPreviewScreen() {
  const { resolveWeeklyRecipes, useLocalMode } = useSession();
  const [state, setState] = useState<RecipeResolutionPreviewUiState>(() =>
    createRecipeResolutionPreviewUiState(),
  );

  const selectedCandidate = useMemo(
    () => state.candidates.find((c) => c.candidateId === state.selectedCandidateId) ?? null,
    [state.candidates, state.selectedCandidateId],
  );

  const promptPreview = useMemo(
    () => (selectedCandidate ? buildRecipeResolutionPromptPreview(selectedCandidate) : null),
    [selectedCandidate],
  );

  const recipes = useMemo(() => {
    if (!state.result) return [];
    return state.uniqueCandidateIds
      .map((id) => state.result!.recipesByCandidateId[id])
      .filter((r): r is ResolvedRecipe => Boolean(r));
  }, [state.result, state.uniqueCandidateIds]);

  async function onResolve() {
    setState((prev) => ({ ...prev, busy: true, error: null, failures: [], result: null }));
    const response = await resolveWeeklyRecipes({
      candidates: state.candidates,
      uniqueCandidateIds: state.uniqueCandidateIds,
    });
    if (!response.ok) {
      setState((prev) => ({
        ...prev,
        busy: false,
        error: {
          message: humanizeRecipeResolutionError({
            message: response.error,
            code: response.code,
          }),
          code: response.code,
          diagnostics: response.diagnostics,
        },
        result: response.result ?? null,
        failures: response.failures ?? [],
        meta: response.meta,
        selectedCandidateId:
          response.result?.uniqueCandidateIds[0] ?? prev.selectedCandidateId,
      }));
      return;
    }
    setState((prev) => ({
      ...prev,
      busy: false,
      result: response.result,
      failures: response.failures ?? [],
      meta: response.meta,
      selectedCandidateId: response.result.uniqueCandidateIds[0] ?? prev.selectedCandidateId,
    }));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{RECIPE_RESOLUTION_PREVIEW_TITLE}</Text>
      <Text style={styles.help}>
        PLAN-008 resolves each unique culinary candidate once (not once per meal slot), with
        source grounding and taste-first structured recipes.
      </Text>
      {useLocalMode ? (
        <Text style={styles.warn}>
          Local planner mode cannot call Gemini. Switch to remote Supabase to resolve recipes.
        </Text>
      ) : null}

      <KeyValueRows rows={dedupeProofRows(state.strategy, state.result)} />

      <Text style={styles.subhead}>Unique candidates (Simple strategy fixture)</Text>
      {state.candidates.map((candidate) => {
        const slots = slotUsageCountForCandidate(state.strategy, candidate.candidateId);
        return (
          <Pressable
            key={candidate.candidateId}
            style={[
              styles.chip,
              state.selectedCandidateId === candidate.candidateId && styles.chipSelected,
            ]}
            onPress={() =>
              setState((prev) => ({ ...prev, selectedCandidateId: candidate.candidateId }))
            }
          >
            <Text style={styles.chipText}>
              {candidate.name} ×{slots} → 1 recipe
            </Text>
          </Pressable>
        );
      })}

      <Pressable style={styles.primary} disabled={state.busy || useLocalMode} onPress={onResolve}>
        {state.busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Resolve Recipes</Text>
        )}
      </Pressable>
      {state.busy ? <Text style={styles.muted}>{RECIPE_RESOLUTION_PREVIEW_LOADING}</Text> : null}
      {state.error ? (
        <Text style={styles.error}>
          {state.error.message}
          {state.error.code ? ` (${state.error.code})` : ""}
        </Text>
      ) : null}

      {state.failures.length > 0 ? (
        <View style={styles.failureBox}>
          <Text style={styles.subhead}>Failures ({state.failures.length})</Text>
          {state.failures.map((failure) => (
            <Text key={failure.candidateId} style={styles.failureItem}>
              • {formatRecipeResolutionFailureLine(failure)}
            </Text>
          ))}
        </View>
      ) : null}

      {state.meta ? (
        <Text style={styles.muted}>
          {state.meta.provider}/{state.meta.model} · {state.meta.promptVersion} ·{" "}
          {state.meta.durationMs ?? "?"}ms · calls={state.meta.resolverCallCount}
        </Text>
      ) : null}

      {recipes.map((recipe) => (
        <RecipeDetailCard
          key={recipe.candidateId}
          recipe={recipe}
          slotCount={slotUsageCountForCandidate(state.strategy, recipe.candidateId)}
        />
      ))}

      <CollapsibleSection
        title="Prompt preview (selected candidate)"
        open={state.showPrompt}
        onToggle={() => setState((prev) => ({ ...prev, showPrompt: !prev.showPrompt }))}
      >
        {promptPreview ? (
          <>
            <Text style={styles.muted}>version: {promptPreview.version}</Text>
            <Text style={styles.mono}>{promptPreview.systemInstruction}</Text>
            <Text style={styles.mono}>{promptPreview.userPrompt}</Text>
          </>
        ) : null}
      </CollapsibleSection>

      <CollapsibleSection
        title="Raw JSON"
        open={state.showRaw}
        onToggle={() => setState((prev) => ({ ...prev, showRaw: !prev.showRaw }))}
      >
        <Text style={styles.mono}>
          {JSON.stringify(
            {
              uniqueCandidateIds: state.uniqueCandidateIds,
              result: state.result,
              failures: state.failures,
              meta: state.meta,
            },
            null,
            2,
          )}
        </Text>
      </CollapsibleSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: "800", color: "#0B1F17" },
  help: { color: "#3D5A4C" },
  warn: { color: "#8A4B08", backgroundColor: "#FFF4E5", padding: 10, borderRadius: 8 },
  error: { color: "#9B1C1C" },
  failureBox: {
    backgroundColor: "#FFF1F0",
    borderWidth: 1,
    borderColor: "#F3C0BC",
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  failureItem: { color: "#9B1C1C", fontSize: 13, lineHeight: 18 },
  muted: { color: "#3D5A4C", fontSize: 13 },
  subhead: { marginTop: 8, fontWeight: "800", color: "#0B1F17" },
  body: { color: "#0B1F17", lineHeight: 20 },
  listItem: { color: "#0B1F17", marginTop: 4, lineHeight: 20 },
  primary: {
    backgroundColor: "#1F6F4A",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800" },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C9D9CF",
    borderRadius: 8,
    padding: 10,
  },
  chipSelected: { borderColor: "#1F6F4A", backgroundColor: "#E4F0E8" },
  chipText: { fontWeight: "700", color: "#0B1F17" },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C9D9CF",
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#0B1F17" },
  modeBlock: { marginTop: 4, gap: 2 },
  modeTitle: { fontWeight: "700", color: "#1F6F4A" },
  section: { backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#C9D9CF" },
  sectionHeader: { padding: 12 },
  sectionTitle: { fontWeight: "800", color: "#0B1F17" },
  sectionBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  kvList: { gap: 4 },
  kvRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  kvLabel: { color: "#3D5A4C", flex: 1 },
  kvValue: { color: "#0B1F17", flex: 1.4, fontWeight: "600" },
  mono: { fontFamily: "monospace", fontSize: 11, color: "#0B1F17" },
});
