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
import type { UserProfile } from "@fitness-autopilot/contracts";
import { useSession } from "../src/state/session";

export default function OnboardingScreen() {
  const { saveProfile, user } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateOfBirth, setDob] = useState("1990-06-15");
  const [heightCm, setHeight] = useState("165");
  const [weightKg, setWeight] = useState("70");
  const [allergies, setAllergies] = useState("");
  const [disliked, setDisliked] = useState("");
  const [preferred, setPreferred] = useState("chicken");
  const [cuisines, setCuisines] = useState("indian, american");

  async function submit() {
    if (!user) {
      setError("Not signed in");
      return;
    }
    setBusy(true);
    setError(null);
    const profile: UserProfile = {
      userId: user.id,
      dateOfBirth,
      biologicalSex: "female",
      heightCm: Number(heightCm),
      weightKg: Number(weightKg),
      fitnessExperience: "intermediate",
      dietaryPreference: "omnivore",
      cuisinePreferences: cuisines
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      allergies: allergies
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      dislikedFoods: disliked
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      preferredFoods: preferred
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      mealPrepAvailability: "weekends",
      cookingSkill: "intermediate",
      cookingEquipment: ["stovetop", "microwave", "blender"],
      maxMealPrepMinutes: 45,
      safetyRestrictions: [],
    };
    const result = await saveProfile(profile);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace("/goal");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Tell us about you</Text>
      <Text style={styles.help}>
        We use this for deterministic calorie targets and recipe filtering — not
        for a metrics dashboard.
      </Text>

      <Field label="Date of birth (YYYY-MM-DD)" value={dateOfBirth} onChange={setDob} />
      <Field label="Height (cm)" value={heightCm} onChange={setHeight} keyboard="numeric" />
      <Field label="Weight (kg)" value={weightKg} onChange={setWeight} keyboard="numeric" />
      <Field label="Cuisine preferences (comma-separated)" value={cuisines} onChange={setCuisines} />
      <Field label="Preferred foods" value={preferred} onChange={setPreferred} />
      <Field label="Allergies (hard exclusions)" value={allergies} onChange={setAllergies} />
      <Field label="Disliked foods (hard exclusions)" value={disliked} onChange={setDisliked} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.primary} disabled={busy} onPress={submit}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Continue</Text>}
      </Pressable>
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
