import {
  formatMediaDuration,
  openVideoPlayback,
  trackVideoPlayback,
  type VideoPlaybackEvent,
  type VideoPlaybackTimeline,
  videoPlaybackReport,
} from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, type VideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Image, Modal, Pressable, View } from "react-native";
import { useVideoThumbnail } from "@/shared/hook/useVideoThumbnail";
import {
  currentNetworkType,
  reportPlaybackError,
  reportSlowVideo,
} from "@/shared/lib/playback-report";
import { suspendVideoThumbnails } from "@/shared/lib/video-thumbnail";
import { CmvText } from "./CmvText";

// Ce que l'ouverture peut rater, et que l'utilisateur doit voir plutôt que subir.
type OpenFailure = "refresh" | "player";

type ResolveUrl = () => Promise<string | null>;

type CmvVideoPlayerProps = {
  // Clé de la vignette sur l'appareil : l'id du message, ou du média de débrief.
  mediaId: string;
  // Durée déclarée à l'envoi, `null` quand l'envoyeur ne l'a pas mesurée.
  durationSeconds: number | null;
  // Poids du fichier : avec la durée, il donne le débit qu'une lecture lente remonte (#809).
  sizeBytes: number | null;
  /**
   * Rend une URL GET signée ouvrable — celle du cache si elle est encore valide, une re-signée
   * sinon, `null` si le rafraîchissement a échoué. Il n'y a PAS de prop `url` : celle du cache peut
   * être périmée, et l'ouvrir sans la vérifier mène au 403 du storage (#151). C'est aussi ce qui
   * fige la source du lecteur ouvert : le fil sondé toutes les 10 s (#304) n'a aucune prop à lui
   * réécrire.
   */
  resolveUrl: ResolveUrl;
  // Mise en page de la pastille (pastille en ligne, tuile carrée, bloc pleine largeur).
  containerClassName?: string;
  // Cadre de la vignette, quand elle existe. Par défaut celui de la bulle de la maquette : 16/10.
  thumbnailClassName?: string;
};

/**
 * Une vidéo : vignette au repos (#92, #155) — la pastille tant qu'elle n'existe pas, ou si elle n'a
 * pas pu être tirée —, lecteur plein écran au tap (Modal in-app, #407). Le lecteur système de #151
 * faisait sortir de l'app — sur le média que le coach regarde le plus longtemps.
 *
 * Le lecteur natif ne vit QUE dans le Modal ouvert : au repos, la pastille n'en instancie aucun. Un
 * fil de vingt vidéos ne coûte donc aucun lecteur, et une vidéo ouverte en coûte un.
 *
 * Composant partagé (messagerie ET débrief) et non copié : c'est ce qui empêche cette famille de
 * rendu de diverger, comme `CmvAudioPlayer`.
 */
