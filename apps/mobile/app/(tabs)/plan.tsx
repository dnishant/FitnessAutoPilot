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
  dayOfWeekFromDate,
  formatWeekRange,
  mealsForDay,
  nutritionHeaderLine,
  orderedWeekDays,
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="PLAN"
        title="Your Week"
        subtitle={[weekLabel, nutritionLine].filter(Boolean).join(" · ") || undefined}
      />

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
          body="Generate lunches and dinners for the week around your food and cooking preferences."
          actionLabel="Build My Plan"
          onAction={() => router.push("/generate")}
        />
      ) : null}

      {status === "ready" && weeklyPlan?.meals?.length ? (
        <View style={styles.stack}>
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
  missing: {
    ...typography.body,
    color: colors.textMuted,
  },
});
