import "../global.css";
import "@/shared/lib/i18n";
import "@/shared/lib/notification";

import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryProvider } from "@/shared/lib/query";
import { navigationTheme } from "@/shared/theme/navigation";

export default function RootLayout() {
  return (
    <QueryProvider>
      <SafeAreaProvider>
        {/* Sans ce thème, le fond des écrans natifs reste BLANC sous nos vues sombres. */}
        <ThemeProvider value={navigationTheme}>
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
      </SafeAreaProvider>
    </QueryProvider>
  );
}
