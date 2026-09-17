import { Pressable, StyleSheet, Text, View } from "react-native";
import type {
  ConsumerMealSlot,
  PersonalizedMealNutrition,
} from "@fitness-autopilot/contracts";
import { colors, radii, spacing, typography } from "../../theme/tokens";
import {
  formatPortionDisplay,
  mealCardDisplayModel,
} from "../../lib/consumer-plan-view";

export function NutritionSummary(props: {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  paceLabel?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.nutritionCard, props.compact && styles.nutritionCompact]}>
      {props.paceLabel ? <Text style={styles.pace}>{props.paceLabel}</Text> : null}
      <Text style={styles.calories}>{Math.round(props.calories).toLocaleString()}</Text>
      <Text style={styles.caloriesUnit}>calories / day</Text>
      <View style={styles.macroRow}>
        <MacroStat label="Protein" value={`${Math.round(props.proteinG)}g`} />
        <MacroStat label="Carbs" value={`${Math.round(props.carbsG)}g`} />
        <MacroStat label="Fat" value={`${Math.round(props.fatG)}g`} />
      </View>
      {props.fiberG != null ? (
        <Text style={styles.fiber}>{Math.round(props.fiberG)}g Fiber</Text>
      ) : null}
    </View>
  );
}

function MacroStat(props: { label: string; value: string }) {
  return (
    <View style={styles.macroStat}>
      <Text style={styles.macroValue}>{props.value}</Text>
      <Text style={styles.macroLabel}>{props.label}</Text>
    </View>
  );
}

export function MealCard(props: {
  meal: ConsumerMealSlot;
  onPress?: () => void;
  personalizedNutrition?: PersonalizedMealNutrition | null;
}) {
  const model = mealCardDisplayModel(props.meal);
  const nutritionLine =
    props.personalizedNutrition != null
      ? `${Math.round(props.personalizedNutrition.caloriesKcal)} kcal · ${Math.round(props.personalizedNutrition.proteinGrams)}g protein`
      : model.nutritionLine;

  const content = (
    <View style={styles.mealCard}>
      <Text style={styles.mealType}>{model.mealTypeLabel}</Text>
      <Text style={styles.mealName}>{model.name}</Text>
      {model.componentNames.length > 0 ? (
        <View style={styles.componentList}>
          {model.componentNames.map((name) => (
            <Text key={name} style={styles.componentLine}>
              {name}
            </Text>
          ))}
        </View>
      ) : null}
      {nutritionLine ? <Text style={styles.nutritionMeta}>{nutritionLine}</Text> : null}
      {model.prepLabel ? <Text style={styles.prepMeta}>{model.prepLabel}</Text> : null}
    </View>
  );

  if (!props.onPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.meal.mealType}: ${model.name}`}
      onPress={props.onPress}
    >
      {content}
    </Pressable>
  );
}

export function MealComponentRow(props: {
  displayName: string;
  amount?: number;
  unit?: string;
  portionLabel?: string | null;
}) {
  const amountLabel =
    props.portionLabel ??
    (props.amount != null && props.unit
      ? formatPortionDisplay(props.amount, props.unit)
      : null);

  return (
    <View style={styles.componentRow}>
      <Text style={styles.componentRowName}>{props.displayName}</Text>
      {amountLabel ? <Text style={styles.componentRowAmount}>{amountLabel}</Text> : null}
    </View>
  );
}

export function RecipeIngredientRow(props: {
  name: string;
  quantity?: number;
  unit?: string;
  preparation?: string | null;
  checked?: boolean;
  onToggle?: () => void;
}) {
  const quantity =
    props.quantity != null && props.unit
      ? `${props.quantity} ${props.unit}`
      : props.quantity != null
        ? String(props.quantity)
        : null;
  const detail = [quantity, props.preparation].filter(Boolean).join(" · ");

  if (props.onToggle) {
    return (
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: props.checked === true }}
        accessibilityLabel={props.name}
        onPress={props.onToggle}
        style={styles.ingredientRow}
      >
        <View style={[styles.checkbox, props.checked && styles.checkboxChecked]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.ingredientName, props.checked && styles.checkedText]}>
            {props.name}
          </Text>
          {detail ? <Text style={styles.ingredientDetail}>{detail}</Text> : null}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.ingredientRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.ingredientName}>{props.name}</Text>
        {detail ? <Text style={styles.ingredientDetail}>{detail}</Text> : null}
      </View>
    </View>
  );
}

export function RecipeStep(props: { stepNumber: number; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepNumber}>{props.stepNumber}</Text>
      </View>
      <Text style={styles.stepText}>{props.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  nutritionCard: {
    backgroundColor: colors.surfaceDark,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  nutritionCompact: {
    padding: spacing.lg,
  },
  pace: {
    ...typography.caption,
    color: colors.textOnDarkMuted,
  },
  calories: {
    ...typography.metric,
    color: colors.textOnDark,
  },
  caloriesUnit: {
    ...typography.body,
    color: colors.textOnDarkMuted,
    marginTop: -spacing.sm,
  },
  macroRow: {
    flexDirection: "row",
    marginTop: spacing.md,
    gap: spacing.lg,
  },
  macroStat: {
    flex: 1,
    gap: 2,
  },
  macroValue: {
    ...typography.subheading,
    color: colors.textOnDark,
  },
  macroLabel: {
    ...typography.caption,
    color: colors.textOnDarkMuted,
  },
  fiber: {
    ...typography.bodyStrong,
    color: colors.textOnDark,
    marginTop: spacing.sm,
  },
  mealCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealType: {
    ...typography.label,
    color: colors.textMuted,
  },
  mealName: {
    ...typography.heading,
    color: colors.text,
  },
  componentList: {
    marginTop: spacing.xs,
    gap: 2,
  },
  componentLine: {
    ...typography.body,
    color: colors.textSecondary,
  },
  nutritionMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  prepMeta: {
    ...typography.caption,
    color: colors.primary,
    marginTop: spacing.xs,
  },
  componentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  componentRowName: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  componentRowAmount: {
    ...typography.bodyStrong,
    color: colors.textSecondary,
  },
  ingredientRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  ingredientName: {
    ...typography.body,
    color: colors.text,
  },
  ingredientDetail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  checkedText: {
    textDecorationLine: "line-through",
    color: colors.textMuted,
  },
  stepRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  stepText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
});
