import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  ingredientQuantityForServings,
  macrosForServings,
} from "@fitness-autopilot/domain";
import {
  EmptyState,
  LoadingSkeleton,
  ScreenHeader,
  SectionHeader,
} from "../../src/components/ui/primitives";
import { RecipeIngredientRow, RecipeStep } from "../../src/components/ui/meals";
import { useSession } from "../../src/state/session";
import { colors, radii, spacing, typography } from "../../src/theme/tokens";

type IngredientViewMode = "batch" | "portion";

function formatMacroLine(input: {
  caloriesKcal: number;
  proteinGrams: number;
  carbohydrateGrams?: number;
  carbsGrams?: number;
  fatGrams: number;
}): string {
  const carbs = input.carbohydrateGrams ?? input.carbsGrams ?? 0;
  return `${Math.round(input.caloriesKcal)} kcal · ${Math.round(input.proteinGrams)}g P · ${Math.round(carbs)}g C · ${Math.round(input.fatGrams)}g F`;
}

export default function RecipeDetailScreen() {
  const params = useLocalSearchParams<{ candidateId: string; day?: string; mealType?: string }>();
  const { weeklyPlan, loading } = useSession();
  const [ingredientView, setIngredientView] = useState<IngredientViewMode>("batch");
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

  const mealSlot =
    day && mealType && weeklyPlan?.meals
      ? weeklyPlan.meals.find((m) => m.day === day && m.mealType === mealType)
      : undefined;

  const personalServings =
    mealSlot?.personalServings ??
    mealSlot?.components.find((c) => c.role === "main" || c.unit === "servings" || c.unit === "serving")
      ?.amount;

  const perServing = recipe.nutrition?.perServing;
  const yourMacros =
    personalServings != null && recipe.nutrition
      ? macrosForServings(recipe, personalServings)
      : mealSlot?.personalizedNutrition
        ? {
            caloriesKcal: mealSlot.personalizedNutrition.caloriesKcal,
            proteinGrams: mealSlot.personalizedNutrition.proteinGrams,
            carbohydrateGrams: mealSlot.personalizedNutrition.carbsGrams,
            fatGrams: mealSlot.personalizedNutrition.fatGrams,
          }
        : null;

  const showPortionIngredients =
    ingredientView === "portion" && personalServings != null && personalServings > 0;

  const cuisine = recipe.flavorProfile.cuisineFamily;
  const mealTypeLabel = mealSlot?.mealType;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="RECIPE"
        title={recipe.name}
        subtitle={[cuisine, mealTypeLabel].filter(Boolean).join(" · ") || recipe.description}
      />

      {perServing ? (
        <View style={styles.nutritionCard}>
          <Text style={styles.nutritionLabel}>Per serving</Text>
          <Text style={styles.nutritionPrimary}>{Math.round(perServing.caloriesKcal)} kcal</Text>
          <Text style={styles.nutritionMacros}>
            {Math.round(perServing.proteinGrams)}g protein ·{" "}
            {Math.round(perServing.carbohydrateGrams)}g carbs ·{" "}
            {Math.round(perServing.fatGrams)}g fat
          </Text>
          <Text style={styles.estimatedLabel}>Estimated nutrition</Text>
        </View>
      ) : null}

      {yourMacros && personalServings != null ? (
        <View style={styles.portionCard}>
          <Text style={styles.portionLabel}>Your portion</Text>
          <Text style={styles.portionValue}>
            {Number(personalServings.toFixed(2))} servings
          </Text>
          <Text style={styles.portionMacros}>{formatMacroLine(yourMacros)}</Text>
        </View>
      ) : null}

      {__DEV__ && recipe.nutrition && personalServings != null ? (
        <Text style={styles.devDiagnostics}>
          Recipe: serves {recipe.baseServings} · {Math.round(recipe.nutrition.total.caloriesKcal)} kcal
          total · {Math.round(recipe.nutrition.perServing.caloriesKcal)} kcal/serving
          {"\n"}
          Plan: {personalServings} servings · Meal: {Math.round(yourMacros?.caloriesKcal ?? 0)} kcal
        </Text>
      ) : null}

      <View style={styles.metaRow}>
        <MetaStat label="Prep" value={`${recipe.prepTimeMinutes} min`} />
        <MetaStat label="Cook" value={`${recipe.cookTimeMinutes} min`} />
        <MetaStat label="Batch" value={`${recipe.baseServings} servings`} />
      </View>

      <SectionHeader title="Ingredients" />
      {personalServings != null ? (
        <View style={styles.toggleRow}>
          <ToggleChip
            label="Full recipe"
            active={!showPortionIngredients}
            onPress={() => setIngredientView("batch")}
          />
          <ToggleChip
            label="Your portion"
            active={showPortionIngredients}
            onPress={() => setIngredientView("portion")}
          />
        </View>
      ) : null}

      <Text style={styles.servingsNote}>
        {showPortionIngredients
          ? `${Number(personalServings!.toFixed(2))} servings (your quantities)`
          : `Makes ${recipe.baseServings} servings`}
      </Text>

      <View style={styles.card}>
        {recipe.ingredients.map((ingredient) => {
          const scaled = showPortionIngredients
            ? ingredientQuantityForServings(
                ingredient,
                recipe.baseServings,
                personalServings!,
              )
            : null;
          const quantity = scaled?.calculatedQuantity ?? ingredient.quantity;
          const displayQty =
            Math.abs(quantity - Math.round(quantity)) < 0.05
              ? Math.round(quantity)
              : Number(quantity.toFixed(2));
          return (
            <RecipeIngredientRow
              key={ingredient.ingredientId}
              name={ingredient.name}
              quantity={displayQty}
              unit={ingredient.unit}
              preparation={ingredient.preparation}
            />
          );
        })}
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

function ToggleChip(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={[styles.toggleChip, props.active && styles.toggleChipActive]}
    >
      <Text style={[styles.toggleChipText, props.active && styles.toggleChipTextActive]}>
        {props.label}
      </Text>
    </Pressable>
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
  nutritionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  nutritionLabel: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  nutritionPrimary: {
    ...typography.title,
    color: colors.text,
  },
  nutritionMacros: {
    ...typography.body,
    color: colors.text,
  },
  estimatedLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
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
  portionMacros: {
    ...typography.body,
    color: colors.text,
  },
  devDiagnostics: {
    ...typography.caption,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  toggleRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  toggleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toggleChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  toggleChipText: {
    ...typography.label,
    color: colors.textMuted,
  },
  toggleChipTextActive: {
    color: colors.primary,
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
