import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MealPrepPlan, PrepTask, PrepTaskType } from "@fitness-autopilot/contracts";
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

type PhaseKey = "overview" | PrepTaskType | "focus";

const PHASE_META: Array<{
  key: PrepTaskType;
  label: string;
  sessionOnly?: boolean;
}> = [
  { key: "mise_en_place", label: "Mise en Place", sessionOnly: true },
  { key: "advance_prep", label: "Advance Prep", sessionOnly: true },
  { key: "cook", label: "Cook", sessionOnly: true },
  { key: "portion_and_store", label: "Portion & Store", sessionOnly: true },
  { key: "fresh_finish", label: "Finish Later" },
];

function formatMinutes(total: number): string {
  if (total < 60) return `~${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `~${h} hr` : `~${h} hr ${m} min`;
}

export default function MealPrepScreen() {
  const { weeklyPlan } = useSession();
  const plan = weeklyPlan?.mealPrepPlan;
  const planId = weeklyPlan?.generatedPlanId ?? plan?.generatedPlanId;
  const [phase, setPhase] = useState<PhaseKey>("overview");
  const [progress, setProgress] = useState<ProgressMap>({});
  const [focusIndex, setFocusIndex] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const key = mealPrepProgressStorageKey(planId);
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as ProgressMap;
        setProgress(parsed);
        const anyDone = Object.values(parsed).some((p) => p.completed);
        if (anyDone) setStarted(true);
      })
      .catch(() => {
        /* ignore */
      });
  }, [planId]);

  const persist = useCallback(
    async (next: ProgressMap) => {
      setProgress(next);
      if (!planId) return;
      await AsyncStorage.setItem(mealPrepProgressStorageKey(planId), JSON.stringify(next));
    },
    [planId],
  );

  const toggleTask = useCallback(
    (taskId: string) => {
      const current = progress[taskId];
      const completed = !(current?.completed === true);
      void persist({
        ...progress,
        [taskId]: {
          completed,
          completedAt: completed ? new Date().toISOString() : undefined,
        },
      });
    },
    [persist, progress],
  );

  const sessionOrder = useMemo(() => {
    if (!plan) return [];
    const byId = new Map(plan.tasks.map((t) => [t.id, t]));
    return plan.sessionTaskOrder
      .map((id) => byId.get(id))
      .filter((t): t is PrepTask => Boolean(t));
  }, [plan]);

  const nextFocusTask = useMemo(() => {
    if (!started || sessionOrder.length === 0) return null;
    const remaining = sessionOrder.filter((t) => !progress[t.id]?.completed);
    if (remaining.length === 0) return null;
    const idx = Math.min(focusIndex, remaining.length - 1);
    return remaining[idx] ?? remaining[0] ?? null;
  }, [focusIndex, progress, sessionOrder, started]);

  if (!weeklyPlan || weeklyPlan.status !== "ready") {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader eyebrow="MEAL PREP" title="Meal Prep" />
        <EmptyState
          title="No week planned yet"
          body="Generate your week first, then come back for a coordinated prep session."
          actionLabel="Build My Plan"
          onAction={() => router.push("/generate")}
        />
      </ScrollView>
    );
  }

  if (!plan) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader eyebrow="MEAL PREP" title="Meal Prep" />
        <ErrorState
          title="Meal prep not available"
          body="This plan was generated before meal prep planning. Regenerate your week to get a prep session."
          actionLabel="Regenerate week"
          onAction={() => router.push("/generate")}
        />
      </ScrollView>
    );
  }

  if (!plan.available || plan.lifecycle === "failed") {
    const detail =
      plan.issues.find((i) => !i.preservable)?.message ??
      plan.issues[0]?.message ??
      "We couldn't build a safe prep plan from the available recipe storage metadata.";
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <ScreenHeader eyebrow="MEAL PREP" title="Meal Prep" />
        <ErrorState
          title="Meal prep needs attention"
          body={detail}
          actionLabel="Back to Plan"
          onAction={() => router.push("/(tabs)/plan")}
        />
      </ScrollView>
    );
  }

  const phaseCounts = PHASE_META.map((p) => {
    const tasks = plan.tasks.filter((t) => t.type === p.key);
    const done = tasks.filter((t) => progress[t.id]?.completed).length;
    return { ...p, total: tasks.length, done };
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="MEAL PREP"
        title="Meal Prep"
        subtitle={`${plan.coreMealCount} meals · ${plan.portionCount} portions · ${plan.coveredDayCount} days`}
      />

      {phase === "overview" && !started ? (
        <View style={styles.stack}>
          <View style={styles.hero}>
            <Text style={styles.heroTime}>{formatMinutes(plan.schedule.elapsedMinutes)} elapsed</Text>
            <Text style={styles.heroHands}>
              {formatMinutes(plan.schedule.handsOnMinutes)} hands-on
            </Text>
            <Text style={styles.heroBody}>
              One coordinated kitchen session for this week&apos;s four meals — not four separate
              recipes.
            </Text>
          </View>

          <View style={styles.phaseList}>
            {phaseCounts.map((p) => (
              <Pressable
                key={p.key}
                style={styles.phaseRow}
                onPress={() => {
                  setStarted(true);
                  setPhase(p.key);
                }}
              >
                <Text style={styles.phaseLabel}>{p.label}</Text>
                <Text style={styles.phaseCount}>
                  {p.done}/{p.total}
                </Text>
              </Pressable>
            ))}
          </View>

          {plan.futureActions.length > 0 ? (
            <Text style={styles.futureHint}>
              {plan.futureActions.length} later-week action
              {plan.futureActions.length === 1 ? "" : "s"} scheduled (thaw / finish / reheat).
            </Text>
          ) : null}

          <PrimaryButton
            label="Start Prep"
            onPress={() => {
              setStarted(true);
              setPhase("focus");
              setFocusIndex(0);
            }}
          />
          <PrimaryButton
            label="Browse phases"
            variant="secondary"
            onPress={() => {
              setStarted(true);
              setPhase("mise_en_place");
            }}
          />
        </View>
      ) : null}

      {started && phase === "focus" && nextFocusTask ? (
        <FocusCard
          task={nextFocusTask}
          plan={plan}
          onDone={() => {
            toggleTask(nextFocusTask.id);
            setFocusIndex(0);
          }}
          onBrowse={() => setPhase(nextFocusTask.type)}
        />
      ) : null}

      {started && phase === "focus" && !nextFocusTask ? (
        <View style={styles.stack}>
          <Text style={styles.doneTitle}>Prep session complete</Text>
          <Text style={styles.heroBody}>
            Remaining work is on Finish Later days. Open that phase when you need it.
          </Text>
          <PrimaryButton label="Finish Later" onPress={() => setPhase("fresh_finish")} />
          <PrimaryButton
            label="Back to overview"
            variant="secondary"
            onPress={() => setPhase("overview")}
          />
        </View>
      ) : null}

      {started && phase !== "focus" && phase !== "overview" ? (
        <PhaseView
          plan={plan}
          phase={phase}
          progress={progress}
          onToggle={toggleTask}
          phaseCounts={phaseCounts}
          onSelectPhase={setPhase}
          onFocus={() => setPhase("focus")}
        />
      ) : null}

      {started && phase === "overview" ? (
        <View style={styles.stack}>
          <View style={styles.hero}>
            <Text style={styles.heroTime}>{formatMinutes(plan.schedule.elapsedMinutes)} elapsed</Text>
            <Text style={styles.heroHands}>
              {formatMinutes(plan.schedule.handsOnMinutes)} hands-on
            </Text>
          </View>
          <View style={styles.phaseList}>
            {phaseCounts.map((p) => (
              <Pressable key={p.key} style={styles.phaseRow} onPress={() => setPhase(p.key)}>
                <Text style={styles.phaseLabel}>{p.label}</Text>
                <Text style={styles.phaseCount}>
                  {p.done}/{p.total}
                </Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton label="Continue next task" onPress={() => setPhase("focus")} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function FocusCard(props: {
  task: PrepTask;
  plan: MealPrepPlan;
  onDone: () => void;
  onBrowse: () => void;
}) {
  const { task, plan } = props;
  const parallel = (task.timing?.parallelTaskIds ?? [])
    .map((id) => plan.tasks.find((t) => t.id === id))
    .filter((t): t is PrepTask => Boolean(t))
    .slice(0, 3);

  return (
    <View style={styles.stack}>
      <Text style={styles.focusEyebrow}>NEXT</Text>
      <Text style={styles.focusTitle}>{task.title}</Text>
      <Text style={styles.focusMeta}>
        {task.durationMinutes} min active
        {task.passiveMinutes ? ` · ${task.passiveMinutes} min passive` : ""}
      </Text>
      {task.instructions.slice(0, 3).map((line) => (
        <Text key={line} style={styles.instruction}>
          {line}
        </Text>
      ))}
      {parallel.length > 0 ? (
        <View style={styles.whileBox}>
          <Text style={styles.whileLabel}>You can work on</Text>
          {parallel.map((p) => (
            <Text key={p.id} style={styles.whileItem}>
              · {p.title}
            </Text>
          ))}
        </View>
      ) : null}
      <PrimaryButton label="Done" onPress={props.onDone} />
      <PrimaryButton label="See phase list" variant="ghost" onPress={props.onBrowse} />
    </View>
  );
}

function PhaseView(props: {
  plan: MealPrepPlan;
  phase: PrepTaskType;
  progress: ProgressMap;
  onToggle: (id: string) => void;
  phaseCounts: Array<{ key: PrepTaskType; label: string; total: number; done: number }>;
  onSelectPhase: (p: PhaseKey) => void;
  onFocus: () => void;
}) {
  const tasks =
    props.phase === "mise_en_place" ||
    props.phase === "advance_prep" ||
    props.phase === "cook" ||
    props.phase === "portion_and_store"
      ? props.plan.sessionTaskOrder
          .map((id) => props.plan.tasks.find((t) => t.id === id))
          .filter((t): t is PrepTask => Boolean(t) && t!.type === props.phase)
      : props.plan.tasks.filter((t) => t.type === props.phase);

  const label = PHASE_META.find((p) => p.key === props.phase)?.label ?? props.phase;
  const count = props.phaseCounts.find((p) => p.key === props.phase);

  // Group mise by phaseGroup
  const grouped =
    props.phase === "mise_en_place"
      ? groupMise(tasks)
      : [{ group: null as string | null, tasks }];

  return (
    <View style={styles.stack}>
      <View style={styles.phaseHeader}>
        <Text style={styles.phaseTitle}>{label}</Text>
        <Text style={styles.phaseCount}>
          {count?.done ?? 0}/{count?.total ?? tasks.length}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {props.phaseCounts.map((p) => (
          <Pressable
            key={p.key}
            style={[styles.tab, p.key === props.phase && styles.tabActive]}
            onPress={() => props.onSelectPhase(p.key)}
          >
            <Text style={[styles.tabText, p.key === props.phase && styles.tabTextActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {props.phase === "portion_and_store" ? (
        <StorageList plan={props.plan} progress={props.progress} onToggle={props.onToggle} />
      ) : null}

      {props.phase === "fresh_finish" ? (
        <FutureList plan={props.plan} progress={props.progress} onToggle={props.onToggle} />
      ) : null}

      {props.phase !== "portion_and_store" && props.phase !== "fresh_finish"
        ? grouped.map((g) => (
            <View key={g.group ?? "all"} style={styles.group}>
              {g.group ? <Text style={styles.groupLabel}>{g.group}</Text> : null}
              {g.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  done={props.progress[task.id]?.completed === true}
                  onToggle={() => props.onToggle(task.id)}
                />
              ))}
            </View>
          ))
        : null}

      <PrimaryButton label="Focus mode" variant="secondary" onPress={props.onFocus} />
      <PrimaryButton
        label="Overview"
        variant="ghost"
        onPress={() => props.onSelectPhase("overview")}
      />
    </View>
  );
}

function StorageList(props: {
  plan: MealPrepPlan;
  progress: ProgressMap;
  onToggle: (id: string) => void;
}) {
  const byMeal = new Map<string, typeof props.plan.storageAssignments>();
  for (const a of props.plan.storageAssignments) {
    const list = byMeal.get(a.coreMealId) ?? [];
    list.push(a);
    byMeal.set(a.coreMealId, list);
  }
  return (
    <View style={styles.group}>
      {[...byMeal.entries()].map(([coreMealId, items]) => (
        <View key={coreMealId} style={styles.storeBlock}>
          <Text style={styles.groupLabel}>{items[0]?.mealName ?? coreMealId}</Text>
          {items.map((a) => {
            const done = props.progress[a.id]?.completed === true;
            return (
              <Pressable key={a.id} style={styles.taskRow} onPress={() => props.onToggle(a.id)}>
                <Text style={styles.check}>{done ? "☑" : "☐"}</Text>
                <View style={styles.taskBody}>
                  <Text style={[styles.taskTitle, done && styles.taskDone]}>
                    {capitalize(a.day)} {a.mealType}
                  </Text>
                  <Text style={styles.taskMeta}>{a.disposition.replace(/_/g, " ")}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function FutureList(props: {
  plan: MealPrepPlan;
  progress: ProgressMap;
  onToggle: (id: string) => void;
}) {
  const finishTasks = props.plan.tasks.filter((t) => t.type === "fresh_finish");
  const actions = props.plan.futureActions;

  return (
    <View style={styles.group}>
      {actions.map((a) => {
        const done = props.progress[a.id]?.completed === true;
        return (
          <Pressable key={a.id} style={styles.taskRow} onPress={() => props.onToggle(a.id)}>
            <Text style={styles.check}>{done ? "☑" : "☐"}</Text>
            <View style={styles.taskBody}>
              <Text style={[styles.taskTitle, done && styles.taskDone]}>
                {capitalize(a.scheduledDay)} · {a.mealName ?? a.type}
              </Text>
              <Text style={styles.taskMeta}>
                {a.type.replace(/_/g, " ")}
                {a.durationMinutes != null ? ` · ~${a.durationMinutes} min` : ""}
              </Text>
              {a.instructions.slice(0, 2).map((line) => (
                <Text key={line} style={styles.taskMeta}>
                  {line}
                </Text>
              ))}
            </View>
          </Pressable>
        );
      })}
      {finishTasks.length > 0 ? (
        <>
          <Text style={styles.groupLabel}>Fresh finish steps</Text>
          {finishTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              done={props.progress[task.id]?.completed === true}
              onToggle={() => props.onToggle(task.id)}
            />
          ))}
        </>
      ) : null}
    </View>
  );
}

function TaskRow(props: { task: PrepTask; done: boolean; onToggle: () => void }) {
  return (
    <Pressable style={styles.taskRow} onPress={props.onToggle}>
      <Text style={styles.check}>{props.done ? "☑" : "☐"}</Text>
      <View style={styles.taskBody}>
        <Text style={[styles.taskTitle, props.done && styles.taskDone]}>{props.task.title}</Text>
        <Text style={styles.taskMeta}>
          {props.task.durationMinutes} min
          {props.task.passiveMinutes ? ` · ${props.task.passiveMinutes} min passive` : ""}
          {props.task.coreMealIds.length > 1
            ? ` · ${props.task.coreMealIds.length} meals`
            : ""}
        </Text>
        {props.task.allocations && props.task.allocations.length > 1 ? (
          <Text style={styles.taskMeta}>
            {props.task.allocations
              .map((a) => `${a.mealName ?? a.coreMealId}`)
              .join(" · ")}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function groupMise(tasks: PrepTask[]): Array<{ group: string | null; tasks: PrepTask[] }> {
  const order = ["produce", "proteins", "sauces_marinades", "grains", "other"] as const;
  const labels: Record<string, string> = {
    produce: "Produce",
    proteins: "Proteins",
    sauces_marinades: "Sauces & Marinades",
    grains: "Grains",
    other: "Other",
  };
  const map = new Map<string, PrepTask[]>();
  for (const t of tasks) {
    const g = t.phaseGroup ?? "other";
    const list = map.get(g) ?? [];
    list.push(t);
    map.set(g, list);
  }
  return order
    .filter((g) => (map.get(g)?.length ?? 0) > 0)
    .map((g) => ({ group: labels[g] ?? g, tasks: map.get(g)! }));
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
  stack: {
    gap: spacing.lg,
  },
  hero: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  heroTime: {
    ...typography.heading,
    color: colors.textOnDark,
  },
  heroHands: {
    ...typography.subheading,
    color: colors.textOnDarkMuted,
  },
  heroBody: {
    ...typography.body,
    color: colors.textOnDarkMuted,
  },
  phaseList: {
    gap: spacing.sm,
  },
  phaseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  phaseLabel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  phaseCount: {
    ...typography.body,
    color: colors.textSecondary,
  },
  phaseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  phaseTitle: {
    ...typography.heading,
    color: colors.text,
  },
  futureHint: {
    ...typography.body,
    color: colors.textSecondary,
  },
  focusEyebrow: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 1.2,
  },
  focusTitle: {
    ...typography.title,
    color: colors.text,
  },
  focusMeta: {
    ...typography.body,
    color: colors.textSecondary,
  },
  instruction: {
    ...typography.body,
    color: colors.text,
  },
  whileBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  whileLabel: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  whileItem: {
    ...typography.body,
    color: colors.text,
  },
  tabs: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tabActive: {
    backgroundColor: colors.primarySoft,
  },
  tabText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: "600",
  },
  group: {
    gap: spacing.sm,
  },
  groupLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 0.8,
    marginTop: spacing.sm,
  },
  taskRow: {
    flexDirection: "row",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  check: {
    fontSize: 20,
    color: colors.primary,
    lineHeight: 24,
  },
  taskBody: {
    flex: 1,
    gap: 2,
  },
  taskTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  taskDone: {
    textDecorationLine: "line-through",
    color: colors.textMuted,
  },
  taskMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  storeBlock: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  doneTitle: {
    ...typography.heading,
    color: colors.text,
  },
});
