import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  createOnboardingView,
  startMealPreferencesOnboarding,
  type OnboardingView,
} from "@fitness-autopilot/domain";
import { MealPreferenceSteps } from "../src/components/meal-preference-steps";
import { useSession } from "../src/state/session";
import { colors, spacing, typography } from "../src/theme/tokens";

export default function MealPreferencesScreen() {
  const { mealPreferences, cookingPreferences, weeklyPlan, saveMealPreferences } = useSession();
  const [view, setView] = useState(() =>
    startMealPreferencesOnboarding(createOnboardingView(), mealPreferences),
  );
  const [busy, setBusy] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  // Prefill whenever persisted prefs arrive (settings edit or late session hydrate).
  useEffect(() => {
    if (!mealPreferences) return;
    setView(startMealPreferencesOnboarding(createOnboardingView(), mealPreferences));
  }, [mealPreferences]);

  async function persist(next: OnboardingView) {
    if (!next.mealPreferences) {
      return;
    }
    setBusy(true);
    setPersistError(null);
    const saved = await saveMealPreferences(next.mealPreferences);
    setBusy(false);
    if (!saved.ok) {
      setPersistError(saved.error);
      return;
    }

    const hadReadyPlan = weeklyPlan?.status === "ready";
    const setupComplete = Boolean(cookingPreferences);
    if (hadReadyPlan && setupComplete) {
      Alert.alert(
        "Preferences saved",
        "Your current weekly plan hasn't changed. New preferences apply the next time you generate a plan.",
        [
          {
            text: "Keep current plan",
            style: "cancel",
            onPress: () => router.replace("/(tabs)/you"),
          },
          {
            text: "Regenerate plan",
            onPress: () => router.replace("/generate"),
          },
        ],
      );
      return;
    }
    router.replace(setupComplete ? "/(tabs)/today" : "/cooking-preferences");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Food Preferences</Text>
        <Text style={styles.subtitle}>
          Cuisines, proteins, allergies, and variety — saved to your account.
        </Text>
      </View>
      <MealPreferenceSteps
        view={view}
        onChange={setView}
        onComplete={(next) => {
          void persist(next);
        }}
        busy={busy}
        persistError={persistError}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.md, backgroundColor: colors.background },
  header: { gap: spacing.xs, marginBottom: spacing.sm },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
});
