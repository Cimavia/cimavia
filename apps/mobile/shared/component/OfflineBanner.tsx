import { useNetworkState } from "expo-network";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CmvText } from "@/shared/component/CmvText";

/**
 * Bandeau « hors-ligne » (p3-5). Le contenu reste affiché — il vient du cache persisté — mais
 * l'athlète doit savoir qu'il consulte des données FIGÉES, arrêtées à son dernier passage.
 *
 * Il ne parle plus des documents depuis #95 : ceux des cycles diffusés sont sur l'appareil, et
 * les annoncer perdus d'avance serait faux. Ce qui manque vraiment se dit à l'endroit exact où
 * ça manque — sous la pièce jointe, à la place de l'image.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const network = useNetworkState();

  // `isInternetReachable` est indéterminé au premier rendu : on ne crie pas « hors-ligne »
  // tant qu'on ne sait pas (un faux positif au démarrage serait pire que pas de bandeau).
  if (network.isInternetReachable !== false) return null;

  return (
    <View className="bg-cmv-warning px-4 py-2">
      <CmvText className="text-center text-cmv-bg-0 text-sm">{t("common.offline")}</CmvText>
    </View>
  );
}
