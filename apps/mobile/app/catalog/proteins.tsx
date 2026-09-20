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
import type { AvailabilityClass, ProteinFamily } from "@fitness-autopilot/contracts";
import { ChoiceChip, ScreenHeader } from "../../src/components/ui/primitives";
import {
  availabilityDisclaimer,
  availabilityFilterOptions,
  availabilityLabel,
  closeProteinProduct,
  confidenceLabel,
  createProteinCatalogUiState,
  familyFilterOptions,
  familyLabel,
  loadProteinCatalog,
  nutritionStatusLabel,
  openProteinProduct,
  productSubtitle,
  PROTEIN_CATALOG_TITLE,
  retailerLabel,
  type ProteinCatalogUiState,
} from "../../src/lib/protein-catalog";
import { colors, radii, spacing, typography } from "../../src/theme/tokens";

export default function ProteinCatalogScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [state, setState] = useState<ProteinCatalogUiState>(() =>
    createProteinCatalogUiState(),
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setState((current) => loadProteinCatalog(current));
    }, 0);
    return () => clearTimeout(timer);
  }, [state.search, state.filterFamily, state.filterAvailability]);

  const familyOptions = useMemo(() => familyFilterOptions(), []);
  const availabilityOptions = useMemo(() => availabilityFilterOptions(), []);
  const disclaimer = availabilityDisclaimer();

  return (
    <ScrollView
      contentContainerStyle={[styles.container, compact && styles.containerCompact]}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader
        eyebrow="CATALOG"
        title={PROTEIN_CATALOG_TITLE}
        subtitle="Canonical purchasable protein forms used by future catalog-backed planning. Verification surface only."
      />

      <View
        style={styles.disclaimer}
        accessibilityRole="text"
        accessibilityLabel={disclaimer}
      >
        <Text style={styles.disclaimerText}>{disclaimer}</Text>
      </View>

      <View style={styles.filters}>
        <Text style={styles.label} accessibilityRole="header">
          Search
        </Text>
        <TextInput
          accessibilityLabel="Search protein products"
          value={state.search}
          onChangeText={(search) => setState((current) => ({ ...current, search, loading: true }))}
          placeholder="Search by name, cut, or form"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        <Text style={styles.label}>Protein family</Text>
        <View style={styles.chipRow}>
          {familyOptions.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              selected={state.filterFamily === option.value}
              onPress={() =>
                setState((current) => ({
                  ...current,
                  filterFamily: option.value as ProteinFamily | "all",
                  loading: true,
                }))
              }
            />
          ))}
        </View>

        <Text style={styles.label}>Availability class</Text>
        <View style={styles.chipRow}>
          {availabilityOptions.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              selected={state.filterAvailability === option.value}
              onPress={() =>
                setState((current) => ({
                  ...current,
                  filterAvailability: option.value as AvailabilityClass | "all",
                  loading: true,
                }))
              }
            />
          ))}
        </View>

        <Text style={styles.count} accessibilityLiveRegion="polite">
          {state.loading
            ? "Loading protein products…"
            : `${state.products.length} product${state.products.length === 1 ? "" : "s"}`}
        </Text>
      </View>

      {state.error ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorTitle}>Could not load catalog</Text>
          <Text style={styles.errorBody}>{state.error}</Text>
        </View>
      ) : null}

      {!state.loading && !state.error && state.products.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No matching proteins</Text>
          <Text style={styles.emptyBody}>
            Try clearing search or switching family / availability filters.
          </Text>
        </View>
      ) : null}

      <View style={[styles.list, !compact && styles.listWide]}>
        {state.products.map((product) => {
          const selected = state.selectedKey === product.canonicalKey;
          return (
            <Pressable
              key={product.id}
              accessibilityRole="button"
              accessibilityState={{ expanded: selected }}
              accessibilityLabel={`${product.displayName}. ${productSubtitle(product)}`}
              onPress={() =>
                setState((current) =>
                  selected
                    ? closeProteinProduct(current)
                    : openProteinProduct(current, product.canonicalKey),
                )
              }
              style={[styles.card, selected && styles.cardSelected]}
            >
              <Text style={styles.cardTitle}>{product.displayName}</Text>
              <Text style={styles.cardMeta}>{productSubtitle(product)}</Text>
              <Text style={styles.cardMeta}>
                {product.boneState && product.boneState !== "not_applicable"
                  ? `Bone: ${product.boneState.replace(/_/g, " ")} · `
                  : ""}
                {product.skinState && product.skinState !== "not_applicable"
                  ? `Skin: ${product.skinState.replace(/_/g, " ")} · `
                  : ""}
                Unit: {product.typicalPurchaseUnit}
              </Text>
              <Text style={styles.cardMeta}>
                {availabilityLabel(product.availabilityClass)} ·{" "}
                {product.active ? "Active" : "Inactive"}
              </Text>
              {selected && state.detail ? (
                <View style={styles.detail}>
                  <Text style={styles.detailHeading}>Product details</Text>
                  <Text style={styles.detailLine}>
                    Canonical key: {state.detail.product.canonicalKey}
                  </Text>
                  <Text style={styles.detailLine}>
                    Cut: {state.detail.product.cut?.replace(/_/g, " ") ?? "—"}
                  </Text>
                  <Text style={styles.detailLine}>
                    Form: {state.detail.product.form.replace(/_/g, " ")}
                  </Text>
                  <Text style={styles.detailLine}>
                    Family: {familyLabel(state.detail.product.proteinFamily)}
                  </Text>
                  <Text style={styles.detailLine}>
                    {nutritionStatusLabel(state.detail.nutritionMappingStatus)}
                  </Text>
                  <Text style={styles.detailLine}>
                    Availability: {availabilityLabel(state.detail.product.availabilityClass)}
                  </Text>
                  <Text style={styles.disclaimerInline}>{state.detail.availabilityDisclaimer}</Text>

                  <Text style={styles.detailHeading}>Aliases</Text>
                  {state.detail.aliases.length === 0 ? (
                    <Text style={styles.detailLine}>No aliases seeded.</Text>
                  ) : (
                    state.detail.aliases.map((alias) => (
                      <Text key={alias.id} style={styles.detailLine}>
                        {alias.displayAlias}
                      </Text>
                    ))
                  )}

                  <Text style={styles.detailHeading}>Retailer coverage evidence</Text>
                  {state.detail.retailerEvidence.length === 0 ? (
                    <Text style={styles.detailLine}>No retailer evidence seeded.</Text>
                  ) : (
                    state.detail.retailerEvidence.map((evidence) => (
                      <View key={evidence.id} style={styles.evidenceRow}>
                        <Text style={styles.detailLine}>
                          {retailerLabel(evidence.retailer)} · {confidenceLabel(evidence.confidence)}
                          {evidence.confidence === "verified" ? "" : " (not verified)"}
                        </Text>
                        {evidence.verifiedAt ? (
                          <Text style={styles.detailLine}>
                            Verified: {evidence.verifiedAt.slice(0, 10)}
                          </Text>
                        ) : null}
                        {evidence.sourceUrl ? (
                          <Text style={styles.link}>{evidence.sourceUrl}</Text>
                        ) : null}
                        {evidence.notes ? (
                          <Text style={styles.detailLine}>{evidence.notes}</Text>
                        ) : null}
                      </View>
                    ))
                  )}

                  <Text style={styles.detailHeading}>Approved substitutions</Text>
                  {state.detail.approvedSubstitutions.length === 0 ? (
                    <Text style={styles.detailLine}>None approved for this ingredient.</Text>
                  ) : (
                    state.detail.approvedSubstitutions.map((sub) => (
                      <Text key={sub.id} style={styles.detailLine}>
                        {sub.compatibility.replace(/_/g, " ")}
                        {sub.notes ? ` — ${sub.notes}` : ""}
                      </Text>
                    ))
                  )}
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
  disclaimerInline: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
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
  link: {
    ...typography.caption,
    color: colors.primary,
  },
  evidenceRow: {
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
