import { useNetworkState } from "expo-network";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { CmvText } from "@/shared/component/CmvText";
import { formatDateTime } from "@/shared/util/date.util";

type OfflineBannerProps = {
  /**
   * Quand le contenu affiché a été récupéré, en ISO. Absent ou `null` : l'écran ne le sait pas, et
   * le bandeau garde son message générique plutôt que d'inventer une date.
   */
  savedAt?: string | null;
};

/**
 * Bandeau « hors-ligne » (p3-5). Le contenu reste affiché — il vient du cache persisté — mais
 * l'athlète doit savoir qu'il consulte des données FIGÉES, arrêtées à son dernier passage.
 *
 * Il ne parle plus des documents depuis #95 : ceux des cycles diffusés sont sur l'appareil, et
 * les annoncer perdus d'avance serait faux. Ce qui manque vraiment se dit à l'endroit exact où
 * ça manque — sous la pièce jointe, à la place de l'image.
 *
 * Il DATE ce qu'il montre quand l'écran le sait (#307) : « ton dernier passage » ne distinguait
 * pas une séance récupérée hier soir d'une séance de la semaine dernière, et l'athlète en salle
 * n'a pas d'autre moyen de juger si le coach a pu la retoucher depuis.
 */
export function OfflineBanner({ savedAt = null }: Readonly<OfflineBannerProps>) {
  const { t } = useTranslation();
  const network = useNetworkState();

  // `isInternetReachable` est indéterminé au premier rendu : on ne crie pas « hors-ligne »
  // tant qu'on ne sait pas (un faux positif au démarrage serait pire que pas de bandeau).
  if (network.isInternetReachable !== false) return null;

  return (
    <View className="bg-cmv-warning px-4 py-2">
      <CmvText className="text-center text-cmv-bg-0 text-sm">
        {savedAt == null
          ? t("common.offline")
          : t("common.offlineSavedAt", { date: formatDateTime(savedAt) })}
      </CmvText>
    </View>
  );
}
