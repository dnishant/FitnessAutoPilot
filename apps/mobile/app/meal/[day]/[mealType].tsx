import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { DayOfWeek } from "@fitness-autopilot/contracts";
import { DayOfWeekSchema } from "@fitness-autopilot/contracts";
import {
  EmptyState,
  LoadingSkeleton,
  ScreenHeader,
  SectionHeader,
} from "../../../src/components/ui/primitives";
import { MealComponentRow } from "../../../src/components/ui/meals";
import {
  consumerPrepLabel,
  findMealSlot,
  shortDayLabel,
} from "../../../src/lib/consumer-plan-view";
import { useSession } from "../../../src/state/session";
import { colors, radii, spacing, typography } from "../../../src/theme/tokens";

const MEAL_TYPES = ["lunch", "dinner"] as const;

function parseDay(value: string | string[] | undefined): DayOfWeek | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = DayOfWeekSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parseMealType(value: string | string[] | undefined): "lunch" | "dinner" | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return MEAL_TYPES.includes(raw as "lunch" | "dinner") ? (raw as "lunch" | "dinner") : null;
}

export default function MealDetailScreen() {
  const params = useLocalSearchParams<{ day: string; mealType: string }>();
  const { weeklyPlan, loading, adjustDiscreteMealComponent } = useSession();
  const day = parseDay(params.day);
  const mealType = parseMealType(params.mealType);

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingSkeleton rows={4} />
      </View>
    );
  }

  if (!day || !mealType) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Meal not found"
          body="That meal link looks incomplete."
          actionLabel="Back to plan"
          onAction={() => router.replace("/(tabs)/plan")}
        />
      </View>
    );
  }

  const meal = findMealSlot(weeklyPlan, day, mealType);
  if (!meal) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Meal not available"
          body="This meal isn't on your current week plan."
          actionLabel="Back to plan"
          onAction={() => router.replace("/(tabs)/plan")}
        />
      </View>
    );
  }

  const prep = consumerPrepLabel(meal.prepIntent, meal.finishTimeMinutes);
  const nutrition = meal.personalizedNutrition;
  const blocked = meal.personalizationStatus === "blocked";
  const hasPortions = meal.components.some((c) => c.amount != null && c.unit);
  const recipesById = weeklyPlan?.recipesByCandidateId ?? {};
  const recipeLinks: Array<{ candidateId: string; name: string }> = [];
  if (recipesById[meal.candidateId]) {
    recipeLinks.push({
      candidateId: meal.candidateId,
      name: recipesById[meal.candidateId]!.name,
    });
  }
  for (const component of meal.components) {
    const recipe = recipesById[component.componentId];
    if (recipe && !recipeLinks.some((link) => link.candidateId === component.componentId)) {
      recipeLinks.push({ candidateId: component.componentId, name: recipe.name });
    }
  }

  async function nudgeDiscrete(componentId: string, delta: number) {
    const current = meal!.components.find((c) => c.componentId === componentId);
    if (!current?.amount || !current.adjustableDiscrete) return;
    const step = current.quantityStep ?? 1;
    await adjustDiscreteMealComponent({
      day: day!,
      mealType: mealType!,
      componentId,
      amount: current.amount + delta * step,
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow={`${shortDayLabel(day)} · ${mealType.toUpperCase()}`}
        title={meal.name}
        subtitle={prep || undefined}
      />

      {meal.cuisineFamily || meal.flavorTags?.length || meal.experienceTags?.length ? (
        <Text style={styles.meta}>
          {[meal.cuisineFamily, ...(meal.flavorTags ?? []), ...(meal.experienceTags ?? [])]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      ) : null}

      <SectionHeader title="Your plate" />
      {blocked && !hasPortions ? (
        <View style={styles.blockedCard}>
          <Text style={styles.blockedTitle}>Portions unavailable</Text>
          <Text style={styles.blockedBody}>
            We couldn&apos;t personalize this meal yet. The plate composition is still available
            below — try regenerating your plan.
          </Text>
        </View>
      ) : null}
      <View style={styles.card}>
        {meal.components.map((component) => (
          <MealComponentRow
            key={component.componentId}
            displayName={component.displayName}
            amount={component.amount}
            unit={component.unit}
            adjustable={Boolean(component.adjustableDiscrete && component.amount != null)}
            onDecrease={() => void nudgeDiscrete(component.componentId, -1)}
            onIncrease={() => void nudgeDiscrete(component.componentId, 1)}
            hint={
              component.adjustableDiscrete
                ? component.usedStapleEstimate
                  ? "Approximate count · you can adjust"
                  : "You can adjust this count"
                : undefined
            }
          />
        ))}
      </View>

      {nutrition ? (
        <View style={styles.nutritionCard}>
          <SectionHeader title="Nutrition" />
          <Text style={styles.calories}>{Math.round(nutrition.caloriesKcal)} kcal</Text>
          <View style={styles.macroGrid}>
            <MacroLine label="Protein" value={`${Math.round(nutrition.proteinGrams)} g`} />
            <MacroLine label="Carbs" value={`${Math.round(nutrition.carbsGrams)} g`} />
            <MacroLine label="Fat" value={`${Math.round(nutrition.fatGrams)} g`} />
            {nutrition.fiberGrams != null ? (
              <MacroLine label="Fiber" value={`${Math.round(nutrition.fiberGrams)} g`} />
            ) : null}
          </View>
        </View>
      ) : null}

      {prep ? (
        <View style={styles.prepCard}>
          <Text style={styles.prepLabel}>Preparation</Text>
          <Text style={styles.prepValue}>{prep}</Text>
        </View>
      ) : null}

      {recipeLinks.length > 0 ? (
        <View style={styles.stack}>
          <SectionHeader title="Recipes" />
          {recipeLinks.map((link) => (
            <Pressable
              key={link.candidateId}
              accessibilityRole="button"
              style={styles.recipeLink}
              onPress={() =>
                router.push({
                  pathname: `/recipe/${link.candidateId}`,
                  params: { day, mealType },
                })
              }
            >
              <Text style={styles.recipeLinkTitle}>{link.name}</Text>
              <Text style={styles.recipeLinkAction}>View recipe →</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function MacroLine(props: { label: string; value: string }) {
  return (
    <View style={styles.macroLine}>
      <Text style={styles.macroLabel}>{props.label}</Text>
      <Text style={styles.macroValue}>{props.value}</Text>
    </View>
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
  meta: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: -spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  nutritionCard: {
    gap: spacing.sm,
  },
  calories: {
    ...typography.title,
    color: colors.text,
  },
  macroGrid: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  macroLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  macroLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  macroValue: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  blockedCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  blockedTitle: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  blockedBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  prepCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  prepLabel: {
    ...typography.label,
    color: colors.primary,
    textTransform: "uppercase",
  },
  prepValue: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  stack: {
    gap: spacing.md,
  },
  recipeLink: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  recipeLinkTitle: {
    ...typography.subheading,
    color: colors.text,
  },
  recipeLinkAction: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
});
