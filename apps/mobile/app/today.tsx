import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  formatRmrKcalPerDay,
  RMR_EXPLANATION,
  rmrHomeSourceLabel,
} from "@fitness-autopilot/domain";
import { useSession } from "../src/state/session";

export default function TodayScreen() {
  const { currentRmr, signOut } = useSession();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Today</Text>
      <Text style={styles.help}>What should I do now? Start from your current RMR.</Text>

      {currentRmr ? (
        <View style={styles.rmrBox}>
          <Text style={styles.rmrLabel}>Resting Metabolic Rate</Text>
          <Text style={styles.rmrValue}>{formatRmrKcalPerDay(currentRmr.rmrKcal)}</Text>
          <Text style={styles.rmrSource}>{rmrHomeSourceLabel(currentRmr.source)}</Text>
          <Text style={styles.rmrMeta}>{RMR_EXPLANATION}</Text>
        </View>
      ) : (
        <View style={styles.rmrBox}>
          <Text style={styles.rmrLabel}>Resting Metabolic Rate</Text>
          <Text style={styles.rmrMeta}>No RMR yet. Complete onboarding to establish one.</Text>
        </View>
      )}

      <Pressable
        style={styles.secondary}
        onPress={async () => {
          await signOut();
          router.replace("/auth");
        }}
      >
        <Text style={styles.secondaryText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  title: { fontSize: 28, fontWeight: "800", color: "#0B1F17" },
  help: { color: "#3D5A4C", marginTop: -8 },
  rmrBox: {
    backgroundColor: "#0B1F17",
    borderRadius: 10,
    padding: 16,
    gap: 6,
  },
  rmrLabel: { color: "#A8C4B4", fontWeight: "600" },
  rmrValue: { color: "#fff", fontSize: 28, fontWeight: "800" },
  rmrSource: { color: "#E4F0E8", fontWeight: "600" },
  rmrMeta: { color: "#A8C4B4", marginTop: 6, fontSize: 13 },
  secondary: { paddingVertical: 10, alignItems: "center" },
  secondaryText: { color: "#1F6F4A", fontWeight: "600" },
});
