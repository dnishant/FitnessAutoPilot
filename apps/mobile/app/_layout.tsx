import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/state/session";

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#F3F7F4" },
          headerTintColor: "#0B1F17",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#F3F7F4" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Fitness Autopilot" }} />
        <Stack.Screen name="auth" options={{ title: "Sign in" }} />
        <Stack.Screen name="onboarding" options={{ title: "Onboarding" }} />
        <Stack.Screen name="preferences" options={{ title: "Food preferences" }} />
        <Stack.Screen name="goal" options={{ title: "Your goal" }} />
        <Stack.Screen name="generate" options={{ title: "Generate plan" }} />
        <Stack.Screen name="today" options={{ title: "Today" }} />
      </Stack>
    </SessionProvider>
  );
}
