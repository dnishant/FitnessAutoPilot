import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GROCERY_CATEGORY_LABELS } from "@fitness-autopilot/contracts";
import { EmptyState, ScreenHeader } from "../../src/components/ui/primitives";
import { GROCERY_CHECKED_STORAGE_KEY } from "../../src/lib/consumer-plan-view";
import { useSession } from "../../src/state/session";
import { colors, spacing, typography } from "../../src/theme/tokens";

export default function GroceryTabScreen() {
  const { weeklyPlan } = useSession();
  const groceryList = weeklyPlan?.groceryList;
  const available = Boolean(groceryList?.available && groceryList.sections.length > 0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(GROCERY_CHECKED_STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw) as Record<string, boolean>;
          if (parsed && typeof parsed === "object") {
            setChecked(parsed);
          }
        } catch {
          // ignore corrupt local state
        }
      })
      .catch(() => {
        // ignore storage errors
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistChecked = useCallback(async (next: Record<string, boolean>) => {
    setChecked(next);
    try {
      await AsyncStorage.setItem(GROCERY_CHECKED_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const allItems = useMemo(() => {
    if (!groceryList?.sections) return [];
    return groceryList.sections.flatMap((section) => section.items);
  }, [groceryList]);

  const checkedCount = allItems.filter((item) => checked[item.id] ?? item.checked).length;
  const totalCount = allItems.length;

  function toggleItem(id: string) {
    const current = checked[id] ?? false;
    void persistChecked({ ...checked, [id]: !current });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        eyebrow="GROCERY"
        title="Grocery"
        subtitle={
          available && totalCount > 0
            ? `${checkedCount} of ${totalCount} checked`
            : undefined
        }
      />

      {!available ? (
        <EmptyState
          title="Your grocery list will appear here once your meal plan is finalized."
          body="We only show quantities when the grocery engine has aggregated them — never by inventing amounts from recipes."
        />
      ) : (
        <View style={styles.sections}>
          {groceryList!.sections.map((section) => (
            <View key={section.category} style={styles.section}>
              <Text style={styles.sectionTitle}>
                {GROCERY_CATEGORY_LABELS[section.category]}
              </Text>
              {section.items.map((item) => {
                const isChecked = checked[item.id] ?? item.checked;
                const quantity =
                  item.quantity != null && item.unit
                    ? `${item.quantity} ${item.unit}`
                    : item.quantity != null
                      ? String(item.quantity)
                      : null;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isChecked }}
                    accessibilityLabel={item.displayName}
                    onPress={() => toggleItem(item.id)}
                    style={styles.row}
                  >
                    <View style={[styles.checkbox, isChecked && styles.checkboxChecked]} />
                    <View style={styles.rowCopy}>
                      <Text style={[styles.itemName, isChecked && styles.checkedText]}>
                        {item.displayName}
                      </Text>
                      {quantity ? (
                        <Text style={styles.itemMeta}>{quantity}</Text>
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
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
});
