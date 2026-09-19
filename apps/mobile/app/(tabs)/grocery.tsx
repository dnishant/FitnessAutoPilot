import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  GROCERY_CATEGORY_LABELS,
  groceryItemIsReady,
  type GroceryItem,
  type GroceryItemStatus,
} from "@fitness-autopilot/contracts";
import { EmptyState, ScreenHeader } from "../../src/components/ui/primitives";
import {
  groceryChecklistStorageKey,
  GROCERY_CHECKED_STORAGE_KEY,
} from "../../src/lib/consumer-plan-view";
import { useSession } from "../../src/state/session";
import { colors, spacing, typography } from "../../src/theme/tokens";

type ChecklistState = Record<string, GroceryItemStatus>;

function statusFromLegacyChecked(checked: Record<string, boolean>): ChecklistState {
  const out: ChecklistState = {};
  for (const [id, value] of Object.entries(checked)) {
    out[id] = value ? "got" : "needed";
  }
  return out;
}

function cycleStatus(current: GroceryItemStatus): GroceryItemStatus {
  if (current === "needed") return "got";
  if (current === "got") return "have";
  return "needed";
}

function statusLabel(status: GroceryItemStatus): string {
  if (status === "got") return "Got it";
  if (status === "have") return "Already have";
  return "Need";
}

function itemQuantityLabel(item: GroceryItem): string | null {
  if (item.displayQuantityLabel) return item.displayQuantityLabel;
  if (item.quantities?.length) {
    return item.quantities.map((q) => q.displayLabel).join(" + ");
  }
  if (item.quantity != null && item.unit) return `${item.quantity} ${item.unit}`;
  if (item.quantity != null) return String(item.quantity);
  return null;
}

export default function GroceryTabScreen() {
  const { weeklyPlan } = useSession();
  const groceryList = weeklyPlan?.groceryList;
  const available = Boolean(groceryList?.available && groceryList.sections.length > 0);
  const planId = weeklyPlan?.generatedPlanId ?? groceryList?.generatedPlanId;
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = groceryChecklistStorageKey(planId);
    AsyncStorage.getItem(key)
      .then(async (raw) => {
        if (cancelled) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as ChecklistState | Record<string, boolean>;
            if (parsed && typeof parsed === "object") {
              const first = Object.values(parsed)[0];
              if (typeof first === "boolean") {
                setChecklist(statusFromLegacyChecked(parsed as Record<string, boolean>));
              } else {
                setChecklist(parsed as ChecklistState);
              }
              return;
            }
          } catch {
            // ignore corrupt local state
          }
        }
        // Migrate legacy global key once when plan-scoped key is empty.
        if (planId) {
          const legacy = await AsyncStorage.getItem(GROCERY_CHECKED_STORAGE_KEY);
          if (legacy && !cancelled) {
            try {
              const parsed = JSON.parse(legacy) as Record<string, boolean>;
              if (parsed && typeof parsed === "object") {
                setChecklist(statusFromLegacyChecked(parsed));
              }
            } catch {
              // ignore
            }
          }
        }
      })
      .catch(() => {
        // ignore storage errors
      });
    return () => {
      cancelled = true;
    };
  }, [planId]);

  const persistChecklist = useCallback(
    async (next: ChecklistState) => {
      setChecklist(next);
      try {
        await AsyncStorage.setItem(groceryChecklistStorageKey(planId), JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
    },
    [planId],
  );

  const allItems = useMemo(() => {
    if (!groceryList?.sections) return [];
    return groceryList.sections.flatMap((section) => section.items);
  }, [groceryList]);

  const resolvedStatus = useCallback(
    (item: GroceryItem): GroceryItemStatus => {
      return checklist[item.id] ?? item.status ?? (item.checked ? "got" : "needed");
    },
    [checklist],
  );

  const readyCount = allItems.filter((item) =>
    groceryItemIsReady({ status: resolvedStatus(item), checked: false }),
  ).length;
  const totalCount = allItems.length;
  const allComplete = available && totalCount > 0 && readyCount === totalCount;

  const selectedItem = allItems.find((item) => item.id === selectedItemId) ?? null;

  function toggleItem(id: string) {
    const item = allItems.find((row) => row.id === id);
    if (!item) return;
    const current = resolvedStatus(item);
    void persistChecklist({ ...checklist, [id]: cycleStatus(current) });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="GROCERY"
        title="Grocery"
        subtitle={
          available && totalCount > 0
            ? allComplete
              ? "All set · 4 meals · 12 portions · 6 days"
              : `${readyCount} of ${totalCount} items · 4 meals · 12 portions · 6 days`
            : weeklyPlan?.status === "ready"
              ? "Building your list for 4 meals · 12 portions · 6 days…"
              : "From your 4-meal · 12-portion · 6-day plan"
        }
      />

      {!weeklyPlan || weeklyPlan.status !== "ready" ? (
        <EmptyState
          title="Generate your weekly plan first."
          body="Once your plan is finalized, we derive an exact grocery list from the recipes and portions — never by guessing ingredients."
        />
      ) : !available ? (
        <EmptyState
          title="Getting your grocery list…"
          body="Your plan is ready, but grocery aggregation did not produce items yet. Try regenerating the plan if this persists."
        />
      ) : (
        <View style={styles.sections}>
          {allComplete ? (
            <Text style={styles.completeBanner}>Everything on this list is marked ready.</Text>
          ) : null}
          {groceryList!.sections.map((section) => (
            <View key={section.category} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {GROCERY_CATEGORY_LABELS[section.category]}
              </Text>
              {section.items.map((item) => {
                const status = resolvedStatus(item);
                const isReady = groceryItemIsReady({ status, checked: false });
                const quantity = itemQuantityLabel(item);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isReady }}
                    accessibilityLabel={`${item.displayName}, ${statusLabel(status)}`}
                    onPress={() => toggleItem(item.id)}
                    onLongPress={() =>
                      setSelectedItemId((current) => (current === item.id ? null : item.id))
                    }
                    style={styles.row}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        status === "got" && styles.checkboxGot,
                        status === "have" && styles.checkboxHave,
                      ]}
                    />
                    <View style={styles.rowCopy}>
                      <Text style={[styles.itemName, isReady && styles.checkedText]}>
                        {item.displayName}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {[quantity, status !== "needed" ? statusLabel(status) : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                      {selectedItem?.id === item.id && item.sourceRecipeNames.length > 0 ? (
                        <View style={styles.provenance}>
                          <Text style={styles.provenanceTitle}>Used for</Text>
                          {item.sourceRecipeNames.slice(0, 6).map((name) => (
                            <Text key={name} style={styles.provenanceLine}>
                              · {name}
                            </Text>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}
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
  sections: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
  },
  completeBanner: {
    ...typography.body,
    color: colors.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    marginTop: 2,
    backgroundColor: colors.surface,
  },
  checkboxGot: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxHave: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 2,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    ...typography.body,
    color: colors.text,
  },
  itemMeta: {
    ...typography.caption,
    color: colors.textMuted,
  },
  checkedText: {
    textDecorationLine: "line-through",
    color: colors.textMuted,
  },
  provenance: {
    marginTop: spacing.xs,
    gap: 2,
  },
  provenanceTitle: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  provenanceLine: {
    ...typography.caption,
    color: colors.text,
  },
});
