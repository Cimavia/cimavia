import { Stack } from "expo-router";

// Ce qu'Expo Router lit d'un layout : de la configuration de navigation, pas de la logique.
export { CmvCrashScreen as ErrorBoundary } from "@/shared/component/CmvCrashScreen";
export const unstable_settings = { initialRouteName: "index" };

export default function RootLayout() {
  const options = { headerShown: false };
  return <Stack screenOptions={options} />;
}
