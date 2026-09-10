import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { router } from "expo-router";
import {
  createOnboardingView,
  startMealPreferencesOnboarding,
  type OnboardingView,
} from "@fitness-autopilot/domain";
import { MealPreferenceSteps } from "../src/components/meal-preference-steps";
import { useSession } from "../src/state/session";

export default function MealPreferencesScreen() {
  const { mealPreferences, saveMealPreferences } = useSession();
  const [view, setView] = useState(() =>
    startMealPreferencesOnboarding(createOnboardingView(), mealPreferences),
  );
  const [busy, setBusy] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

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
    router.replace("/today");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
  container: { padding: 24, gap: 12 },
});
