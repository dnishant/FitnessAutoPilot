import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "../src/state/session";

export default function Index() {
  const { user, profile, goal, loading } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#1F6F4A" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/auth" />;
  }
  if (!profile) {
    return <Redirect href="/onboarding" />;
  }
  if (!goal) {
    return <Redirect href="/goal" />;
  }
  return <Redirect href="/today" />;
}
