import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { RankedCulinaryCandidate } from "@fitness-autopilot/contracts";
import { useSession } from "../src/state/session";
import { mealTypeLabel } from "../src/lib/recipe-preview";
import {
  CANDIDATE_RANKING_MEAL_TYPES,
  CANDIDATE_RANKING_PREVIEW_LOADING,
  CANDIDATE_RANKING_PREVIEW_TITLE,
  CANDIDATE_RANKING_QA_PRESETS,
  RANKING_RECENT_CONCEPTS_SAMPLE,
  applyDiscoveryCandidates,
  beginCandidateRanking,
  buildDiscoveryRequestFromRankingForm,
  buildRankingContextRows,
  buildRankingDiagnosticsRows,
  buildCandidateRankingRequest,
  canStartCandidateRanking,
  createCandidateRankingPreviewUiState,
  failCandidateRanking,
  formatScoreBreakdown,
  rankingDecisionLabel,
  similarityScoreFor,
  succeedCandidateRanking,
  type CandidateRankingPreviewUiState,
} from "../src/lib/candidate-ranking-preview";
import {
  fitnessAdaptabilityLabel,
  mealPrepAdaptabilityLabel,
} from "../src/lib/culinary-discovery-preview";

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

function RankedCard(props: {
  item: RankedCulinaryCandidate;
  result: NonNullable<CandidateRankingPreviewUiState["result"]>;
}) {
  const { item, result } = props;
  const c = item.candidate;
  const similarNames = (item.similarToCandidateIds ?? []).map((id) => {
    const match = [...result.selected, ...result.deprioritized].find(
      (row) => row.candidate.candidateId === id,
    );
    const similarity = similarityScoreFor(result, c.candidateId, id);
    const scoreLabel = similarity != null ? ` (${similarity.toFixed(2)})` : "";
    return `${match?.candidate.name ?? id}${scoreLabel}`;
  });

  return (
    <View style={styles.candidateCard}>
      <Text style={styles.candidateName}>
        #{item.rank} · {c.name}
      </Text>
      <Text style={styles.candidateMeta}>
        {rankingDecisionLabel(item.decision)} · score {item.score.toFixed(2)}
        {`\nCuisine · ${c.cuisineFamily}`}
        {c.regionalStyle ? `\nRegion · ${c.regionalStyle}` : ""}
        {c.primaryProtein ? `\nProtein · ${c.primaryProtein}` : ""}
        {`\nFormat · ${c.dishFormat}`}
      </Text>
      <Text style={styles.candidateLine}>Flavor · {c.flavorFamilies.join(" · ")}</Text>
      <Text style={styles.candidateLine}>Technique · {c.cookingTechniques.join(" · ")}</Text>
      {c.textureTags.length > 0 ? (
        <Text style={styles.candidateLine}>Texture · {c.textureTags.join(" · ")}</Text>
      ) : null}
      <Text style={styles.candidateLine}>
        Prep adaptability · {mealPrepAdaptabilityLabel(c.mealPrepAdaptability)}
        {c.estimatedFinishMinutesAfterPrep != null
          ? ` · ~${c.estimatedFinishMinutesAfterPrep} min finish`
          : ""}
      </Text>
      <Text style={styles.candidateLine}>
        Fitness · {fitnessAdaptabilityLabel(c.fitnessAdaptability)}
      </Text>
      <Text style={styles.candidateSource}>
        Source · {c.source.name}
        {c.source.author ? ` (${c.source.author})` : ""}
      </Text>
      <Text style={styles.candidateReason}>Breakdown · {formatScoreBreakdown(item.scoreBreakdown)}</Text>
      {item.reasons.map((reason) => (
        <Text key={reason} style={styles.reasonLine}>
          {reason}
        </Text>
      ))}
      {similarNames.length > 0 ? (
        <Text style={styles.candidateLine}>Similar to · {similarNames.join(" · ")}</Text>
      ) : null}
    </View>
  );
}

