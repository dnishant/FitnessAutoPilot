import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import type { CuisineValue, RecipeSection } from "@fitness-autopilot/contracts";
import { ChoiceChip, ScreenHeader } from "../../src/components/ui/primitives";
import {
  closeRecipeVersion,
  componentName,
  createRecipeCatalogUiState,
  cuisineFilterOptions,
  kitchenTestLabel,
  loadRecipeCatalog,
  openRecipeVersion,
  proteinFilterOptions,
  RECIPE_CATALOG_TITLE,
  resolveIngredientName,
  resolveProteinName,
  sectionLabel,
  statusLabel,
  type RecipeCatalogUiState,
} from "../../src/lib/recipe-catalog";
import { colors, radii, spacing, typography } from "../../src/theme/tokens";

const SECTIONS: RecipeSection[] = ["breakfast", "meal", "snack"];

export default function RecipeCatalogScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [state, setState] = useState<RecipeCatalogUiState>(() =>
    createRecipeCatalogUiState(),
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setState((current) => loadRecipeCatalog(current));
    }, 0);
    return () => clearTimeout(timer);
  }, [
    state.section,
    state.search,
    state.filterCuisine,
    state.filterProteinProductId,
  ]);

  const cuisineOptions = useMemo(() => cuisineFilterOptions(), []);
  const proteinOptions = useMemo(() => proteinFilterOptions(), []);

  return (
    <ScrollView
      contentContainerStyle={[styles.container, compact && styles.containerCompact]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader
        eyebrow="CATALOG"
        title={RECIPE_CATALOG_TITLE}
        subtitle="Versioned curated recipes for future catalog-backed planning. Internal verification surface — not wired to weekly planning."
      />

      <View style={styles.disclaimer} accessibilityRole="text">
        <Text style={styles.disclaimerText}>
          Validated structure means the recipe graph passed integrity checks. Kitchen tested is a
          separate kitchen review signal and is never inferred from publication.
        </Text>
      </View>

      <View style={styles.filters}>
        <Text style={styles.label} accessibilityRole="header">
          Section
        </Text>
        <View style={styles.chipRow}>
          {SECTIONS.map((section) => (
            <ChoiceChip
              key={section}
              label={sectionLabel(section)}
              selected={state.section === section}
              onPress={() =>
                setState((current) => ({
                  ...current,
                  section,
                  filterProteinProductId: "all",
                  selectedVersionId: null,
                  detail: null,
                  loading: true,
                }))
              }
            />
          ))}
        </View>

        <Text style={styles.label}>Search</Text>
        <TextInput
          accessibilityLabel="Search recipes by title"
          value={state.search}
          onChangeText={(search) =>
            setState((current) => ({ ...current, search, loading: true }))
          }
          placeholder="Search by recipe title"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        <Text style={styles.label}>Cuisine</Text>
        <View style={styles.chipRow}>
          {cuisineOptions.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              selected={state.filterCuisine === option.value}
              onPress={() =>
                setState((current) => ({
                  ...current,
                  filterCuisine: option.value as CuisineValue | "all",
                  loading: true,
                }))
              }
            />
          ))}
        </View>

        {state.section === "meal" ? (
          <>
            <Text style={styles.label}>Protein product</Text>
            <View style={styles.chipRow}>
              {proteinOptions.map((option) => (
                <ChoiceChip
                  key={option.value}
                  label={option.label}
                  selected={state.filterProteinProductId === option.value}
                  onPress={() =>
                    setState((current) => ({
                      ...current,
                      filterProteinProductId: option.value,
                      loading: true,
                    }))
                  }
                />
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.count} accessibilityLiveRegion="polite">
          {state.loading
            ? "Loading recipes…"
            : `${state.items.length} recipe${state.items.length === 1 ? "" : "s"}`}
        </Text>
      </View>

      {state.error ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorTitle}>Could not load catalog</Text>
          <Text style={styles.errorBody}>{state.error}</Text>
        </View>
      ) : null}

      {!state.loading && !state.error && state.items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No matching recipes</Text>
          <Text style={styles.emptyBody}>
            Try another section, clear search, or reset cuisine / protein filters.
          </Text>
        </View>
      ) : null}

      <View style={[styles.list, !compact && styles.listWide]}>
        {state.items.map((item) => {
          const selected = state.selectedVersionId === item.version.id;
          const total = item.totalMinutes;
          return (
            <Pressable
              key={item.version.id}
              accessibilityRole="button"
              accessibilityState={{ expanded: selected }}
              accessibilityLabel={`${item.version.title}. ${sectionLabel(item.recipe.section)}. Version ${item.version.version}.`}
              onPress={() =>
                setState((current) =>
                  selected
                    ? closeRecipeVersion(current)
                    : openRecipeVersion(current, item.version.id),
                )
              }
              style={[styles.card, selected && styles.cardSelected]}
            >
              <Text style={styles.cardTitle}>{item.version.title}</Text>
              <Text style={styles.cardMeta}>
                {sectionLabel(item.recipe.section)} · v{item.version.version} ·{" "}
                {statusLabel(item.version.status)}
              </Text>
              <Text style={styles.cardMeta}>
                {item.primaryProteinDisplayName
                  ? `Protein: ${item.primaryProteinDisplayName} · `
                  : ""}
                Cuisine: {item.cuisines.join(", ") || "—"}
              </Text>
              <Text style={styles.cardMeta}>
                Active {item.version.activeMinutes} min · Total {total} min ·{" "}
                {item.version.referenceServings} serving
                {item.version.referenceServings === 1 ? "" : "s"}
              </Text>
              <Text style={styles.cardMeta}>
                {kitchenTestLabel(item.version.kitchenTestStatus)}
              </Text>

              {selected && state.detail ? (
                <View style={styles.detail}>
                  <Text style={styles.detailHeading}>Overview</Text>
                  {state.detail.version.description ? (
                    <Text style={styles.detailLine}>{state.detail.version.description}</Text>
                  ) : null}
                  <Text style={styles.detailLine}>
                    Section: {sectionLabel(state.detail.recipe.section)}
                  </Text>
                  <Text style={styles.detailLine}>
                    Version id: {state.detail.version.id}
                  </Text>
                  <Text style={styles.detailLine}>
                    Lifecycle: {statusLabel(state.detail.version.status)}
                  </Text>
                  <Text style={styles.detailLine}>
                    Structure:{" "}
                    {state.detail.structureValidated
                      ? "Validated structure"
                      : "Not structurally validated"}
                  </Text>
                  <Text style={styles.detailLine}>
                    Kitchen:{" "}
                    {state.detail.kitchenTested
                      ? "Kitchen tested"
                      : kitchenTestLabel(state.detail.version.kitchenTestStatus)}
                  </Text>
                  <Text style={styles.detailLine}>
                    Active {state.detail.version.activeMinutes} min · Passive{" "}
                    {state.detail.version.passiveMinutes} min
                  </Text>
                  {state.detail.recipe.section === "meal" ? (
                    <Text style={styles.detailLine}>
                      Lunch: {state.detail.version.lunchSuitability ?? "—"} · Dinner:{" "}
                      {state.detail.version.dinnerSuitability ?? "—"}
                    </Text>
                  ) : null}

                  <Text style={styles.detailHeading}>Classifications</Text>
                  <Text style={styles.detailLine}>
                    Cuisine: {state.detail.classifications.cuisines.join(", ") || "—"}
                  </Text>
                  <Text style={styles.detailLine}>
                    Flavors: {state.detail.classifications.flavorProfiles.join(", ") || "—"}
                  </Text>
                  <Text style={styles.detailLine}>
                    Experience:{" "}
                    {state.detail.classifications.experiencePreferences.join(", ") || "—"}
                  </Text>
                  <Text style={styles.detailLine}>
                    Allergens: {state.detail.classifications.allergens.join(", ") || "—"}
                  </Text>
                  <Text style={styles.detailLine}>
                    Dietary: {state.detail.classifications.dietaryAttributes.join(", ") || "—"}
                  </Text>
                  <Text style={styles.detailLine}>
                    Equipment: {state.detail.classifications.requiredEquipment.join(", ") || "—"}
                  </Text>

                  <Text style={styles.detailHeading}>Components</Text>
                  {state.detail.components.map((component) => (
                    <View key={component.id} style={styles.block}>
                      <Text style={styles.detailLine}>
                        {component.displayOrder + 1}. {component.name} ({component.kind}
                        {component.adjustable ? ", adjustable later" : ""})
                      </Text>
                      {state.detail!.ingredients
                        .filter((ing) => ing.componentId === component.id)
                        .map((ing) => (
                          <Text key={ing.id} style={styles.detailIndent}>
                            {ing.quantity} {ing.unit}{" "}
                            {resolveIngredientName(ing.canonicalIngredientId)}
                            {ing.proteinProductId
                              ? ` [${resolveProteinName(ing.proteinProductId)}]`
                              : ""}
                            {ing.preparation ? ` — ${ing.preparation}` : ""}
                            {ing.optional ? " (optional)" : ""}
                          </Text>
                        ))}
                    </View>
                  ))}

                  <Text style={styles.detailHeading}>Steps</Text>
                  {state.detail.steps.map((step) => (
                    <View key={step.id} style={styles.block}>
                      <Text style={styles.detailLine}>
                        {step.order}. {step.title ?? componentName(state.detail!, step.componentId)}
                      </Text>
                      <Text style={styles.detailIndent}>{step.instruction}</Text>
                      {step.equipment.length > 0 ? (
                        <Text style={styles.detailIndent}>
                          Equipment: {step.equipment.join(", ")}
                        </Text>
                      ) : null}
                      {state
                        .detail!.usages.filter((u) => u.recipeStepId === step.id)
                        .map((usage) => {
                          const ing = state.detail!.ingredients.find(
                            (i) => i.id === usage.recipeIngredientId,
                          );
                          return (
                            <Text key={usage.id} style={styles.detailIndent}>
                              Uses {usage.quantity} {usage.unit}{" "}
                              {ing
                                ? resolveIngredientName(ing.canonicalIngredientId)
                                : usage.recipeIngredientId}
                              {usage.action ? ` (${usage.action})` : ""}
                            </Text>
                          );
                        })}
                    </View>
                  ))}

                  <Text style={styles.detailHeading}>Scaling</Text>
                  <Text style={styles.detailLine}>
                    {state.detail.scaling.method}: {state.detail.scaling.minimumServings}–
                    {state.detail.scaling.maximumServings} servings (step{" "}
                    {state.detail.scaling.servingIncrement})
                  </Text>
                  {state.detail.scaling.notes ? (
                    <Text style={styles.detailLine}>{state.detail.scaling.notes}</Text>
                  ) : null}

                  <Text style={styles.detailHeading}>Storage</Text>
                  <Text style={styles.detailLine}>
                    Prep style: {state.detail.storage.prepStyle.replace(/_/g, " ")}
                  </Text>
                  <Text style={styles.detailLine}>
                    Refrigeration supported:{" "}
                    {state.detail.storage.refrigerationSupported ? "yes" : "no"} · Freezing
                    supported: {state.detail.storage.freezingSupported ? "yes" : "no"}
                  </Text>
                  <Text style={styles.detailLine}>
                    Store components separately:{" "}
                    {state.detail.storage.storeComponentsSeparately ? "yes" : "no"}
                  </Text>
                  {state.detail.storage.notes ? (
                    <Text style={styles.detailLine}>{state.detail.storage.notes}</Text>
                  ) : null}

                  <Text style={styles.detailHeading}>Provenance</Text>
                  <Text style={styles.detailLine}>
                    Type: {state.detail.provenance.type.replace(/_/g, " ")}
                  </Text>
                  {state.detail.provenance.sourceCreator ? (
                    <Text style={styles.detailLine}>
                      Creator: {state.detail.provenance.sourceCreator}
                    </Text>
                  ) : null}
                  <Text style={styles.detailLine}>
                    Kitchen tested at: {state.detail.provenance.kitchenTestedAt ?? "not recorded"}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
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
  containerCompact: {
    paddingHorizontal: spacing.lg,
  },
  disclaimer: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  disclaimerText: {
    ...typography.body,
    color: colors.text,
  },
  filters: {
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  count: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  list: {
    gap: spacing.md,
  },
  listWide: {
    maxWidth: 920,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  cardTitle: {
    ...typography.subheading,
    color: colors.text,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  detail: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  detailHeading: {
    ...typography.label,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  detailLine: {
    ...typography.body,
    color: colors.text,
  },
  detailIndent: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingLeft: spacing.md,
  },
  block: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  emptyBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    ...typography.subheading,
    color: colors.text,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorBox: {
    backgroundColor: colors.errorSoft,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  errorTitle: {
    ...typography.subheading,
    color: colors.error,
  },
  errorBody: {
    ...typography.body,
    color: colors.text,
  },
});
