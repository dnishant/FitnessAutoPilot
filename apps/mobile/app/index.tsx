import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "../src/state/session";

export default function Index() {
  const { user, profile, currentRmr, loading } = useSession();

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
  if (!profile || !currentRmr) {
    return <Redirect href="/onboarding" />;
  }
  return <Redirect href="/today" />;
}
