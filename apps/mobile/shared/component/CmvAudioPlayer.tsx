import { formatMmSs, type VoiceNoteCue } from "@cmv/shared";
import { cmvColors } from "@cmv/tokens";
import { Ionicons } from "@expo/vector-icons";
import { type AudioPlayer, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { voiceNoteFocus } from "@/shared/lib/voice-note-focus";
import { CmvSeekBar } from "./CmvSeekBar";
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
  /**
   * Ce que la liste dit à cette note pour l'enchaîner aux autres (#529). Absent, le lecteur joue
   * seul : rien ne le lance, et sa fin ne lance rien.
   */
  cue?: VoiceNoteCue | undefined;
};

// Là où la lecture en était quand elle a cassé, et si elle jouait : ce qu'on lui rend.
type Resume = { time: number; play: boolean };

// D'où la note joue à son engagement. `null` : la liste la désigne, elle démarre d'elle-même au début.
type Entry = number | null;

async function resumeAt(player: AudioPlayer, resume: Resume): Promise<void> {
  // Android ne met jamais le lecteur en pause en fin de note (seul `playing` retombe) : sans ça, un
  // saut sur une note terminée la relancerait d'office (#536).
  if (!resume.play) player.pause();
  try {
    await player.seekTo(resume.time);
  } catch {
    // Un saut refusé laisse la note au début : elle repart de zéro plutôt que de rester muette.
  }
  if (resume.play) player.play();
}

/**
 * Ce que montre une note, jouée ou non : bouton lecture/pause, curseur, compteur. Aucun lecteur
 * natif ici — l'enveloppe et le corps vivant lui passent ce qu'ils savent.
 */
type CmvAudioPlayerViewProps = {
  playing: boolean;
  position: number;
  total: number | null;
  // Le compteur montre la durée tant que la note n'a pas commencé.
  started: boolean;
  disabled: boolean;
  unavailable: boolean;
  onToggle: () => void;
  onScrub: (time: number | null) => void;
  onSeek: (time: number) => void;
};

function CmvAudioPlayerView({
  playing,
  position,
  total,
  started,
  disabled,
  unavailable,
  onToggle,
  onScrub,
  onSeek,
}: Readonly<CmvAudioPlayerViewProps>) {
  const { t } = useTranslation();

  return (
    <View className="gap-1">
      <View className="min-w-[160px] flex-row items-center gap-2">
        <Pressable onPress={onToggle} hitSlop={8}>
          <Ionicons name={playing ? "pause" : "play"} size={22} color={cmvColors.text.hi} />
        </Pressable>
        <CmvSeekBar
          position={position}
          total={total}
          disabled={disabled}
          label={t("media.audio.seek")}
          valueText={t("media.audio.position", {
            current: formatMmSs(position),
            total: formatMmSs(total ?? 0),
          })}
          onScrub={onScrub}
          onSeek={onSeek}
        />
        <CmvText className="text-cmv-text-hi text-xs">
          {formatMmSs(playing || started ? position : (total ?? 0))}
        </CmvText>
      </View>
      {unavailable ? (
        <CmvText className="text-cmv-error text-xs">{t("media.audio.unavailable")}</CmvText>
      ) : null}
    </View>
  );
}

/**
 * Lecteur audio partagé (messagerie, débrief) : bouton lecture/pause + curseur qu'on tape ou qu'on
 * glisse (#536).
 * Composant de design system réutilisable — d'où sa place dans `shared/component`.
 *
 * Un lecteur natif d'`expo-audio` crée une session média Android, et Android en plafonne le nombre
 * à 100 par application : au-delà, `AudioPlayer.constructor` lève et l'écran tombe (#712). Une note
 * ne construit donc le sien qu'à son ENGAGEMENT — on la lance, ou la liste la désigne — et le rend
 * quand une autre note prend la main, en gardant sa position. Rendue, elle n'est que son bouton, son
 * curseur et la durée connue du serveur ; déplacer le curseur d'une note au repos ne fait que poser
 * d'où elle jouera.
 */
export function CmvAudioPlayer(props: Readonly<CmvAudioPlayerProps>) {
  const { durationSeconds, cue } = props;
  // `null` : au repos, sans lecteur. Un objet : le corps vivant est monté, avec ce qu'il doit faire.
  const [engagement, setEngagement] = useState<{ entry: Entry } | null>(null);
  // Là où la note est restée, ou où on l'a posée : c'est d'où elle repart.
  const [rest, setRest] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);

  // La liste désigne cette note : elle démarre d'elle-même, il faut son lecteur. Posé au rendu pour
  // que la note ne passe pas par un rendu au repos, que son corps vivant démonterait aussitôt.
  if (cue?.cued && engagement == null) setEngagement({ entry: null });

  if (engagement != null) {
    return (
      <CmvAudioPlayerLive
        {...props}
        entry={engagement.entry}
        onRelease={(time) => {
          setRest(time);
          setEngagement(null);
        }}
      />
    );
  }

  return (
    <CmvAudioPlayerView
      playing={false}
      position={scrub ?? rest}
      total={durationSeconds}
      started={rest > 0}
      disabled={false}
      unavailable={false}
      onToggle={() => setEngagement({ entry: rest })}
      onScrub={setScrub}
      onSeek={(time) => {
        setScrub(null);
        setRest(time);
      }}
    />
  );
}

