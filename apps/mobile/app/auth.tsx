import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSession } from "../src/state/session";

export default function AuthScreen() {
  const { signIn, signUp, useLocalMode } = useSession();
  const [email, setEmail] = useState("demo@fitnessautopilot.local");
  const [password, setPassword] = useState("demo-password-123");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(mode: "in" | "up") {
    setBusy(true);
    setError(null);
    const result = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Navigate to the next required step directly to avoid a race with session state.
    router.replace("/onboarding");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Fitness Autopilot</Text>
      <Text style={styles.subtitle}>You set the goal. We manage the process.</Text>

      {useLocalMode ? (
        <Text style={styles.banner}>
          Local planner mode is on. Auth is simulated so you can exercise the
          deterministic meal slice without Supabase credentials.
        </Text>
      ) : null}

      <Text style={styles.label}>Email</Text>
      <TextInput
        autoCapitalize="none"
        keyboardType="email-address"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        secureTextEntry
        style={styles.input}
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.primary} disabled={busy} onPress={() => run("in")}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Sign in</Text>}
      </Pressable>
      <Pressable style={styles.secondary} disabled={busy} onPress={() => run("up")}>
        <Text style={styles.secondaryText}>Create account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 10, justifyContent: "center" },
  brand: { fontSize: 32, fontWeight: "800", color: "#0B1F17" },
  subtitle: { fontSize: 16, color: "#3D5A4C", marginBottom: 12 },
  banner: {
    backgroundColor: "#E4F0E8",
    padding: 12,
    borderRadius: 8,
    color: "#1F6F4A",
    marginBottom: 8,
  },
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
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryText: { color: "#1F6F4A", fontWeight: "600" },
  error: { color: "#9B1C1C" },
});
