import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSession } from "../src/state/session";
import {
  WEEKLY_STRATEGY_PREVIEW_TITLE,
  buildPlanningContextRows,
  canBuildWeeklyStrategyRequest,
} from "../src/lib/weekly-strategy-preview";
import {
  RANKED_WEEKLY_STRATEGY_PREVIEW_LOADING,
  RANKED_WEEK_PREVIEW_SCENARIOS,
  applyRankedWeekScenario,
  buildDiscoveryRequestForWeekPreview,
  buildRankedCandidateUsageRows,
  buildRankedPromptPreview,
  buildRankedQualityStatRows,
  buildRankedWeeklyDayViews,
  buildRankedWeeklyStrategyRequestFromPreview,
  canStartRankedWeeklyGeneration,
  createRankedWeeklyStrategyPreviewUiState,
  rankDiscoveryCandidatesForPreview,
  scenarioPools,
  type RankedWeekPreviewScenarioId,
  type RankedWeeklyStrategyPreviewUiState,
} from "../src/lib/ranked-weekly-strategy-preview";

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

export default function WeeklyStrategyPreviewScreen() {
  const {
    nutritionTarget,
    mealPreferences,
    cookingPreferences,
    generateRankedWeeklyStrategy,
    discoverCulinaryCandidates,
    useLocalMode,
  } = useSession();
  const [state, setState] = useState<RankedWeeklyStrategyPreviewUiState>(() =>
    createRankedWeeklyStrategyPreviewUiState(),
  );

  const sessionInput = useMemo(
    () => ({ nutritionTarget, mealPreferences, cookingPreferences }),
    [nutritionTarget, mealPreferences, cookingPreferences],
  );

  const varietyLevel = scenarioPools(state.scenarioId).varietyLevel;
  const draftRequest = useMemo(
    () =>
      buildRankedWeeklyStrategyRequestFromPreview(
        sessionInput,
        state.lunchCandidates,
        state.dinnerCandidates,
        varietyLevel,
      ),
    [sessionInput, state.lunchCandidates, state.dinnerCandidates, varietyLevel],
  );

  const contextRows = useMemo(
    () => (draftRequest ? buildPlanningContextRows(draftRequest) : []),
    [draftRequest],
  );

  const canGenerate =
    canStartRankedWeeklyGeneration(state) && canBuildWeeklyStrategyRequest(sessionInput);

  async function runDiscover(mealType: "lunch" | "dinner") {
    const request = buildDiscoveryRequestForWeekPreview(mealType, sessionInput);
    setState((prev) => ({
      ...prev,
      busy: true,
      pipelineBusy: mealType,
      error: null,
    }));
    const result = await discoverCulinaryCandidates(request);
    if (!result.ok) {
      setState((prev) => ({
        ...prev,
        busy: false,
        pipelineBusy: null,
        error: { message: result.error, code: result.code, diagnostics: result.diagnostics },
      }));
      return;
    }
    const ranked = rankDiscoveryCandidatesForPreview(
      mealType,
      result.result.candidates,
      sessionInput,
    );
    setState((prev) => ({
      ...prev,
      busy: false,
      pipelineBusy: null,
      lunchCandidates: mealType === "lunch" ? ranked : prev.lunchCandidates,
      dinnerCandidates: mealType === "dinner" ? ranked : prev.dinnerCandidates,
      lunchSource: mealType === "lunch" ? "discover" : prev.lunchSource,
      dinnerSource: mealType === "dinner" ? "discover" : prev.dinnerSource,
    }));
  }

  async function runGenerate() {
    if (!draftRequest) {
      setState((prev) => ({
        ...prev,
        error: {
          message: "A daily nutrition target is required before planning a week.",
          code: "INVALID_WEEKLY_STRATEGY_REQUEST",
        },
      }));
      return;
    }
    if (!canStartRankedWeeklyGeneration(state)) {
      return;
    }
    setState((prev) => ({ ...prev, busy: true, pipelineBusy: "week", error: null }));
    const result = await generateRankedWeeklyStrategy(draftRequest);
    if (!result.ok) {
      setState((prev) => ({
        ...prev,
        busy: false,
        pipelineBusy: null,
        error: {
          message: result.error,
          code: result.code,
          diagnostics: result.diagnostics,
        },
      }));
      return;
    }
    setState((prev) => ({
      ...prev,
      busy: false,
      pipelineBusy: null,
      error: null,
      request: draftRequest,
      strategy: result.strategy,
      stats: result.stats,
      meta: result.meta,
    }));
  }

  const dayViews =
    state.strategy != null
      ? buildRankedWeeklyDayViews(
          state.strategy,
          state.lunchCandidates,
          state.dinnerCandidates,
        )
      : [];
  const statsRows = state.stats ? buildRankedQualityStatRows(state.stats) : [];
  const usageRows = state.stats ? buildRankedCandidateUsageRows(state.stats) : [];
  const promptPreview = draftRequest ? buildRankedPromptPreview(draftRequest) : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{WEEKLY_STRATEGY_PREVIEW_TITLE}</Text>
      <Text style={styles.help}>
        PLAN-007 ranked weekly strategy. Load PLAN-001/002 preferences, supply ranked lunch
        and dinner pools, then generate one 7-day lunch+dinner week from candidate IDs.
        Concepts only — no recipe resolution or meal nutrition.
      </Text>

      {useLocalMode ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Local planner mode</Text>
          <Text style={styles.warnBody}>
            Weekly strategy generation requires Supabase remote mode
            (`EXPO_PUBLIC_USE_LOCAL_PLANNER=false`) and server-side `GEMINI_API_KEY`. Ranking
            fixtures still run in-process. The client never calls Gemini directly.
          </Text>
        </View>
      ) : null}

      <Text style={styles.label}>QA scenario</Text>
      <View style={styles.historyRow}>
        {RANKED_WEEK_PREVIEW_SCENARIOS.map((scenario) => {
          const selected = state.scenarioId === scenario.id;
          return (
            <Pressable
              key={scenario.id}
              style={[styles.historyChip, selected ? styles.historyChipSelected : null]}
              disabled={state.busy}
              onPress={() =>
                setState((prev) =>
                  applyRankedWeekScenario(prev, scenario.id as RankedWeekPreviewScenarioId),
                )
              }
            >
              <Text
                style={[
                  styles.historyChipText,
                  selected ? styles.historyChipTextSelected : null,
                ]}
              >
                {scenario.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <CollapsibleSection
        title="Planning Context"
        open={state.showContext}
        onToggle={() => setState((prev) => ({ ...prev, showContext: !prev.showContext }))}
      >
        {draftRequest ? (
          <>
            <KeyValueRows rows={contextRows} />
            <Text style={styles.note}>
              Daily targets are planning guidance only — not planned or verified meal
              nutrition.
            </Text>
          </>
        ) : (
          <Text style={styles.note}>
            No daily nutrition target is loaded for the current user.
          </Text>
        )}
      </CollapsibleSection>

      <View style={styles.poolBox}>
        <Text style={styles.subheading}>Ranked candidate pools</Text>
        <Text style={styles.note}>
          Lunch: {state.lunchCandidates.length} ({state.lunchSource}) · Dinner:{" "}
          {state.dinnerCandidates.length} ({state.dinnerSource})
        </Text>
        <View style={styles.historyRow}>
          <Pressable
            style={[styles.secondary, state.busy ? styles.primaryDisabled : null]}
            disabled={state.busy}
            onPress={() => void runDiscover("lunch")}
          >
            <Text style={styles.secondaryText}>Discover lunch → rank</Text>
          </Pressable>
          <Pressable
            style={[styles.secondary, state.busy ? styles.primaryDisabled : null]}
            disabled={state.busy}
            onPress={() => void runDiscover("dinner")}
          >
            <Text style={styles.secondaryText}>Discover dinner → rank</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        style={[styles.primary, !canGenerate ? styles.primaryDisabled : null]}
        disabled={!canGenerate}
        onPress={() => void runGenerate()}
      >
        {state.busy && state.pipelineBusy === "week" ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.primaryText}>{RANKED_WEEKLY_STRATEGY_PREVIEW_LOADING}</Text>
          </View>
        ) : (
          <Text style={styles.primaryText}>
            {state.strategy ? "Generate Another Week" : "Generate Weekly Strategy"}
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
        </View>
      ) : null}

      {state.strategy && state.stats ? (
        <View style={styles.resultBox}>
          <Text style={styles.subheading}>Weekly summary</Text>
          <Text style={styles.note}>
            {state.strategy.strategySummary.varietyApproach}
          </Text>
          <Text style={styles.note}>{state.strategy.strategySummary.prepApproach}</Text>
          <Text style={styles.note}>
            {state.strategy.strategySummary.ingredientReuseApproach}
          </Text>
          <KeyValueRows rows={statsRows} />

          <Text style={styles.subheading}>Candidate usage</Text>
          <KeyValueRows rows={usageRows} />

          {dayViews.map((day) => (
            <View key={day.dayLabel} style={styles.dayBox}>
              <Text style={styles.dayTitle}>{day.dayLabel}</Text>
              <View style={styles.slotBox}>
                <Text style={styles.slotType}>Lunch</Text>
                <Text style={styles.slotName}>{day.lunch.name}</Text>
                <Text style={styles.slotMeta}>
                  {day.lunchRank} · Prep: {day.lunchPrep}
                  {day.lunchStrategy ? ` · ${day.lunchStrategy}` : ""}
                </Text>
              </View>
              <View style={styles.slotBox}>
                <Text style={styles.slotType}>Dinner</Text>
                <Text style={styles.slotName}>{day.dinner.name}</Text>
                <Text style={styles.slotMeta}>
                  {day.dinnerRank} · Prep: {day.dinnerPrep}
                </Text>
              </View>
              <Text style={styles.slotMeta}>Why: {day.why}</Text>
            </View>
          ))}

          <CollapsibleSection
            title="Prompt / context"
            open={state.showPrompt}
            onToggle={() => setState((prev) => ({ ...prev, showPrompt: !prev.showPrompt }))}
          >
            {promptPreview ? (
              <>
                <Text style={styles.note}>Version: {promptPreview.version}</Text>
                <Text style={styles.rawJson}>{promptPreview.systemInstruction}</Text>
                <Text style={styles.rawJson}>{promptPreview.userPrompt}</Text>
              </>
            ) : null}
          </CollapsibleSection>

          <CollapsibleSection
            title="Raw structured result"
            open={state.showRaw}
            onToggle={() => setState((prev) => ({ ...prev, showRaw: !prev.showRaw }))}
          >
            <Text style={styles.rawJson}>
              {JSON.stringify({ strategy: state.strategy, stats: state.stats }, null, 2)}
            </Text>
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
  secondary: {
    backgroundColor: "#E7F2EB",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  secondaryText: { color: "#1F6F4A", fontWeight: "700", fontSize: 12 },
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
  poolBox: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D9CF",
    padding: 12,
    gap: 8,
  },
  resultBox: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D9CF",
    padding: 16,
    gap: 8,
  },
  subheading: { marginTop: 8, fontWeight: "800", color: "#0B1F17" },
  dayBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E4EDE7",
    gap: 8,
  },
  dayTitle: { fontWeight: "800", color: "#0B1F17", letterSpacing: 0.6 },
  slotBox: { gap: 2 },
  slotType: { color: "#3D5A4C", fontSize: 12, fontWeight: "700" },
  slotName: { color: "#0B1F17", fontWeight: "700" },
  slotMeta: { color: "#3D5A4C" },
  rawJson: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#0B1F17",
    backgroundColor: "#F3F7F4",
    padding: 8,
  },
});
