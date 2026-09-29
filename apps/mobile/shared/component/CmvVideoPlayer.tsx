import { formatMediaDuration } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import { CmvText } from "./CmvText";

// Ce que l'ouverture peut rater, et que l'utilisateur doit voir plutôt que subir.
type OpenFailure = "refresh" | "player";

type ResolveUrl = () => Promise<string | null>;

type CmvVideoPlayerProps = {
  // Durée déclarée à l'envoi, `null` quand l'envoyeur ne l'a pas mesurée.
  durationSeconds: number | null;
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
};

/**
 * Une vidéo : pastille au repos, lecteur plein écran au tap (Modal in-app, #407). Le lecteur système
 * de #151 faisait sortir de l'app — sur le média que le coach regarde le plus longtemps.
 *
 * Le lecteur natif ne vit QUE dans le Modal ouvert : au repos, la pastille n'en instancie aucun. Un
 * fil de vingt vidéos ne coûte donc aucun lecteur, et une vidéo ouverte en coûte un.
 *
 * Composant partagé (messagerie ET débrief) et non copié : c'est ce qui empêche cette famille de
 * rendu de diverger, comme `CmvAudioPlayer`.
 */
export function CmvVideoPlayer({
  durationSeconds,
  resolveUrl,
  containerClassName = "flex-row items-center gap-2",
}: Readonly<CmvVideoPlayerProps>) {
  const { t } = useTranslation();
  // L'URL avec laquelle le lecteur démarre ; `null` = fermé.
  const [source, setSource] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<OpenFailure | null>(null);

  const duration = formatMediaDuration(durationSeconds);

  const open = async () => {
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

      <Modal visible={source != null} animationType="fade" onRequestClose={close}>
        {source == null ? null : (
          <FullscreenVideo source={source} resolveUrl={resolveUrl} onClose={close} onFail={fail} />
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
};

/**
 * Le lecteur ouvert. Il naît sur `source` et n'en change que par `replaceAsync`, quand elle casse.
 *
 * Une URL signée ne vaut que 5 min, et le storage la vérifie à CHAQUE requête : une vidéo en pause
 * au-delà, puis relancée ou déplacée, redemande des octets et reçoit un 403 (V-3). On re-signe
 * alors, et on reprend à la même position — au pire une micro-pause, comme une coupure réseau. Le
 * lecteur système de #151 ne le permettait pas : l'erreur restait hors de l'app.
 */
function FullscreenVideo({ source, resolveUrl, onClose, onFail }: Readonly<FullscreenVideoProps>) {
  const { t } = useTranslation();
  const player = useVideoPlayer(source, (created) => created.play());

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

    const recover = async () => {
      const failed = sourceRef.current;
      const time = player.currentTime;
      const fresh = await resolveUrlRef.current();
      if (cancelled) return;
      // La même URL, encore valide à nos yeux : ce n'est pas l'expiration qui a cassé la lecture
      // (fichier illisible, storage injoignable). La relancer bouclerait sur la même erreur.
      if (fresh == null || fresh === failed) {
        onFailRef.current();
        return;
      }
      sourceRef.current = fresh;
      resumeAtRef.current = time;
      await player.replaceAsync(fresh);
    };

    const subscription = player.addListener("statusChange", ({ status }) => {
      if (status === "error") {
        // Un rejet (re-signature ou chargement) est une panne comme une autre : jamais un écran noir.
        recover().catch(() => {
          if (!cancelled) onFailRef.current();
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
      <VideoView player={player} nativeControls contentFit="contain" style={{ flex: 1 }} />
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
