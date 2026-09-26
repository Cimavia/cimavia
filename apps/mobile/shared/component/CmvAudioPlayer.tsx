import { formatMmSs } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { type AudioPlayer, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { CmvText } from "./CmvText";

type CmvAudioPlayerProps = {
  // URL GET signée (bucket privé) : la lecture streame depuis le storage, jamais un fichier public.
  url: string;
  // Durée connue (déclarée à l'envoi) : évitée d'attendre le chargement pour l'afficher.
  durationSeconds: number | null;
  /**
   * Rend une URL ouvrable pour ce média — la gardée si elle vaut encore, une re-signée sinon, `null`
   * si le rafraîchissement a échoué. Appelé quand la lecture casse en route (#304) : une note
   * écoutée en pause assez longtemps survit à son URL, et le storage répond 403 à la reprise.
   */
  resolveUrl: () => Promise<string | null>;
};

// Là où la lecture en était quand elle a cassé, et si elle jouait : ce qu'on lui rend.
type Resume = { time: number; play: boolean };

async function resumeAt(player: AudioPlayer, resume: Resume): Promise<void> {
  try {
    await player.seekTo(resume.time);
  } catch {
    // Un saut refusé laisse la note au début : elle repart de zéro plutôt que de rester muette.
  }
  if (resume.play) player.play();
}

/**
 * Lecteur audio partagé (messagerie, débrief) : bouton lecture/pause + barre de progression.
 * Composant de design system réutilisable — d'où sa place dans `shared/component`.
 *
 * Le lecteur naît sur la PREMIÈRE URL et n'en change ensuite que par `replace` (#304) :
 * `useAudioPlayer` recrée son lecteur à chaque source, et chaque rechargement du fil re-signait
 * les médias — la note repartait de zéro. Une URL neuve n'est adoptée qu'au repos ; en route, le
 * lecteur garde la sienne et ne la remplace que si elle casse, à la même position.
 */
export function CmvAudioPlayer({
  url,
  durationSeconds,
  resolveUrl,
}: Readonly<CmvAudioPlayerProps>) {
  const { t } = useTranslation();
  const [initialUrl] = useState(url);
  const player = useAudioPlayer(initialUrl);
  const status = useAudioPlayerStatus(player);
  const [unavailable, setUnavailable] = useState(false);

  // L'URL que le lecteur lit VRAIMENT — plus forcément celle des props.
  const sourceRef = useRef(initialUrl);
  // L'intention de l'utilisateur : `status.playing` retombe à `false` dès que la lecture casse.
  const wantsPlayRef = useRef(false);
  const resumeRef = useRef<Resume | null>(null);
  // Le résolveur change à chaque rendu (flèche de l'écran) : lu par ref, il ne relance rien.
  const resolveUrlRef = useRef(resolveUrl);
  resolveUrlRef.current = resolveUrl;

  const load = useCallback(
    (source: string, resume: Resume) => {
      sourceRef.current = source;
      resumeRef.current = resume;
      player.replace(source);
    },
    [player],
  );

  // (A) Une URL neuve n'est adoptée qu'au repos : en lecture, ou en pause à mi-chemin, la prendre
  // rechargerait la note — la coupure même de #304.
  useEffect(() => {
    if (url === sourceRef.current || player.playing || player.currentTime > 0) return;
    sourceRef.current = url;
    player.replace(url);
  }, [url, player]);

  // (B) La lecture a cassé : on re-signe, et on reprend là où elle en était.
  useEffect(() => {
    if (status.error == null) return;
    const failed = sourceRef.current;
    const resume = { time: player.currentTime, play: wantsPlayRef.current };
    // Démonté (ou une autre erreur arrivée) pendant la re-signature : ce lecteur-ci n'est plus à
    // recharger.
    let cancelled = false;
    void resolveUrlRef.current().then((fresh) => {
      if (cancelled) return;
      // La même URL, encore valide à nos yeux : ce n'est pas l'expiration qui a cassé la lecture.
      // La relancer d'office bouclerait sur la même erreur ; c'est à l'utilisateur de réessayer.
      if (fresh == null || fresh === failed) {
        setUnavailable(true);
        return;
      }
      load(fresh, resume);
    });
    return () => {
      cancelled = true;
    };
  }, [status.error, player, load]);

  // La nouvelle source est prête : c'est seulement là qu'iOS accepte le saut.
  useEffect(() => {
    const resume = resumeRef.current;
    if (!status.isLoaded || resume == null) return;
    resumeRef.current = null;
    void resumeAt(player, resume);
  }, [status.isLoaded, player]);

  const total = durationSeconds ?? (status.duration || 0);
  const current = status.currentTime ?? 0;
  const progress = total > 0 ? Math.min(1, current / total) : 0;

  const retry = async () => {
    setUnavailable(false);
    const resume = { time: player.currentTime, play: true };
    const fresh = await resolveUrl();
    if (fresh == null) {
      setUnavailable(true);
      return;
    }
    // Ici la même URL est rechargée : c'est un geste de l'utilisateur, pas une boucle.
    load(fresh, resume);
  };

  const toggle = () => {
    if (unavailable) {
      wantsPlayRef.current = true;
      void retry();
      return;
    }
    if (status.playing) {
      wantsPlayRef.current = false;
      player.pause();
      return;
    }
    // Rejouer depuis le début quand la lecture est terminée (sinon `play` ne repart pas).
    if (status.didJustFinish || (total > 0 && current >= total)) {
      player.seekTo(0);
    }
    wantsPlayRef.current = true;
    player.play();
  };

  return (
    <View className="gap-1">
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
      {unavailable ? (
        <CmvText className="text-cmv-error text-xs">{t("media.audio.unavailable")}</CmvText>
      ) : null}
    </View>
  );
}
