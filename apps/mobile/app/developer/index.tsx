import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { router } from "expo-router";
import { ScreenHeader } from "../../src/components/ui/primitives";
import { colors, radii, spacing, typography } from "../../src/theme/tokens";

const PREVIEW_ROUTES: Array<{ href: string; label: string; detail: string }> = [
  {
    href: "/recipe-preview",
    label: "Dev: Recipe Preview",
    detail: "Single-recipe generation sandbox",
  },
  {
    href: "/weekly-strategy-preview",
    label: "Dev: Weekly Strategy Preview",
    detail: "Legacy weekly strategy generation",
  },
  {
    href: "/culinary-discovery-preview",
    label: "Dev: Culinary Discovery",
    detail: "Candidate discovery sandbox",
  },
  {
    href: "/candidate-ranking-preview",
    label: "Dev: Candidate Ranking",
    detail: "Local ranking preview",
  },
  {
    href: "/recipe-resolution-preview",
    label: "Dev: Recipe Resolution",
    detail: "Resolve candidates into recipes",
  },
  {
    href: "/food-resolution-preview",
    label: "Dev: Food Resolution",
    detail: "Recipe nutrition resolution",
  },
  {
    href: "/meal-composition-preview",
    label: "Dev: Meal Composition",
    detail: "Complete-meal composition sandbox",
  },
];

export default function DeveloperHubScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="DEVELOPER"
        title="Dev tools"
        subtitle="Preview routes for planning pipelines. Not shown to consumers."
      />
      {PREVIEW_ROUTES.map((route) => (
        <Pressable
          key={route.href}
          accessibilityRole="button"
          style={styles.row}
          onPress={() => router.push(route.href)}
        >
          <Text style={styles.rowTitle}>{route.label}</Text>
          <Text style={styles.rowDetail}>{route.detail}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  rowTitle: {
    ...typography.subheading,
    color: colors.text,
  },
  rowDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
