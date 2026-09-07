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
import type { RmrBiologicalSex } from "@fitness-autopilot/contracts";
import {
  chooseOnboardingRmrSource,
  createOnboardingView,
  submitOnboardingBasics,
  submitOnboardingDexa,
} from "@fitness-autopilot/domain";
import { useSession } from "../src/state/session";

export default function OnboardingScreen() {
  const { completeRmrOnboarding, user } = useSession();
  const [view, setView] = useState(() => createOnboardingView());
  const [busy, setBusy] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

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
    if (!result) {
      return;
    }
    setBusy(true);
    setPersistError(null);
    const saved = await completeRmrOnboarding({
      dateOfBirth: view.draft.dateOfBirth,
      biologicalSex: view.draft.biologicalSex as RmrBiologicalSex,
      heightCm: Number(view.draft.heightCm),
      weightKg: Number(view.draft.weightKg),
      source: result.source,
      reportedRmrKcal:
        result.source === "user_reported_dexa" ? Number(view.draft.reportedRmrKcal) : undefined,
      reportDate: result.source === "user_reported_dexa" ? view.draft.reportDate : undefined,
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
          <Text style={styles.kicker}>Resting Metabolic Rate</Text>
          <Text style={styles.rmrValue}>{view.result.formattedRmr}</Text>
          <Text style={styles.source}>{view.result.sourceLabel}</Text>
          <Text style={styles.help}>{view.result.explanation}</Text>
          {persistError ? <Text style={styles.error}>{persistError}</Text> : null}
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
  source: { fontSize: 16, color: "#1F6F4A", fontWeight: "600" },
});