type LiveProps = CmvAudioPlayerProps & {
  entry: Entry;
  // La note cède son lecteur : où elle en était.
  onRelease: (time: number) => void;
};

/**
 * Le lecteur natif et tout ce qui le pilote. Il naît sur la PREMIÈRE URL et n'en change ensuite
 * que par `replace` (#304) : `useAudioPlayer` recrée son lecteur à chaque source, et chaque
 * rechargement du fil re-signait les médias — la note repartait de zéro. Une URL neuve n'est
 * adoptée qu'au repos ; en route, le lecteur garde la sienne et ne la remplace que si elle casse,
 * à la même position.
 *
 * Une note ne joue jamais par-dessus une autre (#529) : lancée, à la main ou par l'enchaînement,
 * elle met en pause celle qui jouait — et lui reprend son lecteur (#712).
 */
function CmvAudioPlayerLive({
  url,
  durationSeconds,
  resolveUrl,
  cue,
  entry,
  onRelease,
}: Readonly<LiveProps>) {
  const [initialUrl] = useState(url);
  const player = useAudioPlayer(initialUrl);
  const status = useAudioPlayerStatus(player);
  const [unavailable, setUnavailable] = useState(false);

  // L'URL que le lecteur lit VRAIMENT — plus forcément celle des props.
  const sourceRef = useRef(initialUrl);
  // L'intention de l'utilisateur : `status.playing` retombe à `false` dès que la lecture casse.
  const wantsPlayRef = useRef(false);
  const resumeRef = useRef<Resume | null>(null);
  // La position que vise le doigt pendant un glissé : c'est elle qu'on montre, pas le lecteur.
  const [scrub, setScrub] = useState<number | null>(null);
  /**
   * La position d'un saut demandé, montrée tant que le lecteur ne l'a pas appliquée — sinon le
   * curseur reculerait le temps du saut. Les deux plateformes émettent leur statut à jour juste
   * AVANT que `seekTo` ne rende la main : l'effacer là ne laisse voir aucun statut périmé.
   */
  const [target, setTarget] = useState<number | null>(entry != null && entry > 0 ? entry : null);
  // Lue par (B) et le réessai : une note qui casse sur le saut reprend là où on l'a envoyée.
  const targetRef = useRef(target);
  targetRef.current = target;
  // Le résolveur change à chaque rendu (flèche de l'écran) : lu par ref, il ne relance rien.
  const resolveUrlRef = useRef(resolveUrl);
  resolveUrlRef.current = resolveUrl;
  // Les rappels de la liste aussi.
  const cueRef = useRef(cue);
  cueRef.current = cue;
  const releaseRef = useRef<(() => void) | null>(null);
  // Là où la lecture en était quand elle a cassé : le lecteur, lui, retombe à zéro.
  const lostAtRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  // Libérée, la note n'a plus de lecteur à recharger : un réessai en route ne doit plus le toucher.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;

  // Une autre note démarre : celle-ci se tait, et ne repartira pas d'elle-même — ni au chargement
  // d'un saut, ni à la reprise d'une re-signature.
  const stop = useCallback(() => {
    wantsPlayRef.current = false;
    if (resumeRef.current != null) resumeRef.current = { ...resumeRef.current, play: false };
    player.pause();
    // Elle cède aussi son lecteur : sa position part avec elle, le saut en attente comprise.
    // Menée au bout, elle repart du début ; cassée avant son chargement, le lecteur ne sait plus où
    // elle en était : la position perdue vaut mieux que zéro.
    onReleaseRef.current(
      finishedRef.current
        ? 0
        : (targetRef.current ?? resumeRef.current?.time ?? lostAtRef.current ?? player.currentTime),
    );
  }, [player]);

  // Démontée, la note cède sa place : aucune autre n'a plus à l'arrêter.
  useEffect(() => () => releaseRef.current?.(), []);

  const load = useCallback(
    (source: string, resume: Resume) => {
      sourceRef.current = source;
      lostAtRef.current = null;
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
    const resume = { time: targetRef.current ?? player.currentTime, play: wantsPlayRef.current };
    lostAtRef.current = resume.time;
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

  // Le saut appliqué, la position du lecteur fait foi de nouveau — sauf si un autre l'a remplacé.
  const apply = useCallback(
    async (resume: Resume) => {
      await resumeAt(player, resume);
      setTarget((current) => (current === resume.time ? null : current));
    },
    [player],
  );

  // La nouvelle source est prête : c'est seulement là qu'iOS accepte le saut.
  useEffect(() => {
    const resume = resumeRef.current;
    if (!status.isLoaded || resume == null) return;
    resumeRef.current = null;
    void apply(resume);
  }, [status.isLoaded, apply]);

  // `null` tant que ni le serveur ni le lecteur ne la connaissent : le curseur n'a rien à viser.
  const total = durationSeconds ?? (status.duration > 0 ? status.duration : null);
  const current = scrub ?? target ?? status.currentTime;
  /**
   * Un saut en attente dit seul où en est la note : le statut qui la disait finie n'est plus vrai.
   * C'est ce qui fait repartir une note terminée qu'on a déplacée du point visé, pas du début.
   */
  const finished =
    target == null
      ? status.didJustFinish || (total != null && status.currentTime >= total)
      : total != null && target >= total;

  // Ce que `didJustFinish` a dit : retombé au statut suivant, il ne reste que ceci pour s'en souvenir
  // quand la durée est inconnue.
  const endedRef = useRef(false);
  finishedRef.current = finished || endedRef.current;

  const goTo = (resume: Resume) => {
    endedRef.current = false;
    wantsPlayRef.current = resume.play;
    setTarget(resume.time);
    // iOS refuse le saut tant que la source n'est pas prête : il attend le chargement, comme une
    // reprise. La note n'est plus « au repos » pour (A), ce qui est voulu.
    if (status.isLoaded) void apply(resume);
    else resumeRef.current = resume;
  };

  // Une note finie ne « veut » plus jouer, même si on l'avait lancée : sans ça, un 403 sur le saut
  // la relancerait au rechargement.
  const seek = (time: number) => goTo({ time, play: wantsPlayRef.current && !finished });

  const retry = async (time: number) => {
    setUnavailable(false);
    const resume = { time, play: true };
    const fresh = await resolveUrl();
    if (!mountedRef.current) return;
    if (fresh == null) {
      setUnavailable(true);
      return;
    }
    // Ici la même URL est rechargée : c'est un geste de l'utilisateur, pas une boucle.
    load(fresh, resume);
  };

  // La note démarre : elle prend la place de celle qui joue, et la liste oublie sa demande.
  const claim = () => {
    releaseRef.current = voiceNoteFocus.take(stop);
    cueRef.current?.onPlay();
  };

  const toggle = () => {
    if (unavailable) {
      claim();
      wantsPlayRef.current = true;
      void retry(targetRef.current ?? player.currentTime);
      return;
    }
    if (status.playing) {
      wantsPlayRef.current = false;
      player.pause();
      return;
    }
    claim();
    // Rejouer depuis le début quand la lecture est terminée (sinon `play` ne repart pas).
    if (finished) {
      // `void` : `play` part aussitôt, comme avant — le lecteur applique la position dans l'ordre.
      void player.seekTo(0);
    }
    wantsPlayRef.current = true;
    endedRef.current = false;
    // Un saut attend le chargement : c'est lui qui lancera la note, au point visé.
    if (resumeRef.current != null) resumeRef.current = { ...resumeRef.current, play: true };
    player.play();
  };

  // La note précédente vient de finir : celle-ci démarre au début, comme sous le doigt — l'envie
  // de jouer posée, une URL expirée sera re-signée et relancée (#304).
  const startCued = () => {
    claim();
    if (unavailable) {
      wantsPlayRef.current = true;
      void retry(0);
      return;
    }
    goTo({ time: 0, play: true });
  };
  const startCuedRef = useRef(startCued);
  startCuedRef.current = startCued;

  const cued = cue?.cued ?? false;
  useEffect(() => {
    if (cued) startCuedRef.current();
  }, [cued]);

  // Lancée à la main : elle joue d'où elle en était. Une note neuve part sans saut, comme avant
  // qu'elle n'ait à attendre son lecteur ; désignée par la liste, `entry` est `null` et l'effet
  // ci-dessus la démarre.
  const enter = (from: number) => {
    claim();
    if (from > 0) {
      goTo({ time: from, play: true });
      return;
    }
    wantsPlayRef.current = true;
    player.play();
  };
  const enterRef = useRef(enter);
  enterRef.current = enter;
  useEffect(() => {
    if (entry != null) enterRef.current(entry);
  }, [entry]);

  // Seule une note qui JOUAIT enchaîne (#529) : une note en pause qu'on amène au bout du curseur ne
  // lance rien. Finie, elle ne « veut » plus jouer.
  useEffect(() => {
    if (!status.didJustFinish) return;
    const wasPlaying = wantsPlayRef.current;
    wantsPlayRef.current = false;
    endedRef.current = true;
    if (wasPlaying) cueRef.current?.onFinish();
  }, [status.didJustFinish]);

  return (
    <CmvAudioPlayerView
      playing={status.playing}
      position={current}
      total={total}
      started={current > 0}
      disabled={unavailable || status.error != null}
      unavailable={unavailable}
      onToggle={toggle}
      onScrub={setScrub}
      onSeek={seek}
    />
  );
}
