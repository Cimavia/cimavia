import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { Pressable, View } from "react-native";
import { formatMmSs } from "@/shared/util/time";
import { CmvText } from "./CmvText";

type CmvAudioPlayerProps = {
  // URL GET signée (bucket privé) : la lecture streame depuis le storage, jamais un fichier public.
  url: string;
  // Durée connue (déclarée à l'envoi) : évitée d'attendre le chargement pour l'afficher.
  durationSeconds: number | null;
};

/**
 * Lecteur audio partagé (messagerie, et débrief vocal à venir) : bouton lecture/pause + barre de
 * progression. Composant de design system réutilisable — d'où sa place dans `shared/component`.
 */
export function CmvAudioPlayer({ url, durationSeconds }: Readonly<CmvAudioPlayerProps>) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);

  const total = durationSeconds ?? (status.duration || 0);
  const current = status.currentTime ?? 0;
  const progress = total > 0 ? Math.min(1, current / total) : 0;

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    // Rejouer depuis le début quand la lecture est terminée (sinon `play` ne repart pas).
    if (status.didJustFinish || (total > 0 && current >= total)) {
      player.seekTo(0);
    }
    player.play();
  };

  return (
    <View className="min-w-[160px] flex-row items-center gap-2">
      <Pressable onPress={toggle} hitSlop={8}>
        <Ionicons name={status.playing ? "pause" : "play"} size={22} color={cmvColors.text.hi} />
      </Pressable>
      <View className="h-1 flex-1 overflow-hidden rounded-full bg-cmv-border">
        {/* Largeur dynamique (pourcentage de progression) : valeur, pas une classe — aucune
            couleur ici, juste de la mise en page. */}
        <View className="h-full bg-cmv-text-hi" style={{ width: `${progress * 100}%` }} />
      </View>
      <CmvText className="text-cmv-text-hi text-xs">
        {formatMmSs(status.playing || current > 0 ? current : total)}
      </CmvText>
    </View>
  );
}
