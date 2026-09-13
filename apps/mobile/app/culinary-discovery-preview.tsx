import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSession } from "../src/state/session";
import {
  ANTI_REPETITION_RECENT_JSON,
  CULINARY_DISCOVERY_MEAL_TYPES,
  CULINARY_DISCOVERY_PREVIEW_LOADING,
  CULINARY_DISCOVERY_PREVIEW_TITLE,
  CULINARY_DISCOVERY_QA_PRESETS,
  beginCulinaryDiscovery,
  buildCulinaryDiscoveryRequest,
  buildDiscoveryContextRows,
  buildDiscoveryDetailsRows,
  canStartCulinaryDiscovery,
  createCulinaryDiscoveryPreviewUiState,
  cuisineCatalogHint,
  failCulinaryDiscovery,
  fitnessAdaptabilityLabel,
  mealPrepAdaptabilityLabel,
  proteinCatalogHint,
  succeedCulinaryDiscovery,
  type CulinaryDiscoveryPreviewUiState,
} from "../src/lib/culinary-discovery-preview";
import { mealTypeLabel } from "../src/lib/recipe-preview";
import type { CulinaryDiscoveryCandidate } from "@fitness-autopilot/contracts";

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

function CandidateCard(props: { candidate: CulinaryDiscoveryCandidate }) {
  const c = props.candidate;
  return (
    <View style={styles.candidateCard}>
      <Text style={styles.candidateName}>{c.name}</Text>
      <Text style={styles.candidateMeta}>
        Cuisine · {c.cuisineFamily}
        {c.regionalStyle ? `\nRegion · ${c.regionalStyle}` : ""}
        {c.primaryProtein ? `\nProtein · ${c.primaryProtein}` : ""}
        {`\nFormat · ${c.dishFormat}`}
      </Text>
      <Text style={styles.candidateLine}>
        Flavor · {c.flavorFamilies.join(" · ")}
      </Text>
      <Text style={styles.candidateLine}>
        Technique · {c.cookingTechniques.join(" · ")}
      </Text>
      {c.textureTags.length > 0 ? (
        <Text style={styles.candidateLine}>Texture · {c.textureTags.join(" · ")}</Text>
      ) : null}
      <Text style={styles.candidateWhy}>{c.whyItIsInteresting}</Text>
      <Text style={styles.candidateLine}>
        Fitness adaptability · {fitnessAdaptabilityLabel(c.fitnessAdaptability)}
      </Text>
      <Text style={styles.candidateReason}>{c.fitnessAdaptabilityReason}</Text>
      <Text style={styles.candidateLine}>
        Prep adaptability · {mealPrepAdaptabilityLabel(c.mealPrepAdaptability)}
        {c.estimatedFinishMinutesAfterPrep != null
          ? ` · ~${c.estimatedFinishMinutesAfterPrep} min finish`
          : ""}
      </Text>
      <Text style={styles.candidateLine}>Novelty · {c.noveltyReason}</Text>
      <Text style={styles.candidateSource}>
        Source · {c.source.name}
        {c.source.author ? ` (${c.source.author})` : ""}
      </Text>
      <Pressable
        onPress={() => {
          void Linking.openURL(c.source.url);
        }}
      >
        <Text style={styles.sourceLink}>Open source</Text>
      </Pressable>
    </View>
  );
}