export function CmvVideoPlayer({
  mediaId,
  durationSeconds,
  sizeBytes,
  resolveUrl,
  containerClassName = "flex-row items-center gap-2",
  thumbnailClassName = "h-[120px] w-48 overflow-hidden rounded-lg",
}: Readonly<CmvVideoPlayerProps>) {
  const { t } = useTranslation();
  const thumbnail = useVideoThumbnail(mediaId, resolveUrl, durationSeconds);
  // L'URL avec laquelle le lecteur démarre ; `null` = fermé.
  const [source, setSource] = useState<string | null>(null);
  // L'instant du geste : l'attente qu'on mesure commence là, re-signature comprise.
  const openedAtRef = useRef(0);
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<OpenFailure | null>(null);

  const duration = formatMediaDuration(durationSeconds);

  const open = async () => {
    openedAtRef.current = Date.now();
    setFailure(null);
    setOpening(true);
    try {
      // Vérifiée AVANT d'ouvrir : une URL périmée donnerait un lecteur noir, sans un mot.
      const target = await resolveUrl();
      if (target == null) {
        setFailure("refresh");
        return;
      }
      setSource(target);
    } catch {
      setFailure("refresh");
    } finally {
      setOpening(false);
    }
  };

  const close = () => setSource(null);

  const fail = () => {
    setSource(null);
    setFailure("player");
  };

  return (
    <View className="gap-1">
      {thumbnail == null ? (
        <Pressable
          onPress={open}
          disabled={opening}
          accessibilityRole="button"
          className={containerClassName}
        >
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
      ) : (
        <Pressable
          onPress={open}
          disabled={opening}
          accessibilityRole="button"
          // La durée dessinée sur la vignette s'annonce aussi : la pastille sans vignette la dit
          // par son texte, et la même vidéo ne doit pas perdre sa durée en gagnant une image.
          accessibilityLabel={
            duration == null
              ? t("media.video.label")
              : t("media.video.labelWithDuration", { duration })
          }
          className={thumbnailClassName}
        >
          {/* `cover` : une vignette sert à RECONNAÎTRE la vidéo, pas à la voir entière — le plein
              écran, lui, est en `contain`. */}
          <Image source={{ uri: thumbnail }} className="h-full w-full" resizeMode="cover" />
          <View className="absolute inset-0 items-center justify-center">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-cmv-bg-0/70">
              {opening ? (
                <ActivityIndicator color={cmvColors.text.hi} />
              ) : (
                <Ionicons name="play" size={18} color={cmvColors.text.hi} />
              )}
            </View>
          </View>
          {/* La durée reste, par-dessus : elle dit ce qu'on s'apprête à regarder. */}
          {duration == null ? null : (
            <View className="absolute right-2 bottom-2 rounded bg-cmv-bg-0/70 px-1.5 py-0.5">
              <CmvText className="text-cmv-text-hi text-xs">{duration}</CmvText>
            </View>
          )}
        </Pressable>
      )}

      {failure == null ? null : (
        <CmvText className="text-cmv-error-on text-xs">
          {failure === "refresh" ? t("media.video.refreshError") : t("media.video.openError")}
        </CmvText>
      )}

      <Modal visible={source != null} animationType="fade" onRequestClose={close}>
        {source == null ? null : (
          <FullscreenVideo
            source={source}
            resolveUrl={resolveUrl}
            onClose={close}
            onFail={fail}
            measure={{ openedAtMs: openedAtRef.current, sizeBytes, durationSeconds }}
          />
        )}
      </Modal>
    </View>
  );
}

type FullscreenVideoProps = {
  source: string;
  resolveUrl: ResolveUrl;
  onClose: () => void;
  // La lecture est perdue pour de bon : on ferme, et la pastille dit pourquoi.
  onFail: () => void;
  measure: PlaybackMeasure;
};

type PlaybackMeasure = {
  openedAtMs: number;
  sizeBytes: number | null;
  durationSeconds: number | null;
};

/**
 * Le relevé d'une lecture (#809), remonté à la fermeture s'il a été lent. Figé à la naissance du
 * lecteur, comme sa source : le fil sondé ne le réécrit pas.
 *
 * Rend le rappel de la première image, que seule la VUE connaît : `playingChange` peut précéder
 * l'abonnement, et ne dit pas qu'une image est à l'écran.
 */
function usePlaybackMeasure(player: VideoPlayer, measure: PlaybackMeasure): () => void {
  const measureRef = useRef(measure);
  const timelineRef = useRef<VideoPlaybackTimeline | null>(null);
  timelineRef.current ??= openVideoPlayback(measure.openedAtMs);

  const track = useCallback((type: VideoPlaybackEvent["type"]) => {
    if (timelineRef.current == null) return;
    timelineRef.current = trackVideoPlayback(timelineRef.current, { type, atMs: Date.now() });
  }, []);

  useEffect(() => {
    // Lu à l'ouverture : c'est le lien sur lequel la vidéo démarre, pas celui où on la ferme.
    const network = currentNetworkType();
    const status = player.addListener("statusChange", ({ status: next }) => {
      if (next === "loading") track("loading");
      else if (next === "readyToPlay") track("ready");
    });
    const playing = player.addListener("playingChange", ({ isPlaying }) => {
      if (isPlaying) track("ready");
    });

    return () => {
      status.remove();
      playing.remove();
      // Fermé, ou perdu : c'est la fin de cette lecture, et le seul moment où son coût est connu.
      const timeline = timelineRef.current;
      if (timeline == null) return;
      const { sizeBytes, durationSeconds } = measureRef.current;
      const report = videoPlaybackReport(timeline, Date.now(), sizeBytes, durationSeconds);
      if (report != null) void network.then((type) => reportSlowVideo(report, type));
    };
  }, [player, track]);

  return useCallback(() => track("firstFrame"), [track]);
}

