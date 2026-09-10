import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { router } from "expo-router";
import {
  createOnboardingView,
  startCookingPreferencesOnboarding,
  type OnboardingView,
} from "@fitness-autopilot/domain";
import { CookingPreferenceSteps } from "../src/components/cooking-preference-steps";
import { useSession } from "../src/state/session";

export default function CookingPreferencesScreen() {
  const { cookingPreferences, saveCookingPreferences } = useSession();
  const [view, setView] = useState(() =>
    startCookingPreferencesOnboarding(createOnboardingView(), cookingPreferences),
  );
  const [busy, setBusy] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

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
    router.replace("/today");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
  container: { padding: 24, gap: 12 },
});
