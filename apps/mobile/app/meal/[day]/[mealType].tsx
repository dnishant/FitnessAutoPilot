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
  findMealSlot,
  mealDetailViewModel,
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
  const { weeklyPlan, loading } = useSession();
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

  const detail = mealDetailViewModel(meal);
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow={`${shortDayLabel(day)} · ${mealType.toUpperCase()}`}
        title={detail.title}
        subtitle={detail.prepLabel || undefined}
      />

      {detail.metaLine ? <Text style={styles.meta}>{detail.metaLine}</Text> : null}

      <SectionHeader title={detail.plateTitle} />
      <View style={styles.card}>
        {detail.components.map((component) => (
          <MealComponentRow
            key={component.componentId}
            displayName={component.name}
            portionLabel={component.portionLabel}
          />
        ))}
      </View>

      {detail.portionMessage ? (
        <View style={styles.portionStatusCard}>
          <Text style={styles.portionStatusText}>{detail.portionMessage}</Text>
        </View>
      ) : null}

      {detail.nutrition ? (
        <View style={styles.nutritionCard}>
          <Text style={styles.nutritionSectionLabel}>Nutrition</Text>
          <Text style={styles.nutritionKcal}>
            {Math.round(detail.nutrition.caloriesKcal)} kcal
          </Text>
          <View style={styles.macroRow}>
            <Text style={styles.macroLine}>
              Protein {Math.round(detail.nutrition.proteinGrams)} g
            </Text>
            <Text style={styles.macroLine}>
              Carbs {Math.round(detail.nutrition.carbsGrams)} g
            </Text>
            <Text style={styles.macroLine}>
              Fat {Math.round(detail.nutrition.fatGrams)} g
            </Text>
            {detail.nutrition.fiberGrams != null ? (
              <Text style={styles.macroLine}>
                Fiber {Math.round(detail.nutrition.fiberGrams)} g
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {detail.prepLabel ? (
        <View style={styles.prepCard}>
          <Text style={styles.prepLabel}>Preparation</Text>
          <Text style={styles.prepValue}>{detail.prepLabel}</Text>
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
                router.push(
                  `/recipe/${link.candidateId}?day=${day}&mealType=${mealType}`,
                )
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
  portionStatusCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  portionStatusText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  nutritionCard: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  nutritionSectionLabel: {
    ...typography.label,
    color: colors.textOnDarkMuted,
    textTransform: "uppercase",
  },
  nutritionKcal: {
    ...typography.subheading,
    color: colors.textOnDark,
  },
  macroRow: {
    gap: spacing.xs,
  },
  macroLine: {
    ...typography.body,
    color: colors.textOnDarkMuted,
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