export default function CulinaryDiscoveryPreviewScreen() {
  const {
    mealPreferences,
    cookingPreferences,
    discoverCulinaryCandidates,
    useLocalMode,
  } = useSession();

  const sessionInput = useMemo(
    () => ({ mealPreferences, cookingPreferences }),
    [mealPreferences, cookingPreferences],
  );

  const [state, setState] = useState<CulinaryDiscoveryPreviewUiState>(() =>
    createCulinaryDiscoveryPreviewUiState(sessionInput),
  );

  const draft = useMemo(
    () => buildCulinaryDiscoveryRequest(state.form, sessionInput),
    [state.form, sessionInput],
  );

  const contextRows = useMemo(
    () => (draft.ok ? buildDiscoveryContextRows(draft.request) : []),
    [draft],
  );

  const canDiscover = canStartCulinaryDiscovery(state);

  async function runDiscover(reuseLastRequest: boolean) {
    let request;
    if (reuseLastRequest && state.lastRequest) {
      request = state.lastRequest;
    } else {
      const built = buildCulinaryDiscoveryRequest(state.form, sessionInput);
      if (!built.ok) {
        setState((prev) => failCulinaryDiscovery(prev, built.error));
        return;
      }
      request = built.request;
    }

    setState((prev) => beginCulinaryDiscovery(prev, request));
    const result = await discoverCulinaryCandidates(request);
    if (!result.ok) {
      setState((prev) =>
        failCulinaryDiscovery(prev, {
          message: result.error,
          code: result.code,
          diagnostics: result.diagnostics,
        }),
      );
      return;
    }
    setState((prev) => succeedCulinaryDiscovery(prev, result.result, result.meta));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{CULINARY_DISCOVERY_PREVIEW_TITLE}</Text>
      <Text style={styles.subtitle}>
        Search-grounded recipe candidates via Gemini + Google Search. Does not write to the recipe
        library or weekly planner.
      </Text>

      {useLocalMode ? (
        <Text style={styles.warning}>
          Culinary discovery requires Supabase remote mode (`EXPO_PUBLIC_USE_LOCAL_PLANNER=false`)
          and server-side `GEMINI_API_KEY`. Local planner mode cannot call Gemini.
        </Text>
      ) : null}

      <Text style={styles.sectionHeading}>Discovery inputs</Text>
      <Text style={styles.hint}>Meal type</Text>
      <View style={styles.chipRow}>
        {CULINARY_DISCOVERY_MEAL_TYPES.map((mealType) => {
          const selected = state.form.mealType === mealType;
          return (
            <Pressable
              key={mealType}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() =>
                setState((prev) => ({
                  ...prev,
                  form: { ...prev.form, mealType },
                }))
              }
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {mealTypeLabel(mealType)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>Cuisine(s) — e.g. {cuisineCatalogHint()}</Text>
      <TextInput
        style={styles.input}
        value={state.form.cuisinesText}
        onChangeText={(cuisinesText) =>
          setState((prev) => ({ ...prev, form: { ...prev.form, cuisinesText } }))
        }
        autoCapitalize="words"
        placeholder="Indian"
      />

      <Text style={styles.hint}>Protein(s) — e.g. {proteinCatalogHint()}</Text>
      <TextInput
        style={styles.input}
        value={state.form.proteinsText}
        onChangeText={(proteinsText) =>
          setState((prev) => ({ ...prev, form: { ...prev.form, proteinsText } }))
        }
        autoCapitalize="words"
        placeholder="Chicken"
      />

      <Text style={styles.hint}>Target candidate count</Text>
      <TextInput
        style={styles.input}
        value={state.form.targetCandidateCountText}
        onChangeText={(targetCandidateCountText) =>
          setState((prev) => ({
            ...prev,
            form: { ...prev.form, targetCandidateCountText },
          }))
        }
        keyboardType="number-pad"
        placeholder="20"
      />

      <Text style={styles.hint}>
        Recent concepts JSON (optional, for anti-repetition testing)
      </Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={state.form.recentConceptsJson}
        onChangeText={(recentConceptsJson) =>
          setState((prev) => ({
            ...prev,
            form: { ...prev.form, recentConceptsJson },
          }))
        }
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        placeholder='[{"name":"Chicken Tikka","timesSuggestedLast30Days":2}]'
      />
      <Pressable
        style={styles.secondaryButton}
        onPress={() =>
          setState((prev) => ({
            ...prev,
            form: { ...prev.form, recentConceptsJson: ANTI_REPETITION_RECENT_JSON },
          }))
        }
      >
        <Text style={styles.secondaryButtonText}>Load tikka anti-repetition sample</Text>
      </Pressable>

      <Text style={styles.sectionHeading}>QA presets</Text>
      <View style={styles.presetWrap}>
        {CULINARY_DISCOVERY_QA_PRESETS.map((preset) => (
          <Pressable
            key={preset.id}
            style={styles.presetChip}
            onPress={() =>
              setState((prev) => ({
                ...prev,
                form: { ...prev.form, ...preset.patch },
              }))
            }
          >
            <Text style={styles.presetChipText}>{preset.label}</Text>
          </Pressable>
        ))}
      </View>

      {contextRows.length > 0 ? (
        <CollapsibleSection
          title="Resolved request context"
          open={true}
          onToggle={() => undefined}
        >
          <KeyValueRows rows={contextRows} />
        </CollapsibleSection>
      ) : null}

      <Pressable
        style={[styles.primaryButton, !canDiscover && styles.buttonDisabled]}
        disabled={!canDiscover}
        onPress={() => void runDiscover(false)}
      >
        {state.status === "loading" ? (
          <ActivityIndicator color="#F3F7F4" />
        ) : (
          <Text style={styles.primaryButtonText}>Discover</Text>
        )}
      </Pressable>

      {state.lastRequest && state.status !== "loading" ? (
        <Pressable style={styles.secondaryButton} onPress={() => void runDiscover(true)}>
          <Text style={styles.secondaryButtonText}>Discover Again</Text>
        </Pressable>
      ) : null}

      {state.status === "loading" ? (
        <Text style={styles.loadingText}>{CULINARY_DISCOVERY_PREVIEW_LOADING}</Text>
      ) : null}

      {state.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{state.error.message}</Text>
          {state.error.code ? (
            <Text style={styles.errorCode}>{state.error.code}</Text>
          ) : null}
          {state.error.diagnostics ? (
            <Text style={styles.diagnostics}>{state.error.diagnostics}</Text>
          ) : null}
        </View>
      ) : null}

      {state.result ? (
        <>
          <Text style={styles.sectionHeading}>
            Candidates ({state.result.candidates.length})
          </Text>
          {state.result.candidates.map((candidate) => (
            <CandidateCard key={candidate.candidateId} candidate={candidate} />
          ))}

          <CollapsibleSection
            title="Discovery Details"
            open={state.detailsOpen}
            onToggle={() =>
              setState((prev) => ({ ...prev, detailsOpen: !prev.detailsOpen }))
            }
          >
            <KeyValueRows rows={buildDiscoveryDetailsRows(state.result, state.meta)} />
            <Text style={styles.rawHeading}>Search queries</Text>
            <Text style={styles.rawBlock}>
              {(state.result.discoveryMetadata.searchQueries ?? []).join("\n") || "(none)"}
            </Text>
            <Text style={styles.rawHeading}>Safe grounding metadata</Text>
            <Text style={styles.rawBlock}>
              {JSON.stringify(state.result.groundingMetadata ?? null, null, 2)}
            </Text>
            <Text style={styles.rawHeading}>Raw structured result</Text>
            <Text style={styles.rawBlock}>
              {JSON.stringify(state.result, null, 2)}
            </Text>
          </CollapsibleSection>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 48,
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0B1F17",
  },
  subtitle: {
    fontSize: 14,
    color: "#3A5247",
    marginBottom: 8,
  },
  warning: {
    backgroundColor: "#FFF4E5",
    color: "#7A4B00",
    padding: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  sectionHeading: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "700",
    color: "#0B1F17",
  },
  hint: {
    fontSize: 12,
    color: "#5A7266",
  },
  input: {
    borderWidth: 1,
    borderColor: "#C5D5CC",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    color: "#0B1F17",
  },
  multiline: {
    minHeight: 110,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#C5D5CC",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  chipSelected: {
    backgroundColor: "#0B1F17",
    borderColor: "#0B1F17",
  },
  chipText: {
    color: "#0B1F17",
    fontWeight: "600",
  },
  chipTextSelected: {
    color: "#F3F7F4",
  },
  presetWrap: {
    gap: 8,
  },
  presetChip: {
    borderWidth: 1,
    borderColor: "#C5D5CC",
    borderRadius: 8,
    padding: 10,
    backgroundColor: "#EAF2ED",
  },
  presetChipText: {
    color: "#0B1F17",
    fontSize: 13,
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: "#0B1F17",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#F3F7F4",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#0B1F17",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: {
    color: "#0B1F17",
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  loadingText: {
    color: "#3A5247",
    fontStyle: "italic",
  },
  errorBox: {
    backgroundColor: "#FDECEC",
    padding: 12,
    borderRadius: 8,
    gap: 4,
  },
  errorText: {
    color: "#8B1E1E",
    fontWeight: "600",
  },
  errorCode: {
    color: "#8B1E1E",
    fontSize: 12,
  },
  diagnostics: {
    color: "#5A3A3A",
    fontSize: 11,
    fontFamily: "monospace",
  },
  candidateCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D5E3DB",
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  candidateName: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0B1F17",
  },
  candidateMeta: {
    color: "#3A5247",
    fontSize: 13,
    lineHeight: 18,
  },
  candidateLine: {
    color: "#0B1F17",
    fontSize: 13,
  },
  candidateWhy: {
    color: "#0B1F17",
    fontSize: 14,
    marginVertical: 4,
  },
  candidateReason: {
    color: "#5A7266",
    fontSize: 12,
  },
  candidateSource: {
    color: "#3A5247",
    fontSize: 13,
    marginTop: 4,
  },
  sourceLink: {
    color: "#0B5FFF",
    fontWeight: "600",
    marginTop: 2,
  },
  section: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#D5E3DB",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  sectionHeader: {
    padding: 12,
  },
  sectionTitle: {
    fontWeight: "700",
    color: "#0B1F17",
  },
  sectionBody: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  kvList: {
    gap: 6,
  },
  kvRow: {
    gap: 2,
  },
  kvLabel: {
    fontSize: 11,
    color: "#5A7266",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  kvValue: {
    fontSize: 13,
    color: "#0B1F17",
  },
  rawHeading: {
    marginTop: 8,
    fontWeight: "700",
    color: "#0B1F17",
    fontSize: 12,
  },
  rawBlock: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#3A5247",
  },
});
