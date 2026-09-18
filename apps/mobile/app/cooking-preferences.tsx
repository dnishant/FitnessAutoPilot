import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  createOnboardingView,
  startCookingPreferencesOnboarding,
  type OnboardingView,
} from "@fitness-autopilot/domain";
import { CookingPreferenceSteps } from "../src/components/cooking-preference-steps";
import { useSession } from "../src/state/session";
import { colors, spacing, typography } from "../src/theme/tokens";

export default function CookingPreferencesScreen() {
  const { cookingPreferences, mealPreferences, weeklyPlan, saveCookingPreferences } =
    useSession();
  const [view, setView] = useState(() =>
    startCookingPreferencesOnboarding(createOnboardingView(), cookingPreferences),
  );
  const [busy, setBusy] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  useEffect(() => {
    if (!cookingPreferences) return;
    setView(startCookingPreferencesOnboarding(createOnboardingView(), cookingPreferences));
  }, [cookingPreferences]);

  async function persist(next: OnboardingView) {
    if (!next.cookingPreferences) {
      return;
    }
    setBusy(true);
    setPersistError(null);
    const saved = await saveCookingPreferences(next.cookingPreferences);
    setBusy(false);
    if (!saved.ok) {
      setPersistError(saved.error);
      return;
    }

    const hadReadyPlan = weeklyPlan?.status === "ready";
    const setupComplete = Boolean(mealPreferences);
    if (hadReadyPlan && setupComplete) {
      Alert.alert(
        "Preferences saved",
        "Your current weekly plan hasn't changed. New cooking settings apply the next time you generate a plan.",
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
    router.replace("/(tabs)/today");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Cooking & Meal Prep</Text>
        <Text style={styles.subtitle}>
          Prep frequency, cooking style, and finish time — saved to your account.
        </Text>
      </View>
      <CookingPreferenceSteps
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
