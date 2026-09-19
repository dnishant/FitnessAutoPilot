import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { DayOfWeek } from "@fitness-autopilot/contracts";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PrimaryButton,
  ScreenHeader,
} from "../../src/components/ui/primitives";
import { MealCard } from "../../src/components/ui/meals";
import {
  coreMealsSummary,
  dayOfWeekFromDate,
  formatWeekRange,
  isFlexibleDay,
  mealsForDay,
  nutritionHeaderLine,
  orderedWeekDays,
  planWeekSummaryLine,
  shortDayLabel,
} from "../../src/lib/consumer-plan-view";
import { useSession } from "../../src/state/session";
import { colors, radii, spacing, typography } from "../../src/theme/tokens";

export default function PlanTabScreen() {
  const { weeklyPlan, nutritionTarget } = useSession();
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(() => dayOfWeekFromDate());

  const days = useMemo(() => orderedWeekDays(), []);
  const { lunch, dinner } = mealsForDay(weeklyPlan, selectedDay);
  const status = weeklyPlan?.status ?? "idle";
  const nutritionLine = nutritionHeaderLine(nutritionTarget);
  const weekLabel =
    weeklyPlan?.weekStart && weeklyPlan?.weekEnd
      ? formatWeekRange(weeklyPlan.weekStart, weeklyPlan.weekEnd)
      : undefined;
  const coreMeals = useMemo(() => coreMealsSummary(weeklyPlan), [weeklyPlan]);
  const weekSummary = planWeekSummaryLine(weeklyPlan);
  const flexibleSelected = isFlexibleDay(weeklyPlan, selectedDay);

  const recipesMissingNutrition =
    status === "ready" &&
    Boolean(weeklyPlan?.meals?.length) &&
    weeklyPlan?.meals?.every((meal) => {
      const recipe = weeklyPlan.recipesByCandidateId?.[meal.candidateId];
      return !meal.personalizedNutrition && recipe?.nutrition?.source !== "llm_estimate";
    });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="PLAN"
        title="Your Week"
        subtitle={[weekLabel, nutritionLine].filter(Boolean).join(" · ") || undefined}
      />

      {recipesMissingNutrition ? (
        <View style={styles.warnCard}>
          <Text style={styles.warnTitle}>Meal macros unavailable</Text>
          <Text style={styles.warnBody}>
            This plan&apos;s recipes were resolved without llm_estimate nutrition (usually an outdated
            resolve-recipes function). Deploy resolve-recipes, then regenerate your week.
          </Text>
          <PrimaryButton label="Regenerate week" onPress={() => router.push("/generate")} />
        </View>
      ) : null}
      {status === "generating" ? (
        <View style={styles.stack}>
          <Text style={styles.statusCopy}>Building your week…</Text>
          <LoadingSkeleton rows={4} height={88} />
        </View>
      ) : null}

      {status === "failed" ? (
        <ErrorState
          title="We couldn't finish your plan"
          body={
            weeklyPlan?.errorMessage ??
            "Your preferences are saved. Try generating your week again."
          }
          actionLabel="Try Again"
          onAction={() => router.push("/generate")}
        />
      ) : null}

      {status === "idle" || (!weeklyPlan?.meals?.length && status !== "generating" && status !== "failed") ? (
        <EmptyState
          title="No week planned yet"
          body="Generate four meals that cover six days of lunches and dinners around your food and cooking preferences."
          actionLabel="Build My Plan"
          onAction={() => router.push("/generate")}
        />
      ) : null}

      {status === "ready" && weeklyPlan?.meals?.length ? (
        <View style={styles.stack}>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>YOUR WEEK</Text>
            <Text style={styles.heroTitle}>{weekSummary}</Text>
            <Text style={styles.heroBody}>
              Four meals to prepare. They cover lunch and dinner for six days. One day stays flexible.
            </Text>
          </View>

          {coreMeals.length > 0 ? (
            <View style={styles.coreStack}>
              <Text style={styles.sectionLabel}>THIS WEEK&apos;S MEALS</Text>
              {coreMeals.map((meal) => (
                <View key={meal.coreMealId} style={styles.coreRow}>
                  <Text style={styles.coreName}>{meal.name}</Text>
                  <Text style={styles.coreCount}>
                    {meal.weeklyInstanceCount} meal{meal.weeklyInstanceCount === 1 ? "" : "s"}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {weeklyPlan.mealPrepPlan?.available ? (
            <PrimaryButton
              label="Meal Prep"
              onPress={() => router.push("/meal-prep")}
            />
          ) : weeklyPlan.mealPrepPlan && !weeklyPlan.mealPrepPlan.available ? (
            <PrimaryButton
              label="Meal Prep (needs attention)"
              variant="secondary"
              onPress={() => router.push("/meal-prep")}
            />
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayRow}
          >
            {days.map((day) => {
              const selected = day === selectedDay;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedDay(day)}
                  style={[styles.dayChip, selected && styles.dayChipSelected]}
                >
                  <Text style={[styles.dayChipText, selected && styles.dayChipTextSelected]}>
                    {shortDayLabel(day)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.mealStack}>
            {flexibleSelected ? (
              <View style={styles.flexibleCard}>
                <Text style={styles.flexibleTitle}>Flexible Day</Text>
                <Text style={styles.flexibleBody}>
                  Use leftovers, eat out, or choose what works for you. No lunch or dinner is prescribed
                  for this day.
                </Text>
              </View>
            ) : (
              <>
                {lunch ? (
                  <MealCard
                    meal={lunch}
                    onPress={() => router.push(`/meal/${selectedDay}/lunch`)}
                  />
                ) : (
                  <Text style={styles.missing}>No lunch for this day.</Text>
                )}
                {dinner ? (
                  <MealCard
                    meal={dinner}
                    onPress={() => router.push(`/meal/${selectedDay}/dinner`)}
                  />
                ) : (
                  <Text style={styles.missing}>No dinner for this day.</Text>
                )}
              </>
            )}
          </View>

          <PrimaryButton
            label="Regenerate week"
            variant="secondary"
            onPress={() => router.push("/generate")}
          />
        </View>
      ) : null}
    </ScrollView>
  );
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
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroEyebrow: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  heroTitle: {
    ...typography.title,
    color: colors.text,
  },
  heroBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  coreStack: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  coreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  coreName: {
    ...typography.bodyStrong,
    color: colors.text,
    flex: 1,
    paddingRight: spacing.md,
  },
  coreCount: {
    ...typography.body,
    color: colors.textSecondary,
  },
  warnCard: {
    backgroundColor: "#F8E8D8",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#E0C4A8",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  warnTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  warnBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  statusCopy: {
    ...typography.body,
    color: colors.textSecondary,
  },
  dayRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dayChip: {
    minWidth: 48,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
  },
  dayChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayChipText: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  dayChipTextSelected: {
    color: colors.textOnDark,
  },
  mealStack: {
    gap: spacing.md,
  },
  flexibleCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  flexibleTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  flexibleBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  missing: {
    ...typography.body,
    color: colors.textMuted,
  },
});
