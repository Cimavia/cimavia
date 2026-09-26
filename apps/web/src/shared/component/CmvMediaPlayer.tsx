import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

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
 */
export function CmvMediaPlayer({
  kind,
  url,
  resolveUrl,
  preload,
  className,
}: Readonly<CmvMediaPlayerProps>) {
  const { t } = useTranslation();
  const ref = useRef<HTMLMediaElement | null>(null);
  const [src, setSrc] = useState(url);
  const [unavailable, setUnavailable] = useState(false);
  const resume = useRef<Resume | null>(null);
  // `paused` passe à vrai sur une erreur réseau : c'est l'intention de l'utilisateur qu'on retient.
  const playing = useRef(false);

  useEffect(() => {
    const element = ref.current;
    const idle = element == null || (element.paused && element.currentTime === 0);
    if (idle) setSrc(url);
  }, [url]);

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
    },
    onPause: () => {
      playing.current = false;
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
