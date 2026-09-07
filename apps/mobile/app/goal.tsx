import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import type { GoalType } from "@fitness-autopilot/contracts";
import { useSession } from "../src/state/session";

const OPTIONS: { type: GoalType; label: string; detail: string }[] = [
  { type: "fat_loss", label: "Fat loss", detail: "Modest calorie deficit" },
  { type: "muscle_gain", label: "Muscle gain", detail: "Modest surplus" },
  { type: "recomposition", label: "Recomposition", detail: "Near maintenance" },
  { type: "general_fitness", label: "General fitness", detail: "Maintenance focus" },
];

export default function GoalScreen() {
  const { saveGoal } = useSession();
  const [selected, setSelected] = useState<GoalType>("fat_loss");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const result = await saveGoal({
      goalType: selected,
      startDate: today,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace("/generate");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>What should we optimize for?</Text>
      <Text style={styles.help}>
        Goals are versioned historically. Changing later creates a new goal — it
        does not erase the previous one.
      </Text>
      {OPTIONS.map((option) => (
        <Pressable
          key={option.type}
          style={[styles.option, selected === option.type && styles.optionSelected]}
          onPress={() => setSelected(option.type)}
        >
          <Text style={styles.optionLabel}>{option.label}</Text>
          <Text style={styles.optionDetail}>{option.detail}</Text>
        </Pressable>
      ))}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.primary} disabled={busy} onPress={submit}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Save goal</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 10 },
  title: { fontSize: 24, fontWeight: "800", color: "#0B1F17" },
  help: { color: "#3D5A4C", marginBottom: 8 },
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
