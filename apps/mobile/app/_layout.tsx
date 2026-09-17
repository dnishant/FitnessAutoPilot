import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/state/session";
import { colors } from "../src/theme/tokens";

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Fitness Autopilot" }} />
        <Stack.Screen name="auth" options={{ title: "Sign in" }} />
        <Stack.Screen name="onboarding" options={{ title: "Onboarding" }} />
        <Stack.Screen name="preferences" options={{ title: "Food preferences" }} />
        <Stack.Screen name="cooking-preferences" options={{ title: "Cooking preferences" }} />
        <Stack.Screen name="goal" options={{ title: "Your goal" }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="generate" options={{ title: "Build your week" }} />
        <Stack.Screen
          name="meal/[day]/[mealType]"
          options={{ title: "Meal" }}
        />
        <Stack.Screen name="recipe/[candidateId]" options={{ title: "Recipe" }} />
        <Stack.Screen name="developer/index" options={{ title: "Developer" }} />
        <Stack.Screen name="recipe-preview" options={{ title: "Recipe Preview" }} />
        <Stack.Screen
          name="weekly-strategy-preview"
          options={{ title: "Weekly Strategy Preview" }}
        />
        <Stack.Screen
          name="culinary-discovery-preview"
          options={{ title: "Culinary Discovery" }}
        />
        <Stack.Screen
          name="candidate-ranking-preview"
          options={{ title: "Candidate Ranking" }}
        />
        <Stack.Screen
          name="recipe-resolution-preview"
          options={{ title: "Recipe Resolution" }}
        />
        <Stack.Screen
          name="food-resolution-preview"
          options={{ title: "Food Resolution" }}
        />
        <Stack.Screen
          name="meal-composition-preview"
          options={{ title: "Meal Composition" }}
        />
      </Stack>
    </SessionProvider>
  );
}
