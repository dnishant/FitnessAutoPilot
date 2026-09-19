import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MealPrepPlan } from "@fitness-autopilot/contracts";
import {
  buildSessionPlaybook,
  formatDurationLabel,
  type SessionPlaybook,
  type SessionPlaybookStep,
} from "@fitness-autopilot/domain";
import {
  EmptyState,
  ErrorState,
  PrimaryButton,
  ScreenHeader,
} from "../src/components/ui/primitives";
import { mealPrepProgressStorageKey } from "../src/lib/consumer-plan-view";
import { useSession } from "../src/state/session";
import { colors, radii, spacing, typography } from "../src/theme/tokens";

type ProgressMap = Record<string, { completed: boolean; completedAt?: string }>;
type ScreenMode = "overview" | "play" | "complete" | "later";

type ProgressState = {
  progress: ProgressMap;
  currentStepId?: string;
};

type BackgroundItem = { id: string; label: string; remainingLabel?: string };

export default function MealPrepScreen() {
  const { weeklyPlan, generateMealPrepPlan } = useSession();
  const plan = weeklyPlan?.mealPrepPlan;
  const planId = weeklyPlan?.generatedPlanId ?? plan?.generatedPlanId;
  const [mode, setMode] = useState<ScreenMode>("overview");
  const [progress, setProgress] = useState<ProgressMap>({});
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const playbook = useMemo(() => (plan?.available ? buildSessionPlaybook(plan) : null), [plan]);

  useEffect(() => {
    const key = mealPrepProgressStorageKey(planId);
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as ProgressState | ProgressMap;
        const map =
          parsed && typeof parsed === "object" && "progress" in parsed
            ? (parsed as ProgressState).progress
            : (parsed as ProgressMap);
        setProgress(map ?? {});
        const done = Object.values(map ?? {}).filter((p) => p.completed).length;
        if (playbook && done >= playbook.steps.length && playbook.steps.length > 0) {
          setMode("complete");
        } else if (done > 0) {
          setMode("play");
        }
      })
      .catch(() => {
        /* ignore */
      });
  }, [planId, playbook]);

  const persist = useCallback(
    async (next: ProgressMap, currentStepId?: string) => {
      setProgress(next);
      if (!planId) return;
      const payload: ProgressState = { progress: next, currentStepId };
      await AsyncStorage.setItem(mealPrepProgressStorageKey(planId), JSON.stringify(payload));
    },
    [planId],
  );

  const onGenerate = useCallback(async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generateMealPrepPlan();
      if (!result.ok) {
        setGenerateError(result.error);
        return;
      }
      setMode("overview");
      setProgress({});
    } finally {
      setGenerating(false);
    }
  }, [generateMealPrepPlan]);

  const remainingSteps = useMemo(() => {
    if (!playbook) return [];
    return playbook.steps.filter((s) => !progress[s.task.id]?.completed);
  }, [playbook, progress]);

  const currentStep = remainingSteps[0] ?? null;

  const background = useMemo(() => {
    if (!playbook || !currentStep) return [];
    return findBackgroundActivity(playbook, currentStep, progress);
  }, [playbook, currentStep, progress]);

  if (!weeklyPlan || weeklyPlan.status !== "ready") {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader eyebrow="MEAL PREP" title="Meal Prep" />
        <EmptyState
          title="No week planned yet"
          body="Generate your week first, then come back for a guided prep session."
          actionLabel="Build My Plan"
          onAction={() => router.push("/generate")}
        />
      </ScrollView>
    );
  }

  if (!plan) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader
          eyebrow="MEAL PREP"
          title="Meal Prep"
          subtitle="One guided sequence for this week’s cooking."
        />
        <View style={styles.stack}>
          <Text style={styles.lead}>
            We’ll turn your four meals into ordered steps — exactly what to do next, with the
            ingredients and instructions for that step only.
          </Text>
          {generateError ? <Text style={styles.errorText}>{generateError}</Text> : null}
          <PrimaryButton
            label="Generate Meal Prep"
            loading={generating}
            onPress={() => void onGenerate()}
          />
          <PrimaryButton
            label="Back to Plan"
            variant="ghost"
            onPress={() => router.push("/(tabs)/plan")}
          />
        </View>
      </ScrollView>
    );
  }

  if (!plan.available || plan.lifecycle === "failed" || !playbook) {
    const detail =
      plan.issues.find((i) => !i.preservable)?.message ??
      plan.issues[0]?.message ??
      generateError ??
      "We couldn't build a safe prep plan from the available recipe storage metadata.";
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader eyebrow="MEAL PREP" title="Meal Prep" />
        <ErrorState
          title="Meal prep needs attention"
          body={detail}
          actionLabel={generating ? "Generating…" : "Try again"}
          onAction={() => void onGenerate()}
        />
        <PrimaryButton
          label="Back to Plan"
          variant="ghost"
          onPress={() => router.push("/(tabs)/plan")}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="MEAL PREP"
        title="Meal Prep"
        subtitle={`${plan.coreMealCount} meals · ${plan.portionCount} portions · ${plan.coveredDayCount} days`}
      />

      {mode === "overview" ? (
        <Overview
          plan={plan}
          playbook={playbook}
          generateError={generateError}
          generating={generating}
          hasProgress={remainingSteps.length < playbook.steps.length}
          onStart={() => setMode(remainingSteps.length === 0 ? "complete" : "play")}
          onLater={() => setMode("later")}
          onRegenerate={() => void onGenerate()}
        />
      ) : null}

      {mode === "play" && currentStep ? (
        <CurrentStepView
          step={currentStep}
          totalSteps={playbook.steps.length}
          background={background}
          onDone={() => {
            const nextProgress = {
              ...progress,
              [currentStep.task.id]: {
                completed: true,
                completedAt: new Date().toISOString(),
              },
            };
            const stillLeft = playbook.steps.filter((s) => !nextProgress[s.task.id]?.completed);
            void persist(nextProgress, stillLeft[0]?.task.id);
            if (stillLeft.length === 0) setMode("complete");
          }}
          onOverview={() => setMode("overview")}
          onRecipeEscape={() => router.push("/(tabs)/plan")}
        />
      ) : null}

      {mode === "play" && !currentStep ? (
        <CompletionView
          plan={plan}
          onLater={() => setMode("later")}
          onOverview={() => setMode("overview")}
        />
      ) : null}

      {mode === "complete" ? (
        <CompletionView
          plan={plan}
          onLater={() => setMode("later")}
          onOverview={() => setMode("overview")}
        />
      ) : null}

      {mode === "later" ? (
        <LaterView
          plan={plan}
          progress={progress}
          onToggle={(id) => {
            const completed = !(progress[id]?.completed === true);
            void persist({
              ...progress,
              [id]: {
                completed,
                completedAt: completed ? new Date().toISOString() : undefined,
              },
            });
          }}
          onBack={() => setMode(remainingSteps.length === 0 ? "complete" : "play")}
        />
      ) : null}
    </ScrollView>
  );
}

