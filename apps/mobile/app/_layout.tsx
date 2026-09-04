import "../global.css";
import "@/shared/lib/sentry";
import "@/shared/lib/i18n";
import "@/shared/lib/notification";
import "@/shared/lib/audio";

import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ExercisedCapabilityProvider } from "@/shared/hook/useExercisedCapability";
import { useSentryUser } from "@/shared/hook/useSentryUser";
import { QueryProvider } from "@/shared/lib/query";
import { navigationTheme } from "@/shared/theme/navigation";

/**
 * Le filet sous les erreurs non maîtrisées, branché par le MÉCANISME d'expo-router : un export
 * nommé `ErrorBoundary` depuis un fichier de route fait envelopper son composant par le `Try` du
 * routeur, qui lui passe `{ error, retry }`.
 *
 * Il enveloppe donc ce layout ENTIER, providers compris — un boundary posé autour du `<Stack>`
 * ci-dessous serait resté à l'intérieur des quatre, et n'aurait rien rattrapé de ce qui casse
 * dedans. Réexport d'une ligne : la règle dure nº4 vaut aussi ici, l'écran vit dans `shared/`.
 */
export { CmvCrashScreen as ErrorBoundary } from "@/shared/component/CmvCrashScreen";

export default function RootLayout() {
  // Le seul composant monté sur TOUTES les routes, écrans d'authentification compris — donc le
  // seul endroit d'où l'identité Sentry suit vraiment la session, ici comme côté web.
  useSentryUser();

  return (
    <QueryProvider>
      <ExercisedCapabilityProvider>
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
      </ExercisedCapabilityProvider>
    </QueryProvider>
  );
}
