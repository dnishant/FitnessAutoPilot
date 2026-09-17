import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { EmptyState, ScreenHeader, SectionHeader } from "../../src/components/ui/primitives";
import { MealCard, NutritionSummary } from "../../src/components/ui/meals";
import {
  dayOfWeekFromDate,
  formatLongDay,
  greetingForNow,
  mealsForDay,
} from "../../src/lib/consumer-plan-view";
import { useSession } from "../../src/state/session";
import { colors, spacing, typography } from "../../src/theme/tokens";

export default function TodayTabScreen() {
  const { weeklyPlan, nutritionTarget } = useSession();
  const today = dayOfWeekFromDate();
  const planReady = weeklyPlan?.status === "ready" && Boolean(weeklyPlan.meals?.length);
  const { lunch, dinner } = mealsForDay(weeklyPlan, today);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="TODAY"
        title={greetingForNow()}
        subtitle={formatLongDay()}
      />

      {!planReady ? (
        <EmptyState
          title="Your week isn't planned yet"
          body="Build a calm week of lunches and dinners around your preferences and nutrition target."
          actionLabel="Build My Plan"
          onAction={() => router.push("/generate")}
        />
      ) : (
        <View style={styles.content}>
          {nutritionTarget ? (
            <NutritionSummary
              calories={nutritionTarget.targetCalories}
              proteinG={nutritionTarget.proteinG}
              carbsG={nutritionTarget.carbohydrateG}
              fatG={nutritionTarget.fatG ?? nutritionTarget.fatMinG}
              fiberG={nutritionTarget.fiberG}
              compact
            />
          ) : null}

          <SectionHeader
            title="Today's meals"
            actionLabel="Full week"
            onAction={() => router.push("/(tabs)/plan")}
          />

          <View style={styles.mealStack}>
            {lunch ? (
              <MealCard
                meal={lunch}
                onPress={() => router.push(`/meal/${today}/lunch`)}
              />
            ) : (
              <Text style={styles.missing}>No lunch planned for today.</Text>
            )}
            {dinner ? (
              <MealCard
                meal={dinner}
                onPress={() => router.push(`/meal/${today}/dinner`)}
              />
            ) : (
              <Text style={styles.missing}>No dinner planned for today.</Text>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(tabs)/plan")}
            style={styles.planLink}
          >
            <Text style={styles.planLinkText}>See your week →</Text>
          </Pressable>
        </View>
      )}
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
  content: {
    gap: spacing.lg,
  },
  mealStack: {
    gap: spacing.md,
  },
  missing: {
    ...typography.body,
    color: colors.textMuted,
  },
  planLink: {
    paddingVertical: spacing.sm,
  },
  planLinkText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
});