function Overview(props: {
  plan: MealPrepPlan;
  playbook: SessionPlaybook;
  generateError: string | null;
  generating: boolean;
  hasProgress: boolean;
  onStart: () => void;
  onLater: () => void;
  onRegenerate: () => void;
}) {
  const { plan, playbook } = props;

  return (
    <View style={styles.stack}>
      <View style={styles.hero}>
        <Text style={styles.heroTime}>{formatDurationLabel(playbook.elapsedMinutes)}</Text>
        <Text style={styles.heroHands}>
          ~{formatDurationLabel(playbook.handsOnMinutes)} hands-on
          {playbook.allottedMinutes != null
            ? playbook.overAllottedMinutes > 0
              ? ` · ${formatDurationLabel(playbook.overAllottedMinutes)} over your ${formatDurationLabel(playbook.allottedMinutes)} window`
              : ` · fits your ${formatDurationLabel(playbook.allottedMinutes)} window`
            : ""}
        </Text>
        <Text style={styles.heroBody}>
          Follow one ordered sequence. Each step tells you what to get out and exactly what to do —
          no separate mise en place phase.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>YOU&apos;LL MAKE</Text>
      {plan.weeklyRequirements.map((m) => (
        <Text key={m.coreMealId} style={styles.mealLine}>
          · {m.name} ×{m.weeklyInstanceCount}
        </Text>
      ))}

      <Text style={styles.progressLine}>
        {playbook.steps.length} guided steps
        {plan.futureActions.length > 0
          ? ` · ${plan.futureActions.length} finish-later action${plan.futureActions.length === 1 ? "" : "s"}`
          : ""}
      </Text>

      {props.generateError ? <Text style={styles.errorText}>{props.generateError}</Text> : null}

      <PrimaryButton
        label={props.hasProgress ? "Resume Meal Prep" : "Start Meal Prep"}
        onPress={props.onStart}
      />
      {plan.futureActions.length > 0 ? (
        <PrimaryButton label="Upcoming deferred work" variant="secondary" onPress={props.onLater} />
      ) : null}
      <PrimaryButton
        label="Regenerate Meal Prep"
        variant="ghost"
        loading={props.generating}
        onPress={props.onRegenerate}
      />
    </View>
  );
}

