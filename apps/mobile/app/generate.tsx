import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { ConsumerPlanGenerationStage } from "@fitness-autopilot/contracts";
import {
  ErrorState,
  PrimaryButton,
  ScreenHeader,
} from "../src/components/ui/primitives";
import {
  GENERATION_STAGE_COPY,
  GENERATION_STAGE_ORDER,
  generateReadySummary,
  humanizePlanGenerationError,
} from "../src/lib/consumer-plan-view";
import { useSession } from "../src/state/session";
import { colors, radii, spacing, typography } from "../src/theme/tokens";

export default function GenerateScreen() {
  const {
    generateWeeklyPlan,
    weeklyPlan,
    nutritionTarget,
    mealPreferences,
    cookingPreferences,
  } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStage, setLocalStage] = useState<ConsumerPlanGenerationStage | null>(null);

  const readyLines = useMemo(
    () =>
      generateReadySummary({
        nutritionTarget,
        mealPreferences,
        cookingPreferences,
      }),
    [nutritionTarget, mealPreferences, cookingPreferences],
  );

  const activeStage =
    weeklyPlan?.status === "generating"
      ? (weeklyPlan.generationStage ?? localStage)
      : localStage;
  const showProgress = busy || weeklyPlan?.status === "generating";

  async function submit() {
    setBusy(true);
    setError(null);
    setLocalStage("understanding_preferences");

    const result = await generateWeeklyPlan();
    setBusy(false);

    if (!result.ok) {
      setLocalStage(null);
      setError(humanizePlanGenerationError(result.error));
      return;
    }

    setLocalStage("complete");
    router.replace("/(tabs)/plan");
  }

  function stageStatus(
    stage: ConsumerPlanGenerationStage,
  ): "done" | "current" | "upcoming" {
    if (!activeStage) return "upcoming";
    const currentIndex = GENERATION_STAGE_ORDER.indexOf(activeStage);
    const stageIndex = GENERATION_STAGE_ORDER.indexOf(stage);
    if (stageIndex < currentIndex) return "done";
    if (stageIndex === currentIndex) return "current";
    return "upcoming";
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="GENERATE"
        title="Build your week"
        subtitle="We'll create lunches and dinners from your preferences — no invented macros."
      />

      {!showProgress && !error ? (
        <View style={styles.readyCard}>
          <Text style={styles.readyTitle}>You're ready</Text>
          <Text style={styles.readySubtitle}>We'll build your week around:</Text>
          {readyLines.length > 0 ? (
            readyLines.map((line) => (
              <Text key={line} style={styles.readyLine}>
                {line}
              </Text>
            ))
          ) : (
            <Text style={styles.readyLine}>Your saved preferences and nutrition target.</Text>
          )}
        </View>
      ) : null}

      {showProgress && !error ? (
        <View style={styles.stages}>
          {GENERATION_STAGE_ORDER.filter((stage) => stage !== "complete").map((stage) => {
            const status = stageStatus(stage);
            const copy = GENERATION_STAGE_COPY[stage];
            return (
              <View key={stage} style={styles.stageRow}>
                <View
                  style={[
                    styles.check,
                    status === "done" && styles.checkDone,
                    status === "current" && styles.checkCurrent,
                  ]}
                >
                  <Text style={styles.checkText}>
                    {status === "done" ? "✓" : status === "current" ? "•" : ""}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.stageLabel,
                    status === "upcoming" && styles.stageUpcoming,
                    status === "current" && styles.stageCurrent,
                  ]}
                >
                  {status === "done" ? copy.doneLabel : copy.label}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {error ? (
        <ErrorState
          title="Couldn't finish your plan"
          body={error}
          actionLabel="Try Again"
          onAction={() => {
            setError(null);
            void submit();
          }}
        />
      ) : (
        <PrimaryButton
          label={busy ? "Building…" : "Generate My Plan"}
          onPress={() => void submit()}
          loading={busy}
          disabled={busy}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  readyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  readyTitle: {
    ...typography.subheading,
    color: colors.text,
  },
  readySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  readyLine: {
    ...typography.body,
    color: colors.text,
  },
  stages: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  checkDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkCurrent: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  checkText: {
    ...typography.bodyStrong,
    color: colors.textOnDark,
    fontSize: 14,
  },
  stageLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  stageCurrent: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  stageUpcoming: {
    color: colors.textMuted,
  },
});
