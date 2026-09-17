import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { DayOfWeek } from "@fitness-autopilot/contracts";
import { DayOfWeekSchema } from "@fitness-autopilot/contracts";
import {
  EmptyState,
  LoadingSkeleton,
  ScreenHeader,
  SectionHeader,
} from "../../src/components/ui/primitives";
import { RecipeIngredientRow, RecipeStep } from "../../src/components/ui/meals";
import {
  findMealSlot,
  recipeYourPortionFromMeal,
} from "../../src/lib/consumer-plan-view";
import { useSession } from "../../src/state/session";
import { colors, radii, spacing, typography } from "../../src/theme/tokens";

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

export default function RecipeDetailScreen() {
  const params = useLocalSearchParams<{
    candidateId: string;
    day?: string;
    mealType?: string;
  }>();
  const { weeklyPlan, loading } = useSession();
  const candidateId = Array.isArray(params.candidateId)
    ? params.candidateId[0]
    : params.candidateId;
  const day = parseDay(params.day);
  const mealType = parseMealType(params.mealType);

  if (loading) {
    return (
      <View style={styles.container}>
        <LoadingSkeleton rows={5} />
      </View>
    );
  }

  const recipe =
    candidateId && weeklyPlan?.recipesByCandidateId
      ? weeklyPlan.recipesByCandidateId[candidateId]
      : undefined;

  if (!recipe || !candidateId) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Recipe not available"
          body="This recipe isn't on your current week plan."
          actionLabel="Back to plan"
          onAction={() => router.replace("/(tabs)/plan")}
        />
      </View>
    );
  }

  const mealContext =
    day && mealType ? findMealSlot(weeklyPlan, day, mealType) : null;
  const yourPortion =
    mealContext != null
      ? recipeYourPortionFromMeal({
          meal: mealContext,
          recipeCandidateId: candidateId,
        })
      : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="RECIPE"
        title={recipe.name}
        subtitle={recipe.description}
      />

      {yourPortion ? (
        <View style={styles.yourPortionCard}>
          <Text style={styles.yourPortionLabel}>Your portion</Text>
          <Text style={styles.yourPortionValue}>{yourPortion.label}</Text>
        </View>
      ) : null}

      <View style={styles.metaRow}>
        <MetaStat label="Prep" value={`${recipe.prepTimeMinutes} min`} />
        <MetaStat label="Cook" value={`${recipe.cookTimeMinutes} min`} />
        <MetaStat label="Reference" value={`${recipe.baseServings} servings`} />
      </View>
      <Text style={styles.servingsNote}>
        Serving count is the reference recipe yield — not your personalized meal portion.
      </Text>

      <SectionHeader title="Ingredients" />
      <View style={styles.card}>
        {recipe.ingredients.map((ingredient) => (
          <RecipeIngredientRow
            key={ingredient.ingredientId}
            name={ingredient.name}
            quantity={ingredient.quantity}
            unit={ingredient.unit}
            preparation={ingredient.preparation}
          />
        ))}
      </View>

      <SectionHeader title="Steps" />
      <View style={styles.steps}>
        {recipe.instructions.map((step) => (
          <RecipeStep key={step.stepNumber} stepNumber={step.stepNumber} text={step.text} />
        ))}
      </View>
    </ScrollView>
  );
}

function MetaStat(props: { label: string; value: string }) {
  return (
    <View style={styles.metaStat}>
      <Text style={styles.metaLabel}>{props.label}</Text>
      <Text style={styles.metaValue}>{props.value}</Text>
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
  yourPortionCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  yourPortionLabel: {
    ...typography.label,
    color: colors.primary,
    textTransform: "uppercase",
  },
  yourPortionValue: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  metaRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  metaStat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  metaLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  metaValue: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  servingsNote: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  steps: {
    gap: spacing.sm,
  },
});
