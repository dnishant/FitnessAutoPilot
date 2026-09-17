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
  const params = useLocalSearchParams<{ candidateId: string }>();
  const { weeklyPlan, loading } = useSession();
  const candidateId = Array.isArray(params.candidateId)
    ? params.candidateId[0]
    : params.candidateId;

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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="RECIPE"
        title={recipe.name}
        subtitle={recipe.description}
      />

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
