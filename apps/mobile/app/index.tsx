import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { authClient } from "@/shared/lib/auth";

// Gate de session : aiguille vers le planning (connecté) ou le login (déconnecté).
export default function Index() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-cmv-bg-0">
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={session == null ? "/login" : "/planning"} />;
}