function CurrentStepView(props: {
  step: SessionPlaybookStep;
  totalSteps: number;
  background: BackgroundItem[];
  onDone: () => void;
  onOverview: () => void;
  onRecipeEscape: () => void;
}) {
  const { step } = props;
  const { task } = step;

  return (
    <View style={styles.stack}>
      <Text style={styles.stepCounter}>
        STEP {step.stepNumber} OF {props.totalSteps}
      </Text>
      <Text style={styles.focusTitle}>{task.title}</Text>
      <Text style={styles.focusMeta}>
        ~{task.durationMinutes} min active
        {task.passiveMinutes ? ` · ${task.passiveMinutes} min in background after` : ""}
      </Text>

      {props.background.length > 0 ? (
        <View style={styles.backgroundBox}>
          <Text style={styles.sectionLabel}>IN PROGRESS</Text>
          {props.background.map((b) => (
            <Text key={b.id} style={styles.backgroundLine}>
              · {b.label}
              {b.remainingLabel ? ` — ${b.remainingLabel}` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      {task.ingredients.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.sectionLabel}>GET OUT</Text>
          {task.ingredients.map((ing) => (
            <Text key={`${ing.ingredientId}-${ing.displayQuantityLabel}`} style={styles.bullet}>
              · {ing.displayQuantityLabel} {ing.displayName}
              {ing.preparation ? ` (${ing.preparation})` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      {(task.equipment?.length ?? 0) > 0 ? (
        <View style={styles.block}>
          <Text style={styles.sectionLabel}>YOU&apos;LL ALSO NEED</Text>
          {task.equipment!.map((eq) => (
            <Text key={eq} style={styles.bullet}>
              · {eq.replace(/_/g, " ")}
            </Text>
          ))}
        </View>
      ) : null}

      {task.instructions.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.sectionLabel}>DO THIS</Text>
          {task.instructions.map((line, i) => (
            <View key={`${i}-${line.slice(0, 20)}`} style={styles.instructionRow}>
              <Text style={styles.instructionNum}>{i + 1}.</Text>
              <Text style={styles.instruction}>{line}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {task.passiveMinutes && task.passiveMinutes > 0 ? (
        <Text style={styles.passiveHint}>
          Then it continues on its own for ~{task.passiveMinutes} min
          {step.whileThisRuns[0]
            ? ` — next up while you wait: ${step.whileThisRuns[0].title}`
            : ". We'll move you to the next productive step."}
        </Text>
      ) : null}

      {task.allocations && task.allocations.length > 1 ? (
        <Text style={styles.taskMeta}>
          Shared prep:{" "}
          {task.allocations
            .map((a) => `${a.quantityLabel} → ${a.mealName ?? a.coreMealId}`)
            .join(" · ")}
        </Text>
      ) : null}

      <PrimaryButton label="Done — Next" onPress={props.onDone} />
      <PrimaryButton label="View plan / recipes" variant="ghost" onPress={props.onRecipeEscape} />
      <PrimaryButton label="Overview" variant="ghost" onPress={props.onOverview} />
    </View>
  );
}

function CompletionView(props: {
  plan: MealPrepPlan;
  onLater: () => void;
  onOverview: () => void;
}) {
  const fridge = props.plan.storageAssignments.filter((a) => a.disposition === "refrigerate").length;
  const frozen = props.plan.storageAssignments.filter((a) => a.disposition === "freeze").length;
  const fresh = props.plan.storageAssignments.filter(
    (a) => a.disposition === "fresh_finish_later",
  ).length;

  return (
    <View style={styles.stack}>
      <Text style={styles.doneTitle}>Meal prep complete</Text>
      <Text style={styles.lead}>
        {props.plan.portionCount} lunches & dinners · {props.plan.coreMealCount} core meals ·{" "}
        {props.plan.coveredDayCount} days covered
      </Text>
      <View style={styles.block}>
        <Text style={styles.bullet}>· Ready in the fridge: {fridge}</Text>
        <Text style={styles.bullet}>· Frozen for later: {frozen}</Text>
        <Text style={styles.bullet}>· Finish fresh later: {fresh}</Text>
      </View>
      {props.plan.futureActions.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>UPCOMING</Text>
          {props.plan.futureActions.slice(0, 6).map((a) => (
            <Text key={a.id} style={styles.bullet}>
              · {capitalize(a.scheduledDay)} — {a.mealName ?? a.type.replace(/_/g, " ")}
              {a.durationMinutes != null ? ` (~${a.durationMinutes} min)` : ""}
            </Text>
          ))}
          <PrimaryButton label="See all deferred work" variant="secondary" onPress={props.onLater} />
        </>
      ) : null}
      <PrimaryButton label="Back to overview" variant="ghost" onPress={props.onOverview} />
    </View>
  );
}

function LaterView(props: {
  plan: MealPrepPlan;
  progress: ProgressMap;
  onToggle: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <View style={styles.stack}>
      <Text style={styles.doneTitle}>Upcoming</Text>
      <Text style={styles.lead}>Thaw, finish, and reheat on the days you eat — not during prep.</Text>
      {props.plan.futureActions.map((a) => {
        const done = props.progress[a.id]?.completed === true;
        return (
          <Pressable key={a.id} style={styles.laterRow} onPress={() => props.onToggle(a.id)}>
            <Text style={styles.check}>{done ? "☑" : "☐"}</Text>
            <View style={styles.taskBody}>
              <Text style={[styles.taskTitle, done && styles.taskDone]}>
                {capitalize(a.scheduledDay)} · {a.mealName ?? a.type}
              </Text>
              <Text style={styles.taskMeta}>
                {a.type.replace(/_/g, " ")}
                {a.durationMinutes != null ? ` · ~${a.durationMinutes} min` : ""}
              </Text>
              {a.instructions.slice(0, 3).map((line) => (
                <Text key={line} style={styles.taskMeta}>
                  {line}
                </Text>
              ))}
            </View>
          </Pressable>
        );
      })}
      <PrimaryButton label="Back" variant="ghost" onPress={props.onBack} />
    </View>
  );
}

function findBackgroundActivity(
  playbook: SessionPlaybook,
  current: SessionPlaybookStep,
  progress: ProgressMap,
): BackgroundItem[] {
  const now = current.startOffsetMinutes;
  const items: BackgroundItem[] = [];
  for (const step of playbook.steps) {
    if (step.task.id === current.task.id) continue;
    if (!progress[step.task.id]?.completed) continue;
    const passive = step.task.passiveMinutes ?? 0;
    if (passive <= 0) continue;
    const passiveEnd = step.activeEndMinutes + passive;
    if (now < step.activeEndMinutes || now >= passiveEnd) continue;
    const remaining = Math.max(0, Math.ceil(passiveEnd - now));
    items.push({
      id: step.task.id,
      label: step.task.output?.label ?? step.task.title,
      remainingLabel: `${remaining} min remaining`,
    });
  }
  return items.slice(0, 4);
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  stack: { gap: spacing.lg },
  lead: { ...typography.body, color: colors.textSecondary },
  hero: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  heroTime: { ...typography.heading, color: colors.textOnDark },
  heroHands: { ...typography.caption, color: colors.textOnDarkMuted },
  heroBody: { ...typography.body, color: colors.textOnDarkMuted },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  mealLine: { ...typography.body, color: colors.text },
  progressLine: { ...typography.body, color: colors.textSecondary },
  errorText: { ...typography.body, color: colors.error },
  stepCounter: {
    ...typography.caption,
    color: colors.accent,
    letterSpacing: 1.2,
  },
  focusTitle: { ...typography.title, color: colors.text },
  focusMeta: { ...typography.body, color: colors.textSecondary },
  backgroundBox: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  backgroundLine: { ...typography.body, color: colors.text },
  block: { gap: spacing.xs },
  bullet: { ...typography.body, color: colors.text },
  instructionRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
  instructionNum: { ...typography.bodyStrong, color: colors.primary, minWidth: 22 },
  instruction: { ...typography.body, color: colors.text, flex: 1 },
  passiveHint: { ...typography.body, color: colors.textSecondary },
  taskMeta: { ...typography.caption, color: colors.textSecondary },
  doneTitle: { ...typography.heading, color: colors.text },
  laterRow: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  check: { fontSize: 20, color: colors.primary, lineHeight: 24 },
  taskBody: { flex: 1, gap: 2 },
  taskTitle: { ...typography.bodyStrong, color: colors.text },
  taskDone: { textDecorationLine: "line-through", color: colors.textMuted },
});
