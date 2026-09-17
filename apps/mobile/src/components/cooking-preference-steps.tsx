import { StyleSheet, Text, View } from "react-native";
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
  chooseOnboardingFinishTime,
  chooseOnboardingPrepFrequency,
  chooseOnboardingPrepSessionTime,
  continueFromCookingStyle,
  continueFromFinishTime,
  continueFromPrepFrequency,
  continueFromPrepSessionTime,
  showsFinishTimeQuestion,
  type OnboardingView,
} from "@fitness-autopilot/domain";
import {
  ChoiceChip,
  PrimaryButton,
  SelectionCard,
} from "./ui/primitives";
import { colors, spacing, typography } from "../theme/tokens";

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

  function finishFromFinishTime() {
    const next = continueFromFinishTime(view);
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
            <SelectionCard
              key={option.value}
              title={option.label}
              detail={option.detail}
              selected={view.draft.prepFrequency === option.value}
              onPress={() =>
                onChange(chooseOnboardingPrepFrequency(view, option.value as PrepFrequency))
              }
            />
          ))}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <PrimaryButton
            label="Continue"
            onPress={() => onChange(continueFromPrepFrequency(view))}
          />
        </>
      ) : null}

      {view.step === "prep_session_time" ? (
        <>
          <Text style={styles.title}>How much time are you comfortable spending on each prep session?</Text>
          <Text style={styles.help}>
            For two weekly sessions, this is the limit per session, not a weekly total.
          </Text>
          {PREP_SESSION_TIME_OPTIONS.map((option) => (
            <SelectionCard
              key={String(option.value)}
              title={option.label}
              selected={view.draft.maxPrepSessionMinutes === option.value}
              onPress={() =>
                onChange(
                  chooseOnboardingPrepSessionTime(view, option.value as MaxPrepSessionMinutes),
                )
              }
            />
          ))}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <PrimaryButton
            label="Continue"
            onPress={() => onChange(continueFromPrepSessionTime(view))}
          />
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
            <SelectionCard
              key={option.value}
              title={option.label}
              detail={option.detail}
              selected={view.draft.cookingStyle === option.value}
              recommended={option.recommended === true}
              onPress={() =>
                onChange(chooseOnboardingCookingStyle(view, option.value as WeeklyCookingStyle))
              }
            />
          ))}
          {showsFinishTimeQuestion(view.draft.cookingStyle) ? null : persistError ? (
            <Text style={styles.error}>{persistError}</Text>
          ) : null}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <PrimaryButton
            label="Continue"
            disabled={busy && !showsFinishTimeQuestion(view.draft.cookingStyle)}
            loading={busy && !showsFinishTimeQuestion(view.draft.cookingStyle)}
            onPress={finishFromStyle}
          />
        </>
      ) : null}

      {view.step === "finish_time" && showsFinishTimeQuestion(view.draft.cookingStyle) ? (
        <>
          <Text style={styles.title}>How much time are you comfortable spending to finish a meal?</Text>
          <View style={styles.chipWrap}>
            {FINISH_TIME_OPTIONS.map((option) => (
              <ChoiceChip
                key={option.value}
                label={option.label}
                selected={view.draft.maxFinishMinutes === option.value}
                onPress={() =>
                  onChange(chooseOnboardingFinishTime(view, option.value as MaxFinishMinutes))
                }
              />
            ))}
          </View>
          {persistError ? <Text style={styles.error}>{persistError}</Text> : null}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <PrimaryButton
            label="Continue"
            disabled={busy}
            loading={busy}
            onPress={finishFromFinishTime}
          />
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    ...typography.heading,
    color: colors.text,
  },
  help: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  error: {
    ...typography.body,
    color: colors.error,
  },
});
