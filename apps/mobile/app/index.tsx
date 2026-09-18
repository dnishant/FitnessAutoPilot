import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  authenticatedBootstrapHref,
  resolveAuthenticatedBootstrapRoute,
} from "../src/lib/consumer-setup";
import { useSession } from "../src/state/session";
import { colors, typography } from "../src/theme/tokens";

export default function Index() {
  const {
    user,
    profile,
    currentRmr,
    currentTdee,
    currentCalorieTarget,
    nutritionTarget,
    mealPreferences,
    cookingPreferences,
    goal,
    loading,
  } = useSession();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Getting things ready…</Text>
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/auth" />;
  }

  const route = resolveAuthenticatedBootstrapRoute({
    profile,
    currentRmr,
    currentTdee,
    currentCalorieTarget,
    nutritionTarget,
    goal,
    mealPreferences,
    cookingPreferences,
  });

  return <Redirect href={authenticatedBootstrapHref(route)} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.background,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
