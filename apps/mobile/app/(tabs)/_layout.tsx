import { Tabs } from "expo-router";
import { colors, typography } from "../../src/theme/tokens";

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="today"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: () => null,
        tabBarIconStyle: { display: "none" },
        tabBarStyle: {
          backgroundColor: colors.backgroundElevated,
          borderTopColor: colors.border,
          height: 56,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          ...typography.caption,
          fontWeight: "700",
          fontSize: 13,
        },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="today" options={{ title: "Today", tabBarLabel: "Today" }} />
      <Tabs.Screen name="plan" options={{ title: "Plan", tabBarLabel: "Plan" }} />
      <Tabs.Screen name="grocery" options={{ title: "Grocery", tabBarLabel: "Grocery" }} />
      <Tabs.Screen name="you" options={{ title: "You", tabBarLabel: "You" }} />
    </Tabs>
  );
}
