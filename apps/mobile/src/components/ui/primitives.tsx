import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radii, spacing, typography } from "../../theme/tokens";

export function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const variant = props.variant ?? "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ disabled: props.disabled === true || props.loading === true }}
      disabled={props.disabled || props.loading}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        (props.disabled || props.loading) && styles.disabled,
        pressed && !props.disabled && variant === "primary" && styles.primaryPressed,
        props.style,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.textOnDark : colors.primary} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === "primary" && styles.primaryLabel,
            variant === "secondary" && styles.secondaryLabel,
            variant === "ghost" && styles.ghostLabel,
          ]}
        >
          {props.label}
        </Text>
      )}
    </Pressable>
  );
}

export function SelectionCard(props: {
  title: string;
  detail?: string;
  selected?: boolean;
  recommended?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: props.selected === true }}
      accessibilityLabel={props.accessibilityLabel ?? props.title}
      onPress={props.onPress}
      style={[styles.selectionCard, props.selected && styles.selectionCardSelected]}
    >
      <View style={styles.selectionHeader}>
        <Text style={styles.selectionTitle}>{props.title}</Text>
        {props.recommended ? <Text style={styles.recommended}>Recommended</Text> : null}
      </View>
      {props.detail ? <Text style={styles.selectionDetail}>{props.detail}</Text> : null}
    </Pressable>
  );
}

export function ChoiceChip(props: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  tone?: "default" | "caution";
}) {
  const selected = props.selected === true;
  const caution = props.tone === "caution";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={[
        styles.chip,
        selected && styles.chipSelected,
        caution && styles.chipCaution,
        selected && caution && styles.chipCautionSelected,
      ]}
    >
      <Text
        style={[
          styles.chipLabel,
          selected && styles.chipLabelSelected,
          caution && !selected && styles.chipCautionLabel,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export function ScreenHeader(props: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.screenHeader}>
      {props.eyebrow ? <Text style={styles.eyebrow}>{props.eyebrow}</Text> : null}
      <Text style={styles.screenTitle}>{props.title}</Text>
      {props.subtitle ? <Text style={styles.screenSubtitle}>{props.subtitle}</Text> : null}
    </View>
  );
}

export function SectionHeader(props: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.sectionTitle}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.sectionSubtitle}>{props.subtitle}</Text> : null}
      </View>
      {props.actionLabel && props.onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={props.onAction}
          hitSlop={8}
        >
          <Text style={styles.sectionAction}>{props.actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState(props: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty} accessibilityRole={"summary" as AccessibilityRole}>
      <Text style={styles.emptyTitle}>{props.title}</Text>
      <Text style={styles.emptyBody}>{props.body}</Text>
      {props.actionLabel && props.onAction ? (
        <PrimaryButton label={props.actionLabel} onPress={props.onAction} style={{ marginTop: spacing.md }} />
      ) : null}
    </View>
  );
}

export function ErrorState(props: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.errorBox} accessibilityRole="alert">
      <Text style={styles.errorTitle}>{props.title}</Text>
      <Text style={styles.errorBody}>{props.body}</Text>
      {props.actionLabel && props.onAction ? (
        <PrimaryButton
          label={props.actionLabel}
          onPress={props.onAction}
          variant="secondary"
          style={{ marginTop: spacing.md }}
        />
      ) : null}
    </View>
  );
}

export function LoadingSkeleton(props: { rows?: number; height?: number }) {
  const rows = props.rows ?? 3;
  const height = props.height ?? 72;
  return (
    <View style={styles.skeletonList} accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={[styles.skeletonRow, { height }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  primaryPressed: {
    backgroundColor: colors.primaryPressed,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...typography.bodyStrong,
  },
  primaryLabel: {
    color: colors.textOnDark,
  },
  secondaryLabel: {
    color: colors.text,
  },
  ghostLabel: {
    color: colors.primary,
  },
  selectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    minHeight: 88,
  },
  selectionCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  selectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  selectionTitle: {
    ...typography.subheading,
    color: colors.text,
    flex: 1,
  },
  recommended: {
    ...typography.caption,
    color: colors.primary,
  },
  selectionDetail: {
    ...typography.body,
    color: colors.textSecondary,
  },
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    minHeight: 40,
    justifyContent: "center",
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipCaution: {
    borderColor: "#D4A5A5",
    backgroundColor: colors.errorSoft,
  },
  chipCautionSelected: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  chipLabel: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  chipLabelSelected: {
    color: colors.textOnDark,
  },
  chipCautionLabel: {
    color: colors.error,
  },
  screenHeader: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  screenTitle: {
    ...typography.title,
    color: colors.text,
  },
  screenSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  sectionSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "400",
  },
  sectionAction: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.text,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorBox: {
    backgroundColor: colors.errorSoft,
    borderRadius: radii.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "#E5BDBD",
  },
  errorTitle: {
    ...typography.subheading,
    color: colors.error,
  },
  errorBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  skeletonList: {
    gap: spacing.md,
  },
  skeletonRow: {
    backgroundColor: colors.skeleton,
    borderRadius: radii.md,
  },
});
