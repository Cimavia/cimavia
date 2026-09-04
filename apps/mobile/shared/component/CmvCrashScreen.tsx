import { translatedOr } from "@cmv/shared";
import * as Sentry from "@sentry/react-native";
import type { ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CmvButton } from "./CmvButton";
import { CmvText } from "./CmvText";

/**
 * Ce qui s'affiche quand une erreur NON MAÎTRISÉE démonte l'arbre React — à ne pas confondre avec
 * `CmvErrorState`, qui parle d'un chargement raté. Sans ce filet, l'app se FERME : l'utilisateur
 * revient à l'écran d'accueil de son téléphone, et nous ne voyons rien (#183).
 *
 * Il est branché par un export nommé `ErrorBoundary` depuis `app/_layout.tsx` — le mécanisme
 * d'expo-router, qui enveloppe le layout dans son `Try`. Ce détail décide de la portée : le
 * boundary se place AUTOUR du layout, donc un crash dans `QueryProvider`,
 * `ExercisedCapabilityProvider`, `SafeAreaProvider` ou `ThemeProvider` est rattrapé aussi. Un
 * boundary posé autour du `<Stack>` serait resté à l'intérieur de ces quatre-là.
 *
 * Corollaire : quand il rend, AUCUN de ces providers n'est monté. Il ne s'appuie donc que sur des
 * primitives React Native et sur l'instance i18next globale, initialisée à l'import du module.
 *
 * `retry` est ici la seule réparation disponible, contrairement au web qui recharge sa page : il
 * n'y a pas d'équivalent d'un F5 sans `expo-updates`. Il re-monte l'arbre — ce qui suffit quand la
 * cause était une donnée transitoire, et pas sinon.
 */
export function CmvCrashScreen({ error, retry }: Readonly<ErrorBoundaryProps>) {
  const { t } = useTranslation();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-cmv-bg-0 p-6">
      <CmvText className="text-center text-cmv-text-hi text-lg">
        {translatedOr(
          t("common.crash.title"),
          "common.crash.title",
          "L'app a rencontré un problème",
        )}
      </CmvText>
      <CmvText className="text-center text-cmv-text-mid text-sm">
        {translatedOr(
          t("common.crash.description"),
          "common.crash.description",
          "L'incident nous a été signalé. Réessaie pour reprendre où tu en étais.",
        )}
      </CmvText>
      <CmvButton
        label={translatedOr(t("common.crash.retry"), "common.crash.retry", "Réessayer")}
        onPress={() => {
          void retry();
        }}
      />
    </View>
  );
}
