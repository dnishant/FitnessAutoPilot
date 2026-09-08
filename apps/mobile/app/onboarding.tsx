import { useState } from "react";
import {
  ActivityIndicator,
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
  continueFromEnergyResult,
  createOnboardingView,
  paceOptionsForGoal,
  pacePromptForGoal,
  submitOnboardingBasics,
  submitOnboardingDexa,
  submitOnboardingGoal,
  submitOnboardingWearableCalories,
  wearableCaloriesFieldLabel,
} from "@fitness-autopilot/domain";
import { useSession } from "../src/state/session";

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

  async function persistResult() {
    if (!user) {
      setPersistError("Not signed in");
      return;
    }
    const result = view.result;
    const calorieTarget = view.calorieTarget;
    if (!result || !calorieTarget) {
      return;
    }
    setBusy(true);
    setPersistError(null);
    const saved = await completeOnboarding({
      dateOfBirth: view.draft.dateOfBirth,
      biologicalSex: view.draft.biologicalSex as RmrBiologicalSex,
      heightCm: Number(view.draft.heightCm),
      weightKg: Number(view.draft.weightKg),
      source: result.source,
      reportedRmrKcal:
        result.source === "user_reported_dexa" ? Number(view.draft.reportedRmrKcal) : undefined,
      reportDate: result.source === "user_reported_dexa" ? view.draft.reportDate : undefined,
      goalType: result.goalType,
      wearable: view.draft.wearable as Wearable,
      wearableCaloriesKcal: Number(view.draft.wearableCaloriesKcal),
      pace: calorieTarget.draft.pace,
    });
    setBusy(false);
    if (!saved.ok) {
      setPersistError(saved.error);
      return;
    }
    router.replace("/today");
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
          <Pressable
            style={styles.primary}
            onPress={() => setView((current) => continueFromEnergyResult(current))}
          >
            <Text style={styles.primaryText}>Continue</Text>
          </Pressable>
        </>
      ) : null}

      {view.step === "pace" && view.result ? (
        <>
          <Text style={styles.title}>{pacePromptForGoal(view.result.goalType)}</Text>
          {paceOptionsForGoal(view.result.goalType).map((option) => (
            <Pressable
              key={option.pace}
              style={styles.option}
              onPress={() =>
                setView((current) => chooseOnboardingPace(current, option.pace as WeightChangePace))
              }
            >
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionDetail}>{option.detail}</Text>
            </Pressable>
          ))}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
        </>
      ) : null}

      {view.step === "calorie_target" && view.calorieTarget ? (
        <>
          <Text style={styles.title}>Your Starting Calorie Target</Text>
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
          <Pressable style={styles.secondary} onPress={() => setShowCalculation((open) => !open)}>
            <Text style={styles.secondaryText}>How was this calculated?</Text>
          </Pressable>
          {showCalculation
            ? view.calorieTarget.explanationRows.map((row) => (
                <View key={row.label} style={styles.explainRow}>
                  <Text style={styles.explainLabel}>{row.label}</Text>
                  <Text style={styles.explainValue}>{row.value}</Text>
                </View>
              ))
            : null}
          {persistError ? <Text style={styles.error}>{persistError}</Text> : null}
          {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
          <Pressable style={styles.primary} disabled={busy} onPress={persistResult}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Continue</Text>
            )}
          </Pressable>
        </>
      ) : null}
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
  container: { padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "800", color: "#0B1F17" },
  help: { color: "#3D5A4C", marginBottom: 8 },
  label: { fontWeight: "600", color: "#0B1F17" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C9D9CF",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { flexDirection: "row", gap: 8 },
  choice: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C9D9CF",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  choiceSelected: { borderColor: "#1F6F4A", backgroundColor: "#E4F0E8" },
  choiceText: { fontWeight: "700", color: "#0B1F17", textTransform: "capitalize" },
  option: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#C9D9CF",
    borderRadius: 8,
    padding: 14,
  },
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
  kicker: { fontSize: 16, fontWeight: "700", color: "#3D5A4C" },
  rmrValue: { fontSize: 36, fontWeight: "800", color: "#0B1F17" },
  goalValue: { fontSize: 24, fontWeight: "800", color: "#0B1F17", marginBottom: 8 },
  source: { fontSize: 16, color: "#1F6F4A", fontWeight: "600" },
  secondary: { paddingVertical: 8 },
  secondaryText: { color: "#1F6F4A", fontWeight: "700" },
  explainRow: { gap: 2 },
  explainLabel: { color: "#3D5A4C", fontWeight: "600" },
  explainValue: { color: "#0B1F17" },
});
