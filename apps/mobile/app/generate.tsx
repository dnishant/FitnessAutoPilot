import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../src/state/session";

export default function GenerateScreen() {
  const { generateTodayPlan, nutritionTarget } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await generateTodayPlan();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace("/today");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Build today’s plan</Text>
      <Text style={styles.help}>
        The trusted path runs safety checks, nutrition-target-v1, recipe scoring,
        and deterministic portioning. No AI invents macros.
      </Text>
      {nutritionTarget ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current target</Text>
          <Text style={styles.cardBody}>
            {nutritionTarget.targetCalories} kcal · {nutritionTarget.proteinG} g protein
          </Text>
          <Text style={styles.cardMeta}>{nutritionTarget.algorithmVersion}</Text>
        </View>
      ) : (
        <Text style={styles.help}>A nutrition target will be calculated when you generate.</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.primary} disabled={busy} onPress={submit}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Generate one-day plan</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "800", color: "#0B1F17" },
  help: { color: "#3D5A4C" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: "#C9D9CF",
    gap: 4,
  },
  cardTitle: { fontWeight: "700", color: "#0B1F17" },
  cardBody: { fontSize: 18, color: "#1F6F4A", fontWeight: "700" },
  cardMeta: { color: "#3D5A4C", fontSize: 12 },
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
