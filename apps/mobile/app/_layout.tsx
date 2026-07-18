import "../global.css";
import "@/shared/lib/i18n";
import "@/shared/lib/notification";

import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryProvider } from "@/shared/lib/query";
import { navigationTheme } from "@/shared/theme/navigation";

export default function RootLayout() {
  return (
    <QueryProvider>
      <SafeAreaProvider>
        {/* Gère le clavier de façon fiable sous Android edge-to-edge (SDK 56), là où le
            KeyboardAvoidingView de React Native ne suffit pas. Requis par la messagerie. */}
        <KeyboardProvider>
          {/* Sans ce thème, le fond des écrans natifs reste BLANC sous nos vues sombres. */}
          <ThemeProvider value={navigationTheme}>
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </QueryProvider>
  );
}