export default function CandidateRankingPreviewScreen() {
  const {
    mealPreferences,
    cookingPreferences,
    rankCulinaryCandidates,
    discoverCulinaryCandidates,
    useLocalMode,
  } = useSession();

  const sessionInput = useMemo(
    () => ({ mealPreferences, cookingPreferences }),
    [mealPreferences, cookingPreferences],
  );

  const [state, setState] = useState<CandidateRankingPreviewUiState>(() =>
    createCandidateRankingPreviewUiState(sessionInput),
  );

  const draft = useMemo(
    () => buildCandidateRankingRequest(state.form, sessionInput),
    [state.form, sessionInput],
  );

  const contextRows = useMemo(
    () => (draft.ok ? buildRankingContextRows(draft.request) : []),
    [draft],
  );

  const canRank = canStartCandidateRanking(state);

  async function runRank() {
    const built = buildCandidateRankingRequest(state.form, sessionInput);
    if (!built.ok) {
      setState((prev) => failCandidateRanking(prev, built.error));
      return;
    }
    setState((prev) => beginCandidateRanking(prev, built.request));
    const result = await rankCulinaryCandidates(built.request);
    if (!result.ok) {
      setState((prev) =>
        failCandidateRanking(prev, {
          message: result.error,
          code: result.code,
          diagnostics: result.diagnostics,
        }),
      );
      return;
    }
    setState((prev) => succeedCandidateRanking(prev, result.result, result.meta));
  }

  async function runDiscoverThenRank() {
    const discoveryRequest = buildDiscoveryRequestFromRankingForm(state.form, sessionInput);
    setState((prev) => ({ ...prev, status: "loading", error: null }));
    const discovered = await discoverCulinaryCandidates(discoveryRequest);
    if (!discovered.ok) {
      setState((prev) =>
        failCandidateRanking(prev, {
          message: discovered.error,
          code: discovered.code,
          diagnostics: discovered.diagnostics,
        }),
      );
      return;
    }
    const nextState = applyDiscoveryCandidates(state, discovered.result);
    const built = buildCandidateRankingRequest(nextState.form, sessionInput);
    if (!built.ok) {
      setState((prev) => failCandidateRanking({ ...nextState, ...prev }, built.error));
      return;
    }
    setState((prev) => beginCandidateRanking({ ...prev, ...nextState }, built.request));
    const ranked = await rankCulinaryCandidates(built.request);
    if (!ranked.ok) {
      setState((prev) =>
        failCandidateRanking(prev, {
          message: ranked.error,
          code: ranked.code,
          diagnostics: ranked.diagnostics,
        }),
      );
      return;
    }
    setState((prev) =>
      succeedCandidateRanking(
        { ...prev, lastDiscovery: discovered.result },
        ranked.result,
        ranked.meta,
      ),
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{CANDIDATE_RANKING_PREVIEW_TITLE}</Text>
      <Text style={styles.subtitle}>
        Deterministic ranking and culinary deduplication for lunch and dinner. Runs
        candidate-ranking-v1 in-process — no Gemini call and no Edge Function required. Does not
        write a weekly plan.
      </Text>

      {useLocalMode ? (
        <Text style={styles.note}>
          Discover-then-rank still needs remote mode (`EXPO_PUBLIC_USE_LOCAL_PLANNER=false`) and a
          server-side Gemini key. Rank Candidates works in local planner mode.
        </Text>
      ) : (
        <Text style={styles.note}>
          Rank Candidates runs in this browser via candidate-ranking-v1. It does not call
          rank-culinary-candidates, so a missing/undeployed function cannot cause a CORS error.
          Discover-then-rank still uses the hosted culinary-discovery function.
        </Text>
      )}

      <Text style={styles.sectionHeading}>Ranking inputs</Text>
      <Text style={styles.hint}>Meal type</Text>
      <View style={styles.chipRow}>
        {CANDIDATE_RANKING_MEAL_TYPES.map((mealType) => {
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

      <Text style={styles.hint}>Target pool size</Text>
      <TextInput
        style={styles.input}
        value={state.form.targetPoolSizeText}
        onChangeText={(targetPoolSizeText) =>
          setState((prev) => ({ ...prev, form: { ...prev.form, targetPoolSizeText } }))
        }
        keyboardType="number-pad"
        placeholder="12"
      />

      <Text style={styles.hint}>Cuisines (PLAN-001)</Text>
      <TextInput
        style={styles.input}
        value={state.form.cuisinesText}
        onChangeText={(cuisinesText) =>
          setState((prev) => ({ ...prev, form: { ...prev.form, cuisinesText } }))
        }
        autoCapitalize="words"
      />

      <Text style={styles.hint}>Proteins (PLAN-001)</Text>
      <TextInput
        style={styles.input}
        value={state.form.proteinsText}
        onChangeText={(proteinsText) =>
          setState((prev) => ({ ...prev, form: { ...prev.form, proteinsText } }))
        }
        autoCapitalize="words"
      />

      <Text style={styles.hint}>Experience preferences (PLAN-001)</Text>
      <TextInput
        style={styles.input}
        value={state.form.experiencesText}
        onChangeText={(experiencesText) =>
          setState((prev) => ({ ...prev, form: { ...prev.form, experiencesText } }))
        }
        placeholder="spicy, saucy_flavorful"
      />

      <Text style={styles.hint}>Dislikes</Text>
      <TextInput
        style={styles.input}
        value={state.form.dislikesText}
        onChangeText={(dislikesText) =>
          setState((prev) => ({ ...prev, form: { ...prev.form, dislikesText } }))
        }
      />

      <Text style={styles.hint}>PLAN-005 candidates JSON</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={state.form.candidatesJson}
        onChangeText={(candidatesJson) =>
          setState((prev) => ({ ...prev, form: { ...prev.form, candidatesJson } }))
        }
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
      />

      <Text style={styles.hint}>Recent concepts JSON (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={state.form.recentConceptsJson}
        onChangeText={(recentConceptsJson) =>
          setState((prev) => ({ ...prev, form: { ...prev.form, recentConceptsJson } }))
        }
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        placeholder='[{"name":"Chicken Tikka","lastSuggestedDaysAgo":1}]'
      />
      <Pressable
        style={styles.secondaryButton}
        onPress={() =>
          setState((prev) => ({
            ...prev,
            form: { ...prev.form, recentConceptsJson: RANKING_RECENT_CONCEPTS_SAMPLE },
          }))
        }
      >
        <Text style={styles.secondaryButtonText}>Load recent tikka sample</Text>
      </Pressable>

      <Text style={styles.sectionHeading}>QA presets</Text>
      <View style={styles.presetWrap}>
        {CANDIDATE_RANKING_QA_PRESETS.map((preset) => (
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
        <CollapsibleSection title="Resolved request context" open={true} onToggle={() => undefined}>
          <KeyValueRows rows={contextRows} />
        </CollapsibleSection>
      ) : null}

      <Pressable
        style={[styles.primaryButton, !canRank && styles.buttonDisabled]}
        disabled={!canRank}
        onPress={() => void runRank()}
      >
        {state.status === "loading" ? (
          <ActivityIndicator color="#F3F7F4" />
        ) : (
          <Text style={styles.primaryButtonText}>Rank Candidates</Text>
        )}
      </Pressable>

      <Pressable
        style={[styles.secondaryButton, !canRank && styles.buttonDisabled]}
        disabled={!canRank}
        onPress={() => void runDiscoverThenRank()}
      >
        <Text style={styles.secondaryButtonText}>Discover then Rank</Text>
      </Pressable>

      {state.status === "loading" ? (
        <Text style={styles.loadingText}>{CANDIDATE_RANKING_PREVIEW_LOADING}</Text>
      ) : null}

      {state.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{state.error.message}</Text>
          {state.error.code ? <Text style={styles.errorCode}>{state.error.code}</Text> : null}
          {state.error.diagnostics ? (
            <Text style={styles.diagnostics}>{state.error.diagnostics}</Text>
          ) : null}
        </View>
      ) : null}

      {state.result ? (
        <>
          <Text style={styles.sectionHeading}>
            Selected candidates ({state.result.selected.length})
          </Text>
          {state.result.selected.map((item) => (
            <RankedCard key={item.candidate.candidateId} item={item} result={state.result!} />
          ))}

          <Text style={styles.sectionHeading}>
            Deprioritized / duplicates ({state.result.deprioritized.length})
          </Text>
          {state.result.deprioritized.map((item) => (
            <RankedCard key={item.candidate.candidateId} item={item} result={state.result!} />
          ))}

          <CollapsibleSection
            title="Ranking diagnostics"
            open={state.detailsOpen}
            onToggle={() => setState((prev) => ({ ...prev, detailsOpen: !prev.detailsOpen }))}
          >
            <KeyValueRows rows={buildRankingDiagnosticsRows(state.result, state.meta)} />
            <Text style={styles.rawHeading}>Raw ranking JSON</Text>
            <Text style={styles.rawBlock}>{JSON.stringify(state.result, null, 2)}</Text>
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
  note: {
    backgroundColor: "#EAF2ED",
    color: "#0B1F17",
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
  candidateReason: {
    color: "#5A7266",
    fontSize: 12,
  },
  reasonLine: {
    color: "#0B1F17",
    fontSize: 13,
  },
  candidateSource: {
    color: "#3A5247",
    fontSize: 13,
    marginTop: 4,
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
