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
  WEEKLY_STRATEGY_PREVIEW_LOADING,
  WEEKLY_STRATEGY_PREVIEW_TITLE,
  beginWeeklyStrategyGeneration,
  buildPlanningContextRows,
  buildStrategyStatsRows,
  buildStrategySummaryRows,
  buildWeeklyDayViews,
  buildWeeklyStrategyAiDetailsRows,
  buildWeeklyStrategyRequest,
  canBuildWeeklyStrategyRequest,
  canStartWeeklyStrategyGeneration,
  createWeeklyStrategyPreviewUiState,
  failWeeklyStrategyGeneration,
  selectWeeklyStrategyHistoryEntry,
  succeedWeeklyStrategyGeneration,
  type WeeklyStrategyPreviewUiState,
} from "../src/lib/weekly-strategy-preview";

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
    generateWeeklyStrategy,
    useLocalMode,
  } = useSession();
  const [state, setState] = useState<WeeklyStrategyPreviewUiState>(() =>
    createWeeklyStrategyPreviewUiState(),
  );

  const sessionInput = useMemo(
    () => ({ nutritionTarget, mealPreferences, cookingPreferences }),
    [nutritionTarget, mealPreferences, cookingPreferences],
  );

  const draftRequest = useMemo(
    () => buildWeeklyStrategyRequest(sessionInput),
    [sessionInput],
  );

  const contextRows = useMemo(
    () => (draftRequest ? buildPlanningContextRows(draftRequest) : []),
    [draftRequest],
  );

  const canGenerate =
    canStartWeeklyStrategyGeneration(state) && canBuildWeeklyStrategyRequest(sessionInput);

  async function runGenerate() {
    if (!draftRequest) {
      setState((prev) =>
        failWeeklyStrategyGeneration(prev, {
          message: "A daily nutrition target is required before planning a week.",
          code: "INVALID_WEEKLY_STRATEGY_REQUEST",
        }),
      );
      return;
    }
    let started = false;
    setState((prev) => {
      if (!canStartWeeklyStrategyGeneration(prev)) {
        return prev;
      }
      started = true;
      return beginWeeklyStrategyGeneration(prev);
    });
    if (!started) {
      return;
    }
    const result = await generateWeeklyStrategy(draftRequest);
    if (!result.ok) {
      setState((prev) =>
        failWeeklyStrategyGeneration(prev, {
          message: result.error,
          code: result.code,
          diagnostics: result.diagnostics,
        }),
      );
      return;
    }
    setState((prev) =>
      succeedWeeklyStrategyGeneration(prev, {
        request: draftRequest,
        strategy: result.strategy,
        stats: result.stats,
        meta: result.meta,
      }),
    );
  }

  const current = state.current;
  const dayViews = current ? buildWeeklyDayViews(current.strategy.days) : [];
  const summaryRows = current ? buildStrategySummaryRows(current.strategy) : [];
  const statsRows = current ? buildStrategyStatsRows(current.stats) : [];
  const aiRows = current ? buildWeeklyStrategyAiDetailsRows(current.meta) : [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{WEEKLY_STRATEGY_PREVIEW_TITLE}</Text>
      <Text style={styles.help}>
        Dev/internal tool: generate one PLAN-004 weekly meal strategy from your saved
        nutrition and preference profile. Concepts only — no detailed recipes or verified
        meal nutrition.
      </Text>

      {useLocalMode ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Local planner mode</Text>
          <Text style={styles.warnBody}>
            Weekly strategy generation requires Supabase remote mode
            (`EXPO_PUBLIC_USE_LOCAL_PLANNER=false`) and server-side `GEMINI_API_KEY`. The
            client never calls Gemini directly.
          </Text>
        </View>
      ) : null}

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

      <Pressable
        style={[styles.primary, !canGenerate ? styles.primaryDisabled : null]}
        disabled={!canGenerate}
        onPress={runGenerate}
      >
        {state.busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.primaryText}>{WEEKLY_STRATEGY_PREVIEW_LOADING}</Text>
          </View>
        ) : (
          <Text style={styles.primaryText}>
            {current ? "Generate Another Week" : "Generate Weekly Strategy"}
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
            disabled={!canGenerate}
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
                  onPress={() =>
                    setState((prev) => selectWeeklyStrategyHistoryEntry(prev, entry.id))
                  }
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
          <Text style={styles.subheading}>Strategy summary</Text>
          <KeyValueRows rows={summaryRows} />

          <Text style={styles.subheading}>Week stats</Text>
          <Text style={styles.note}>
            Calculated by PLAN-004 application code — not by Gemini.
          </Text>
          <KeyValueRows rows={statsRows} />

          <Text style={styles.subheading}>Potential shared ingredients</Text>
          <Text style={styles.note}>
            High-level planning intent only — not a verified grocery list.
          </Text>
          {current.strategy.sharedIngredientIntents.length ? (
            current.strategy.sharedIngredientIntents.map((ingredient) => (
              <Text key={ingredient} style={styles.listItem}>
                • {ingredient}
              </Text>
            ))
          ) : (
            <Text style={styles.note}>(none listed)</Text>
          )}

          {current.strategy.planningNotes?.length ? (
            <>
              <Text style={styles.subheading}>Planning notes</Text>
              {current.strategy.planningNotes.map((note, index) => (
                <Text key={`note-${index}`} style={styles.listItem}>
                  • {note}
                </Text>
              ))}
            </>
          ) : null}

          {dayViews.map((day) => (
            <View key={day.day} style={styles.dayBox}>
              <Text style={styles.dayTitle}>{day.dayLabel}</Text>
              {day.slots.map((slot) => (
                <View key={`${day.day}-${slot.mealType}`} style={styles.slotBox}>
                  <Text style={styles.slotType}>{slot.mealTypeLabel}</Text>
                  <Text style={styles.slotName}>{slot.name}</Text>
                  {slot.repeatLabel ? (
                    <Text style={styles.repeatBadge}>{slot.repeatLabel}</Text>
                  ) : null}
                  {slot.metaLine ? <Text style={styles.slotMeta}>{slot.metaLine}</Text> : null}
                  {slot.flavorLine ? (
                    <Text style={styles.slotMeta}>Flavors: {slot.flavorLine}</Text>
                  ) : null}
                  {slot.experienceLine ? (
                    <Text style={styles.slotMeta}>Experience: {slot.experienceLine}</Text>
                  ) : null}
                  <Text style={styles.slotMeta}>{slot.prepLine}</Text>
                </View>
              ))}
            </View>
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
            title="Raw WeeklyMealStrategy"
            open={state.showRaw}
            onToggle={() => setState((prev) => ({ ...prev, showRaw: !prev.showRaw }))}
          >
            <Text style={styles.rawJson}>
              {JSON.stringify(
                { strategy: current.strategy, stats: current.stats },
                null,
                2,
              )}
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
  subheading: { marginTop: 8, fontWeight: "800", color: "#0B1F17" },
  listItem: { color: "#0B1F17", lineHeight: 20 },
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
  repeatBadge: { color: "#1F6F4A", fontWeight: "700", fontSize: 12 },
  rawJson: {
    fontFamily: "monospace",
    fontSize: 11,
    color: "#0B1F17",
    backgroundColor: "#F3F7F4",
    padding: 8,
  },
});
