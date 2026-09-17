import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  ONBOARDING_GOAL_OPTIONS,
  WEARABLE_OPTIONS,
  type OnboardingGoalType,
  type RmrBiologicalSex,
  type Wearable,
  type WeightChangePace,
} from "@fitness-autopilot/contracts";
import {
  chooseOnboardingPace,
  chooseOnboardingRmrSource,
  chooseOnboardingWearable,
  continueFromCalorieTarget,
  continueFromEnergyResult,
  continueFromNutritionTarget,
  createOnboardingView,
  paceOptionsForGoal,
  pacePromptForGoal,
  submitOnboardingBasics,
  submitOnboardingDexa,
  submitOnboardingGoal,
  submitOnboardingWearableCalories,
  wearableCaloriesFieldLabel,
  type OnboardingView,
} from "@fitness-autopilot/domain";
import { useSession } from "../src/state/session";
import { CookingPreferenceSteps } from "../src/components/cooking-preference-steps";
import { MealPreferenceSteps } from "../src/components/meal-preference-steps";
import {
  PrimaryButton,
  SelectionCard,
} from "../src/components/ui/primitives";
import { NutritionSummary } from "../src/components/ui/meals";
import { colors, spacing, typography } from "../src/theme/tokens";

export default function OnboardingScreen() {
  const { completeOnboarding, user } = useSession();
  const [view, setView] = useState(() => createOnboardingView());
  const [busy, setBusy] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [showCalculation, setShowCalculation] = useState(false);

  function updateDraft<K extends keyof typeof view.draft>(key: K, value: (typeof view.draft)[K]) {
    setView((current) => ({
      ...current,
      error: null,
      draft: { ...current.draft, [key]: value },
    }));
    setPersistError(null);
  }

  async function persistResult(nextView: OnboardingView = view) {
    if (!user) {
      setPersistError("Not signed in");
      return;
    }
    const result = nextView.result;
    const calorieTarget = nextView.calorieTarget;
    const nutritionTarget = nextView.nutritionTarget;
    const mealPreferences = nextView.mealPreferences;
    const cookingPreferences = nextView.cookingPreferences;
    if (!result || !calorieTarget || !nutritionTarget || !mealPreferences || !cookingPreferences) {
      return;
    }
    setBusy(true);
    setPersistError(null);
    const saved = await completeOnboarding({
      dateOfBirth: nextView.draft.dateOfBirth,
      biologicalSex: nextView.draft.biologicalSex as RmrBiologicalSex,
      heightCm: Number(nextView.draft.heightCm),
      weightKg: Number(nextView.draft.weightKg),
      source: result.source,
      reportedRmrKcal:
        result.source === "user_reported_dexa" ? Number(nextView.draft.reportedRmrKcal) : undefined,
      reportDate: result.source === "user_reported_dexa" ? nextView.draft.reportDate : undefined,
      goalType: result.goalType,
      wearable: nextView.draft.wearable as Wearable,
      wearableCaloriesKcal: Number(nextView.draft.wearableCaloriesKcal),
      pace: calorieTarget.draft.pace,
      mealPreferences,
      cookingPreferences,
    });
    setBusy(false);
    if (!saved.ok) {
      setPersistError(saved.error);
      return;
    }
    router.replace("/(tabs)/today");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {view.step === "goal" ? (
        <>
          <Text style={styles.title}>What is your goal?</Text>
          <Text style={styles.help}>We store this so later targets can follow what you want.</Text>
          {ONBOARDING_GOAL_OPTIONS.map((option) => (
            <Pressable
              key={option.type}
              style={styles.option}
              onPress={() =>
                setView((current) => submitOnboardingGoal(current, option.type as OnboardingGoalType))
              }
            >
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionDetail}>{option.detail}</Text>
            </Pressable>
          ))}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
        </>
      ) : null}

      {view.step === "wearable" ? (
        <>
          <Text style={styles.title}>What wearable do you use?</Text>
          <Text style={styles.help}>We use this to establish your daily energy use (TDEE).</Text>
          {WEARABLE_OPTIONS.map((option) => (
            <Pressable
              key={option.type}
              style={styles.option}
              onPress={() =>
                setView((current) => chooseOnboardingWearable(current, option.type as Wearable))
              }
            >
              <Text style={styles.optionLabel}>{option.label}</Text>
            </Pressable>
          ))}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
        </>
      ) : null}

      {view.step === "wearable_calories" && view.draft.wearable ? (
        <>
          <Text style={styles.title}>
            {view.draft.wearable === "whoop" ? "Your Whoop daily calories" : "Your Apple Watch active calories"}
          </Text>
          <Text style={styles.help}>
            {view.draft.wearable === "whoop"
              ? "Enter the average daily calories from Whoop. This becomes your TDEE."
              : "Enter your typical Apple Watch active calories. TDEE will be this plus your RMR."}
          </Text>
          <Field
            label={wearableCaloriesFieldLabel(view.draft.wearable)}
            value={view.draft.wearableCaloriesKcal}
            onChange={(value) => updateDraft("wearableCaloriesKcal", value)}
            keyboard="numeric"
          />
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable
            style={styles.primary}
            onPress={() => setView((current) => submitOnboardingWearableCalories(current))}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {view.step === "basics" ? (
        <>
          <Text style={styles.title}>Basic information</Text>
          <Text style={styles.help}>
            We only need enough to establish your resting metabolic rate.
          </Text>
          <Field
            label="Date of birth (YYYY-MM-DD)"
            value={view.draft.dateOfBirth}
            onChange={(value) => updateDraft("dateOfBirth", value)}
          />
          <Text style={styles.label}>Biological sex</Text>
          <View style={styles.row}>
            {(["male", "female"] as const).map((sex) => (
              <Pressable
                key={sex}
                style={[styles.choice, view.draft.biologicalSex === sex && styles.choiceSelected]}
                onPress={() => updateDraft("biologicalSex", sex)}
              >
                <Text style={styles.choiceText}>{sex === "male" ? "Male" : "Female"}</Text>
              </Pressable>
            ))}
          </View>
          <Field
            label="Height (cm)"
            value={view.draft.heightCm}
            onChange={(value) => updateDraft("heightCm", value)}
            keyboard="numeric"
          />
          <Field
            label="Current weight (kg)"
            value={view.draft.weightKg}
            onChange={(value) => updateDraft("weightKg", value)}
            keyboard="numeric"
          />
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable
            style={styles.primary}
            onPress={() => setView((current) => submitOnboardingBasics(current))}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {view.step === "source" ? (
        <>
          <Text style={styles.title}>Do you already know your RMR?</Text>
          <Text style={styles.help}>
            Do you already know your RMR from a DEXA/body-composition report?
          </Text>
          <Pressable
            style={styles.option}
            onPress={() => setView((current) => chooseOnboardingRmrSource(current, true))}
          >
            <Text style={styles.optionLabel}>Yes, I know my RMR</Text>
          </Pressable>
          <Pressable
            style={styles.option}
            onPress={() => setView((current) => chooseOnboardingRmrSource(current, false))}
          >
            <Text style={styles.optionLabel}>No, estimate it for me</Text>
          </Pressable>
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
        </>
      ) : null}

      {view.step === "dexa_details" ? (
        <>
          <Text style={styles.title}>Your DEXA RMR</Text>
          <Text style={styles.help}>Enter the value from your report. This is not a medical review.</Text>
          <Field
            label="RMR (kcal/day)"
            value={view.draft.reportedRmrKcal}
            onChange={(value) => updateDraft("reportedRmrKcal", value)}
            keyboard="numeric"
          />
          <Field
            label="Scan/report date (YYYY-MM-DD)"
            value={view.draft.reportDate}
            onChange={(value) => updateDraft("reportDate", value)}
          />
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable
            style={styles.primary}
            onPress={() => setView((current) => submitOnboardingDexa(current))}
          >
            <Text style={styles.primaryText}>Save RMR</Text>
          </Pressable>
        </>
      ) : null}

      {view.step === "result" && view.result ? (
        <>
          <Text style={styles.title}>Your energy baseline</Text>
          <Text style={styles.kicker}>Your goal</Text>
          <Text style={styles.goalValue}>{view.result.goalLabel}</Text>
          <Text style={styles.kicker}>Resting Metabolic Rate</Text>
          <Text style={styles.rmrValue}>{view.result.formattedRmr}</Text>
          <Text style={styles.source}>{view.result.sourceLabel}</Text>
          <Text style={styles.help}>{view.result.explanation}</Text>
          <Text style={styles.kicker}>Total Daily Energy Expenditure</Text>
          <Text style={styles.rmrValue}>{view.result.formattedTdee}</Text>
          <Text style={styles.source}>{view.result.tdeeSourceLabel}</Text>
          <Text style={styles.help}>{view.result.tdeeExplanation}</Text>
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <PrimaryButton
            label="Continue"
            onPress={() => setView((current) => continueFromEnergyResult(current))}
          />
        </>
      ) : null}

      {view.step === "pace" && view.result ? (
        <>
          <Text style={styles.title}>{pacePromptForGoal(view.result.goalType)}</Text>
          {paceOptionsForGoal(view.result.goalType).map((option) => (
            <SelectionCard
              key={option.pace}
              title={option.label}
              detail={option.detail}
              onPress={() =>
                setView((current) => chooseOnboardingPace(current, option.pace as WeightChangePace))
              }
            />
          ))}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
        </>
      ) : null}

      {view.step === "calorie_target" && view.calorieTarget ? (
        <>
          <Text style={styles.title}>Your Starting Calorie Target</Text>
          <View style={styles.summaryBlock}>
            <Text style={styles.kicker}>Estimated maintenance</Text>
            <Text style={styles.goalValue}>{view.calorieTarget.formattedMaintenance}</Text>
            <Text style={styles.kicker}>Goal</Text>
            <Text style={styles.goalValue}>{view.calorieTarget.goalLabel}</Text>
            <Text style={styles.kicker}>Pace</Text>
            <Text style={styles.goalValue}>{view.calorieTarget.paceLabel}</Text>
            <Text style={styles.kicker}>Target rate</Text>
            <Text style={styles.goalValue}>{view.calorieTarget.formattedTargetRate}</Text>
            <Text style={styles.kicker}>Daily calorie target</Text>
            <Text style={styles.rmrValue}>{view.calorieTarget.formattedTargetCalories}</Text>
          </View>
          <PrimaryButton
            label="How was this calculated?"
            variant="ghost"
            onPress={() => setShowCalculation((open) => !open)}
          />
          {showCalculation
            ? view.calorieTarget.explanationRows.map((row) => (
                <View key={row.label} style={styles.explainRow}>
                  <Text style={styles.explainLabel}>{row.label}</Text>
                  <Text style={styles.explainValue}>{row.value}</Text>
                </View>
              ))
            : null}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <PrimaryButton
            label="Continue"
            onPress={() => setView((current) => continueFromCalorieTarget(current))}
          />
        </>
      ) : null}

      {view.step === "nutrition_target" && view.nutritionTarget ? (
        <>
          <Text style={styles.title}>Your Daily Nutrition Target</Text>
          <NutritionSummary
            calories={view.nutritionTarget.draft.targetCalories}
            proteinG={view.nutritionTarget.draft.proteinGrams}
            carbsG={view.nutritionTarget.draft.carbohydrateGrams}
            fatG={view.nutritionTarget.draft.fatGrams}
            fiberG={view.nutritionTarget.draft.fiberGrams}
          />
          <Text style={styles.help}>
            Protein {view.nutritionTarget.formattedProtein} · Fat{" "}
            {view.nutritionTarget.formattedFat} · Carbs{" "}
            {view.nutritionTarget.formattedCarbohydrates}
          </Text>
          <PrimaryButton
            label="How was this calculated?"
            variant="ghost"
            onPress={() => setShowCalculation((open) => !open)}
          />
          {showCalculation
            ? view.nutritionTarget.explanationRows.map((row) => (
                <View key={row.label} style={styles.explainRow}>
                  <Text style={styles.explainLabel}>{row.label}</Text>
                  <Text style={styles.explainValue}>{row.value}</Text>
                </View>
              ))
            : null}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <PrimaryButton
            label="Continue"
            onPress={() => setView((current) => continueFromNutritionTarget(current))}
          />
        </>
      ) : null}

      <MealPreferenceSteps
        view={view}
        onChange={setView}
        onComplete={setView}
        persistError={persistError}
      />
      <CookingPreferenceSteps
        view={view}
        onChange={setView}
        onComplete={(next) => {
          void persistResult(next);
        }}
        busy={busy}
        persistError={persistError}
      />
    </ScrollView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  keyboard?: "default" | "numeric";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChange}
        keyboardType={props.keyboard ?? "default"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.md, backgroundColor: colors.background },
  title: { ...typography.heading, color: colors.text },
  help: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  label: { ...typography.bodyStrong, color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
  },
  row: { flexDirection: "row", gap: spacing.sm },
  choice: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceText: { fontWeight: "700", color: colors.text, textTransform: "capitalize" },
  option: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: spacing.lg,
  },
  optionLabel: { fontWeight: "700", color: colors.text, fontSize: 16 },
  optionDetail: { color: colors.textSecondary, marginTop: 4 },
  primary: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryText: { color: colors.textOnDark, fontWeight: "700" },
  error: { color: colors.error },
  kicker: { ...typography.label, color: colors.textMuted, textTransform: "uppercase" },
  rmrValue: { ...typography.metric, color: colors.text, fontSize: 36, lineHeight: 42 },
  goalValue: { ...typography.subheading, color: colors.text, marginBottom: spacing.sm },
  source: { ...typography.bodyStrong, color: colors.primary },
  secondary: { paddingVertical: spacing.sm },
  secondaryText: { color: colors.primary, fontWeight: "700" },
  explainRow: { gap: 2 },
  explainLabel: { color: colors.textSecondary, fontWeight: "600" },
  explainValue: { color: colors.text },
  summaryBlock: { gap: spacing.sm },
});
