import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  EmptyState,
  LoadingSkeleton,
  ScreenHeader,
  SectionHeader,
} from "../../src/components/ui/primitives";
import { RecipeIngredientRow, RecipeStep } from "../../src/components/ui/meals";
import { useSession } from "../../src/state/session";
import { colors, radii, spacing, typography } from "../../src/theme/tokens";

export default function RecipeDetailScreen() {
  const params = useLocalSearchParams<{ candidateId: string; day?: string; mealType?: string }>();
  const { weeklyPlan, loading } = useSession();
  const candidateId = Array.isArray(params.candidateId)
    ? params.candidateId[0]
    : params.candidateId;
  const day = Array.isArray(params.day) ? params.day[0] : params.day;
  const mealType = Array.isArray(params.mealType) ? params.mealType[0] : params.mealType;

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

  if (!recipe) {
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

  const personalizedPortion =
    day && mealType && weeklyPlan?.meals
      ? weeklyPlan.meals
          .find((m) => m.day === day && m.mealType === mealType)
          ?.components.find(
            (c) =>
              c.componentId === candidateId ||
              c.role === "main" ||
              c.displayName.toLowerCase() === recipe.name.toLowerCase(),
          )
      : undefined;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="RECIPE"
        title={recipe.name}
        subtitle={recipe.description}
      />

      {personalizedPortion?.amount != null && personalizedPortion.unit ? (
        <View style={styles.portionCard}>
          <Text style={styles.portionLabel}>Your portion</Text>
          <Text style={styles.portionValue}>
            {personalizedPortion.amount} {personalizedPortion.unit} prepared {recipe.name}
          </Text>
        </View>
      ) : null}

      <View style={styles.metaRow}>
        <MetaStat label="Prep" value={`${recipe.prepTimeMinutes} min`} />
        <MetaStat label="Cook" value={`${recipe.cookTimeMinutes} min`} />
        <MetaStat label="Reference" value={`${recipe.baseServings} servings`} />
      </View>
      <Text style={styles.servingsNote}>
        Recipe batch below is the reference yield — not rewritten as one personalized meal.
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
  portionCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  portionLabel: {
    ...typography.label,
    color: colors.primary,
    textTransform: "uppercase",
  },
  portionValue: {
    ...typography.bodyStrong,
    color: colors.text,
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
