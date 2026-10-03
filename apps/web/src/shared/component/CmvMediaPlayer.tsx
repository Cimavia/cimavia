import type { VoiceNoteCue } from "@cmv/shared";
import { type SyntheticEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { voiceNoteFocus } from "@/shared/lib/voice-note-focus";

type CmvMediaPlayerProps = {
  kind: "audio" | "video";
  // URL GET signée (bucket privé) : le navigateur lit directement depuis le storage.
  url: string;
  /**
   * Une URL ouvrable pour CE média, re-signée s'il le faut ; `null` si c'est impossible. Appelée
   * quand l'URL en cours a lâché — voir `useFreshMediaUrl`.
   */
  resolveUrl: () => Promise<string | null>;
  preload?: "none" | "metadata" | "auto";
  className?: string;
  /**
   * Ce que la liste dit à cette note pour l'enchaîner aux autres (#529). Absent, le lecteur joue
   * seul : rien ne le lance, et sa fin ne lance rien.
   */
  cue?: VoiceNoteCue | undefined;
};

/** Où en était la lecture quand l'URL a lâché, pour y revenir sur la nouvelle. */
type Resume = { time: number; playing: boolean };

/**
 * Le lecteur natif du navigateur, qui ne repart jamais de zéro parce que son URL a changé (#304).
 *
 * Deux règles, contre deux causes de coupure :
 * - **Un lecteur en cours d'utilisation garde son URL.** Réécrire le `src` d'un `<audio>` relance
 *   son chargement : la position revient à zéro. Une URL qui arrive (re-signée par un
 *   rechargement) n'est donc adoptée que par un lecteur au repos — jamais lancé.
 * - **Une URL qui lâche en cours de route est remplacée à la même position.** Le storage vérifie
 *   la signature à CHAQUE requête : passé le TTL, un saut dans la barre ou le morceau suivant
 *   d'une vidéo reçoit un 403. On redemande alors une URL, on revient où on en était, et on
 *   relance si ça jouait — au pire une micro-pause, comme une coupure réseau.
 *
 * En panne (hors réseau, API tombée), le lecteur reste où il est, avec une phrase : jamais la page
 * d'erreur du storage. Relancer la lecture retente d'elle-même.
 *
 * Une note vocale ne joue jamais par-dessus une autre (#529) : lancée, elle met en pause celle qui
 * jouait. Une vidéo n'entre pas dans cette règle.
 */
export function CmvMediaPlayer({
  kind,
  url,
  resolveUrl,
  preload,
  className,
  cue,
}: Readonly<CmvMediaPlayerProps>) {
  const { t } = useTranslation();
  const ref = useRef<HTMLMediaElement | null>(null);
  const [src, setSrc] = useState(url);
  const [unavailable, setUnavailable] = useState(false);
  const resume = useRef<Resume | null>(null);
  // `paused` passe à vrai sur une erreur réseau : c'est l'intention de l'utilisateur qu'on retient.
  const playing = useRef(false);
  // La note est allée au bout EN JOUANT. Seule cette fin-là enchaîne : un saut au bout d'une note en
  // pause déclenche aussi `ended`, mais sans la `pause` qui le précède quand elle jouait.
  const finishedPlaying = useRef(false);
  // La liste reconstruit ses rappels à chaque rendu : lus par ref, ils ne relancent rien.
  const cueRef = useRef(cue);
  cueRef.current = cue;
  const release = useRef<(() => void) | null>(null);
  const stop = useCallback(() => ref.current?.pause(), []);

  // Démontée, la note cède sa place : aucune autre n'a plus à l'arrêter.
  useEffect(() => () => release.current?.(), []);

  useEffect(() => {
    const element = ref.current;
    const idle = element == null || (element.paused && element.currentTime === 0);
    if (idle) setSrc(url);
  }, [url]);

  // La note précédente vient de finir : celle-ci démarre au début, comme sous le doigt. L'intention
  // est posée AVANT `play` — si son URL a expiré, `onError` la relancera sur la nouvelle (#304).
  const cued = cue?.cued ?? false;
  useEffect(() => {
    const element = ref.current;
    if (!cued || element == null) return;
    element.currentTime = 0;
    playing.current = true;
    // Hors d'un geste, Safari peut refuser (`NotAllowedError`) : l'enchaînement s'arrête là, sans
    // rien afficher. La note reste prête, un clic la lance.
    element.play().catch(() => {
      playing.current = false;
    });
  }, [cued]);

  const onError = async (event: SyntheticEvent<HTMLMediaElement>) => {
    const element = event.currentTarget;
    const failed = element.currentSrc || src;
    const position = { time: element.currentTime, playing: playing.current };

    const fresh = await resolveUrl();
    // La même URL a déjà échoué : la reprendre bouclerait. Autre chose que l'échéance est en cause
    // (fichier retiré, storage injoignable) — on s'arrête et on le dit.
    if (fresh == null || fresh === failed) {
      setUnavailable(true);
      return;
    }
    resume.current = position;
    setUnavailable(false);
    setSrc(fresh);
  };

  const onLoadedMetadata = (event: SyntheticEvent<HTMLMediaElement>) => {
    const pending = resume.current;
    if (pending == null) return;
    resume.current = null;
    const element = event.currentTarget;
    element.currentTime = pending.time;
    if (pending.playing) void element.play();
  };

  const handlers = {
    ref: (element: HTMLMediaElement | null) => {
      ref.current = element;
    },
    src,
    controls: true,
    preload,
    className,
    onError,
    onLoadedMetadata,
    onPlay: () => {
      playing.current = true;
      setUnavailable(false);
      if (kind === "audio") release.current = voiceNoteFocus.take(stop);
      cueRef.current?.onPlay();
    },
    onPause: (event: SyntheticEvent<HTMLMediaElement>) => {
      playing.current = false;
      // Au bout d'une lecture, le navigateur met en pause PUIS annonce `ended` : `ended` vaut déjà
      // vrai ici.
      finishedPlaying.current = event.currentTarget.ended;
    },
    onEnded: () => {
      if (!finishedPlaying.current) return;
      finishedPlaying.current = false;
      cueRef.current?.onFinish();
    },
  };

  return (
    <>
      {/* Une piste vide : ce sont des notes vocales et des vidéos d'entraînement, sans sous-titres
          à proposer. Elle satisfait la règle d'accessibilité des deux outils (Biome, Sonar
          S4084) sans la faire taire. */}
      {kind === "audio" ? (
        <audio {...handlers}>
          <track kind="captions" />
        </audio>
      ) : (
        <video {...handlers}>
          <track kind="captions" />
        </video>
      )}
      {unavailable ? (
        <p className="text-cmv-caption text-cmv-error">{t("common.mediaUnavailable")}</p>
      ) : null}
    </>
  );
}
