import { formatMediaDuration } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { CmvText } from "./CmvText";

// Ce que l'ouverture peut rater, et que l'utilisateur doit voir plutôt que subir.
type OpenFailure = "refresh" | "player";

type CmvVideoLinkProps = {
  // Durée déclarée à l'envoi, `null` quand l'envoyeur ne l'a pas mesurée.
  durationSeconds: number | null;
  /**
   * Rend une URL GET signée ouvrable — celle du cache si elle est encore valide, une re-signée
   * sinon, `null` si le rafraîchissement a échoué. Il n'y a PAS de prop `url` : celle du cache peut
   * être périmée, et l'ouvrir sans la vérifier mène au 403 du storage. Obligatoire depuis #304 : la messagerie s'en passait parce que son
   * fil sondé toutes les 10 s renouvelait l'URL ; il la GARDE désormais jusqu'au bord du TTL.
   */
  resolveUrl: () => Promise<string | null>;
  // Mise en page de la pastille (pastille en ligne, tuile carrée, bloc pleine largeur).
  containerClassName?: string;
};

/**
 * Une vidéo, ouverte dans le LECTEUR SYSTÈME du téléphone (#151).
 *
 * Pas de lecture en ligne : elle demanderait `expo-video`, donc un module natif, donc un nouveau
 * client de dev en plus de l'APK preview — pour une vidéo plafonnée à 3 min. Le manque résiduel
 * face au web, qui lit en ligne, est écrit en dette V-1. Composant partagé (messagerie ET débrief)
 * et non copié : c'est ce qui empêche cette famille de rendu de diverger, comme `CmvAudioPlayer`.
 */
export function CmvVideoLink({
  durationSeconds,
  resolveUrl,
  containerClassName = "flex-row items-center gap-2",
}: Readonly<CmvVideoLinkProps>) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<OpenFailure | null>(null);

  const duration = formatMediaDuration(durationSeconds);

  const open = async () => {
    setFailure(null);
    setOpening(true);
    try {
      // Une URL périmée s'ouvre SANS erreur : `openURL` réussit (le navigateur s'est bien lancé) et
      // c'est le storage qui répond 403 en XML brut. D'où le refus d'ouvrir plutôt que la tentative.
      const target = await resolveUrl();
      if (target == null) {
        setFailure("refresh");
        return;
      }
      await Linking.openURL(target);
    } catch {
      setFailure("player");
    } finally {
      setOpening(false);
    }
  };

  return (
    <View className="gap-1">
      <Pressable onPress={open} disabled={opening} className={containerClassName}>
        {opening ? (
          <ActivityIndicator color={cmvColors.text.hi} />
        ) : (
          <Ionicons name="play-circle" size={22} color={cmvColors.text.hi} />
        )}
        <CmvText className="text-cmv-text-hi">{t("media.video.label")}</CmvText>
        {duration == null ? null : (
          <CmvText className="text-cmv-text-mid text-xs">{duration}</CmvText>
        )}
      </Pressable>

      {failure == null ? null : (
        <CmvText className="text-cmv-error text-xs">
          {failure === "refresh" ? t("media.video.refreshError") : t("media.video.openError")}
        </CmvText>
      )}
    </View>
  );
}
