import { Pressable, StyleSheet, Text, View } from "react-native";
import type {
  ConsumerMealSlot,
  PersonalizedMealNutrition,
} from "@fitness-autopilot/contracts";
import { colors, radii, spacing, typography } from "../../theme/tokens";
import { consumerPrepLabel } from "../../lib/consumer-plan-view";

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
  const mainName = props.meal.name;
  const componentNames = props.meal.components
    .filter((c) => c.displayName !== mainName)
    .map((c) =>
      c.displayName
        .split(" ")
        .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
        .join(" "),
    );
  const prep = consumerPrepLabel(props.meal.prepIntent, props.meal.finishTimeMinutes);
  const nutrition = props.personalizedNutrition ?? props.meal.personalizedNutrition;

  const content = (
    <View style={styles.mealCard}>
      <Text style={styles.mealType}>{props.meal.mealType.toUpperCase()}</Text>
      <Text style={styles.mealName}>{mainName}</Text>
      {componentNames.length > 0 ? (
        <View style={styles.componentList}>
          {componentNames.map((name) => (
            <Text key={name} style={styles.componentLine}>
              {name}
            </Text>
          ))}
        </View>
      ) : null}
      {prep ? <Text style={styles.prepMeta}>{prep}</Text> : null}
      {nutrition ? (
        <Text style={styles.nutritionMeta}>
          {Math.round(nutrition.caloriesKcal)} kcal · {Math.round(nutrition.proteinGrams)}g protein
        </Text>
      ) : null}
    </View>
  );

  if (!props.onPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.meal.mealType}: ${mainName}`}
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
  adjustable?: boolean;
  onDecrease?: () => void;
  onIncrease?: () => void;
  hint?: string;
}) {
  return (
    <View style={styles.componentRowWrap}>
      <View style={styles.componentRow}>
        <Text style={styles.componentRowName}>{props.displayName}</Text>
        {props.adjustable && props.amount != null && props.unit ? (
          <View style={styles.adjustRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Decrease ${props.displayName}`}
              onPress={props.onDecrease}
              style={styles.adjustButton}
            >
              <Text style={styles.adjustButtonText}>−</Text>
            </Pressable>
            <Text style={styles.componentRowAmount}>
              {props.amount} {props.unit}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Increase ${props.displayName}`}
              onPress={props.onIncrease}
              style={styles.adjustButton}
            >
              <Text style={styles.adjustButtonText}>+</Text>
            </Pressable>
          </View>
        ) : props.amount != null && props.unit ? (
          <Text style={styles.componentRowAmount}>
            {props.amount} {props.unit}
          </Text>
        ) : null}
      </View>
      {props.hint ? <Text style={styles.componentHint}>{props.hint}</Text> : null}
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
  prepMeta: {
    ...typography.caption,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  nutritionMeta: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  componentRowWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  componentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
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
  adjustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  adjustButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  adjustButtonText: {
    ...typography.bodyStrong,
    color: colors.text,
    fontSize: 18,
    lineHeight: 20,
  },
  componentHint: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingBottom: spacing.sm,
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