/**
 * Le lecteur ouvert. Il naît sur `source` et n'en change que par `replaceAsync`, quand elle casse.
 *
 * Une URL signée ne vaut que 5 min, et le storage la vérifie à CHAQUE requête : une vidéo en pause
 * au-delà, puis relancée ou déplacée, redemande des octets et reçoit un 403 (V-3). On re-signe
 * alors, et on reprend à la même position — au pire une micro-pause, comme une coupure réseau. Le
 * lecteur système de #151 ne le permettait pas : l'erreur restait hors de l'app.
 */
function FullscreenVideo({
  source,
  resolveUrl,
  onClose,
  onFail,
  measure,
}: Readonly<FullscreenVideoProps>) {
  const { t } = useTranslation();
  const player = useVideoPlayer(source, (created) => created.play());
  const onFirstFrameRender = usePlaybackMeasure(player, measure);
  // Les vignettes en attente tireraient sur le lien de la vidéo : elles attendent la fermeture.
  useEffect(() => suspendVideoThumbnails(), []);

  // L'URL que le lecteur lit VRAIMENT — plus forcément `source`.
  const sourceRef = useRef(source);
  // Position à rendre une fois la nouvelle source prête : c'est seulement là qu'iOS accepte le saut.
  const resumeAtRef = useRef<number | null>(null);
  // Changent à chaque rendu (flèches de l'écran) : lus par ref, ils ne réabonnent rien.
  const resolveUrlRef = useRef(resolveUrl);
  resolveUrlRef.current = resolveUrl;
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;

  useEffect(() => {
    // Fermé (ou une autre erreur arrivée) pendant la re-signature : ce lecteur-ci n'est plus à
    // recharger.
    let cancelled = false;

    /**
     * La lecture est perdue : c'est CE cas qui remonte à Sentry (#809), avec ce que le natif a
     * répondu — on ne savait pas si la vidéo cassait sur un 403, un délai dépassé ou le réseau. Un
     * 403 rattrapé par la re-signature est la routine du TTL (V-3) : le remonter noierait les
     * vraies pannes.
     */
    const lose = (nativeMessage: string | null, url: string) => {
      reportPlaybackError("Lecture d'une vidéo échouée", nativeMessage, url);
      onFailRef.current();
    };

    const recover = async (nativeMessage: string | null) => {
      const failed = sourceRef.current;
      const time = player.currentTime;
      const fresh = await resolveUrlRef.current();
      if (cancelled) return;
      // La même URL, encore valide à nos yeux : ce n'est pas l'expiration qui a cassé la lecture
      // (fichier illisible, storage injoignable). La relancer bouclerait sur la même erreur.
      if (fresh == null || fresh === failed) {
        lose(nativeMessage, failed);
        return;
      }
      sourceRef.current = fresh;
      resumeAtRef.current = time;
      await player.replaceAsync(fresh);
    };

    const subscription = player.addListener("statusChange", ({ status, error }) => {
      if (status === "error") {
        const nativeMessage = error?.message ?? null;
        // Un rejet (re-signature ou chargement) est une panne comme une autre : jamais un écran noir.
        recover(nativeMessage).catch(() => {
          if (!cancelled) lose(nativeMessage, sourceRef.current);
        });
        return;
      }
      const time = resumeAtRef.current;
      if (status !== "readyToPlay" || time == null) return;
      resumeAtRef.current = null;
      player.currentTime = time;
      // Toujours relancer : après 5 min de pause, seul un geste (lecture, saut) redemande des
      // octets — et ce geste demandait la lecture.
      player.play();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [player]);

  return (
    <View className="flex-1 bg-cmv-bg-0">
      {/* La surface par défaut d'expo-video : rien n'a justifié d'en changer (cf. dette V-1).
          `contain` : agrandir sert à VOIR le geste, un recadrage le rognerait. Le bouton plein
          écran natif reste : l'app est verrouillée en portrait, et c'est lui qui laisse voir en
          grand une vidéo tournée en paysage. */}
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        style={{ flex: 1 }}
        onFirstFrameRender={onFirstFrameRender}
      />
      <Pressable
        onPress={onClose}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t("media.video.close")}
        className="absolute top-12 right-4"
      >
        <Ionicons name="close" size={30} color={cmvColors.text.hi} />
      </Pressable>
    </View>
  );
}
