import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  onboardingGoalLabel,
  type OnboardingGoalType,
} from "@fitness-autopilot/contracts";
import {
  calorieTargetPaceLabel,
  formatTargetCaloriesPerDay,
} from "@fitness-autopilot/domain";
import { PrimaryButton, ScreenHeader, SectionHeader } from "../../src/components/ui/primitives";
import { NutritionSummary } from "../../src/components/ui/meals";
import {
  cookingSummaryLines,
  preferenceSummaryLine,
} from "../../src/lib/consumer-plan-view";
import { useSession } from "../../src/state/session";
import { colors, radii, spacing, typography } from "../../src/theme/tokens";

export default function YouTabScreen() {
  const {
    goal,
    nutritionTarget,
    currentCalorieTarget,
    mealPreferences,
    cookingPreferences,
    weeklyPlan,
    useLocalMode,
    refreshWeeklyPlanFromCloud,
    signOut,
  } = useSession();
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  const goalType =
    goal &&
    (goal.goalType === "muscle_gain" ||
      goal.goalType === "fat_loss" ||
      goal.goalType === "recomposition")
      ? (goal.goalType as OnboardingGoalType)
      : null;

  const showDeveloper = __DEV__ || useLocalMode;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="YOU"
        title="Your profile"
        subtitle="Goals, nutrition, and preferences saved to your account."
      />

      <View style={styles.section}>
        <SectionHeader title="Your Goal" actionLabel="Edit" onAction={() => router.push("/goal")} />
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {goalType ? onboardingGoalLabel(goalType) : goal?.goalType?.replace(/_/g, " ") ?? "Not set"}
          </Text>
          {currentCalorieTarget ? (
            <Text style={styles.cardBody}>
              {calorieTargetPaceLabel(currentCalorieTarget.pace)} ·{" "}
              {formatTargetCaloriesPerDay(currentCalorieTarget.targetCalories)}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Nutrition Targets" />
        {nutritionTarget ? (
          <NutritionSummary
            calories={nutritionTarget.targetCalories}
            proteinG={nutritionTarget.proteinG}
            carbsG={nutritionTarget.carbohydrateG}
            fatG={nutritionTarget.fatG ?? nutritionTarget.fatMinG}
            fiberG={nutritionTarget.fiberG}
            compact
          />
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardBody}>Complete onboarding to set your daily target.</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Food Preferences"
          actionLabel="Edit"
          onAction={() => router.push("/preferences")}
        />
        <View style={styles.card}>
          <Text style={styles.cardBody}>{preferenceSummaryLine(mealPreferences)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Cooking & Meal Prep"
          actionLabel="Edit"
          onAction={() => router.push("/cooking-preferences")}
        />
        <View style={styles.card}>
          {cookingSummaryLines(cookingPreferences).map((line) => (
            <Text key={line} style={styles.cardBody}>
              {line}
            </Text>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Weekly plan" />
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {weeklyPlan?.status === "ready"
              ? weeklyPlan.generatedPlanId ?? "Ready"
              : weeklyPlan?.status === "generating"
                ? "Generating…"
                : weeklyPlan?.status === "failed"
                  ? "Last generation failed"
                  : "No plan loaded"}
          </Text>
          {weeklyPlan?.weekStart ? (
            <Text style={styles.cardBody}>
              Week {weeklyPlan.weekStart} → {weeklyPlan.weekEnd}
              {weeklyPlan.meals?.length
                ? ` · ${weeklyPlan.meals.length} meals`
                : ""}
            </Text>
          ) : (
            <Text style={styles.cardBody}>
              {useLocalMode
                ? "Local mode stores the plan on this device only."
                : "Generate a plan to save it to your account, or reload from cloud."}
            </Text>
          )}
          {cloudMessage ? <Text style={styles.cardBody}>{cloudMessage}</Text> : null}
          {!useLocalMode ? (
            <PrimaryButton
              label={cloudBusy ? "Loading…" : "Reload plan from cloud"}
              variant="secondary"
              onPress={async () => {
                setCloudBusy(true);
                setCloudMessage(null);
                const result = await refreshWeeklyPlanFromCloud();
                setCloudBusy(false);
                if (!result.ok) {
                  setCloudMessage(result.error);
                  return;
                }
                setCloudMessage(
                  result.plan
                    ? `Loaded ${result.plan.generatedPlanId ?? "plan"} from Supabase.`
                    : "No ready weekly plan found in Supabase yet. Generate one while signed in.",
                );
              }}
            />
          ) : null}
        </View>
      </View>

      {/* CATALOG-001: always reachable on hosted PR preview (not consumer primary nav). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Protein Catalog verification"
        style={styles.devLink}
        onPress={() => router.push("/catalog/proteins")}
      >
        <Text style={styles.devLinkText}>Protein Catalog (internal)</Text>
      </Pressable>

      {showDeveloper ? (
        <Pressable
          accessibilityRole="button"
          style={styles.devLink}
          onPress={() => router.push("/developer")}
        >
          <Text style={styles.devLinkText}>Developer tools</Text>
        </Pressable>
      ) : null}

      <PrimaryButton
        label="Sign out"
        variant="secondary"
        onPress={async () => {
          await signOut();
          router.replace("/auth");
        }}
      />
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
  section: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.subheading,
    color: colors.text,
    textTransform: "capitalize",
  },
  cardBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  devLink: {
    paddingVertical: spacing.sm,
  },
  devLinkText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
});
