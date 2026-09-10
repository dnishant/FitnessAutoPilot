import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
  FINISH_TIME_OPTIONS,
  PREP_FREQUENCY_OPTIONS,
  PREP_SESSION_TIME_OPTIONS,
  WEEKLY_COOKING_STYLE_OPTIONS,
  type MaxFinishMinutes,
  type MaxPrepSessionMinutes,
  type PrepFrequency,
  type WeeklyCookingStyle,
} from "@fitness-autopilot/contracts";
import {
  chooseOnboardingCookingStyle,
  chooseOnboardingDinnerPrep,
  chooseOnboardingFinishTime,
  chooseOnboardingPrepFrequency,
  chooseOnboardingPrepSessionTime,
  continueFromCookingStyle,
  continueFromDinnerPrep,
  continueFromFinishTime,
  continueFromPrepFrequency,
  continueFromPrepSessionTime,
  showsDinnerPrepQuestion,
  showsFinishTimeQuestion,
  type OnboardingView,
} from "@fitness-autopilot/domain";

export function CookingPreferenceSteps(props: {
  view: OnboardingView;
  onChange: (next: OnboardingView) => void;
  onComplete: (next: OnboardingView) => void;
  busy?: boolean;
  persistError?: string | null;
}) {
  const { view, onChange, onComplete, busy, persistError } = props;

  function finishFromStyle() {
    const next = continueFromCookingStyle(view);
    onChange(next);
    if (!next.error && next.cookingPreferences) {
      onComplete(next);
    }
  }

  function finishFromDinner() {
    const next = continueFromDinnerPrep(view);
    onChange(next);
    if (!next.error && next.cookingPreferences) {
      onComplete(next);
    }
  }

  return (
    <>
      {view.step === "prep_frequency" ? (
        <>
          <Text style={styles.title}>How often do you want dedicated meal-prep sessions?</Text>
          <Text style={styles.help}>We will not ask for exact prep days yet.</Text>
          {PREP_FREQUENCY_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.option,
                view.draft.prepFrequency === option.value && styles.optionSelected,
              ]}
              onPress={() =>
                onChange(chooseOnboardingPrepFrequency(view, option.value as PrepFrequency))
              }
            >
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionDetail}>{option.detail}</Text>
            </Pressable>
          ))}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable style={styles.primary} onPress={() => onChange(continueFromPrepFrequency(view))}>
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {view.step === "prep_session_time" ? (
        <>
          <Text style={styles.title}>How much time are you comfortable spending on each prep session?</Text>
          <Text style={styles.help}>
            For two weekly sessions, this is the limit per session, not a weekly total.
          </Text>
          {PREP_SESSION_TIME_OPTIONS.map((option) => (
            <Pressable
              key={String(option.value)}
              style={[
                styles.option,
                view.draft.maxPrepSessionMinutes === option.value && styles.optionSelected,
              ]}
              onPress={() =>
                onChange(
                  chooseOnboardingPrepSessionTime(view, option.value as MaxPrepSessionMinutes),
                )
              }
            >
              <Text style={styles.optionLabel}>{option.label}</Text>
            </Pressable>
          ))}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable
            style={styles.primary}
            onPress={() => onChange(continueFromPrepSessionTime(view))}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {view.step === "cooking_style" ? (
        <>
          <Text style={styles.title}>How would you like meals to work during the week?</Text>
          <Text style={styles.help}>
            These are preferences, not rigid rules. A later planner may mix ready meals and
            quick-finish meals.
          </Text>
          {WEEKLY_COOKING_STYLE_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              style={[
                styles.option,
                view.draft.cookingStyle === option.value && styles.optionSelected,
              ]}
              onPress={() =>
                onChange(chooseOnboardingCookingStyle(view, option.value as WeeklyCookingStyle))
              }
            >
              <Text style={styles.optionLabel}>
                {option.label}
                {option.recommended ? " (Recommended)" : ""}
              </Text>
              <Text style={styles.optionDetail}>{option.detail}</Text>
            </Pressable>
          ))}
          {showsFinishTimeQuestion(view.draft.cookingStyle) ? null : persistError ? (
            <Text style={styles.error}>{persistError}</Text>
          ) : null}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable
            style={styles.primary}
            disabled={busy && !showsFinishTimeQuestion(view.draft.cookingStyle)}
            onPress={finishFromStyle}
          >
            {busy && !showsFinishTimeQuestion(view.draft.cookingStyle) ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Continue</Text>
            )}
          </Pressable>
        </>
      ) : null}

      {view.step === "finish_time" && showsFinishTimeQuestion(view.draft.cookingStyle) ? (
        <>
          <Text style={styles.title}>How much time are you comfortable spending to finish a meal?</Text>
          <View style={styles.chipWrap}>
            {FINISH_TIME_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.chip,
                  view.draft.maxFinishMinutes === option.value && styles.chipSelected,
                ]}
                onPress={() =>
                  onChange(chooseOnboardingFinishTime(view, option.value as MaxFinishMinutes))
                }
              >
                <Text
                  style={[
                    styles.chipText,
                    view.draft.maxFinishMinutes === option.value && styles.chipTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable style={styles.primary} onPress={() => onChange(continueFromFinishTime(view))}>
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {view.step === "dinner_prep" && showsDinnerPrepQuestion(view.draft.cookingStyle) ? (
        <>
          <Text style={styles.title}>Use dinner prep to help with tomorrow's lunch?</Text>
          <Text style={styles.help}>
            We'll reuse prep work, ingredients, or cooking time to make the next day's lunch easier
            while keeping meals varied. This does not mean dinner becomes tomorrow's lunch.
          </Text>
          <Pressable
            style={[styles.option, view.draft.useDinnerPrepForNextLunch && styles.optionSelected]}
            onPress={() => onChange(chooseOnboardingDinnerPrep(view, true))}
          >
            <Text style={styles.optionLabel}>Yes, use dinner prep to help lunch</Text>
          </Pressable>
          <Pressable
            style={[styles.option, !view.draft.useDinnerPrepForNextLunch && styles.optionSelected]}
            onPress={() => onChange(chooseOnboardingDinnerPrep(view, false))}
          >
            <Text style={styles.optionLabel}>No, keep dinner and lunch separate</Text>
          </Pressable>
          {persistError ? <Text style={styles.error}>{persistError}</Text> : null}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable style={styles.primary} disabled={busy} onPress={finishFromDinner}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Continue</Text>}
          </Pressable>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "800", color: "#0B1F17" },
  help: { color: "#3D5A4C", marginBottom: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C9D9CF",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipSelected: {
    borderColor: "#1F6F4A",
    backgroundColor: "#E4F0E8",
  },
  chipText: { fontWeight: "700", color: "#0B1F17" },
  chipTextSelected: { fontWeight: "700", color: "#1F6F4A" },
  option: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C9D9CF",
    borderRadius: 8,
    padding: 14,
  },
  optionSelected: { borderColor: "#1F6F4A", backgroundColor: "#E4F0E8" },
  optionLabel: { fontWeight: "700", color: "#0B1F17", fontSize: 16 },
  optionDetail: { color: "#3D5A4C", marginTop: 4 },
  primary: {
    marginTop: 8,
    backgroundColor: "#1F6F4A",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  error: { color: "#9B1C1C" },
});
