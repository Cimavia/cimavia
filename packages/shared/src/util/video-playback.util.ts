/**
 * Ce qu'une lecture vidéo a coûté d'attente, et si ça vaut d'être remonté (#809).
 *
 * Le retour du Coach bêta — « une vidéo met très longtemps à se charger hors wifi » — n'avait aucune
 * mesure derrière lui : le lecteur n'envoyait rien. Ce module tient le relevé d'UNE lecture (ouverture,
 * première image, recharges) et décide, à la fermeture, s'il part : une lecture fluide ne remonte
 * rien, une lecture lente remonte ses chiffres et le débit de la vidéo, qui dit si le fichier pouvait
 * passer par le lien.
 *
 * Pur, donc en `@cmv/shared` : c'est ici que se DÉCIDE ce qu'est une lecture lente, l'écran ne fait
 * que relayer les événements du lecteur natif.
 */

// Au-delà, l'attente avant la première image se voit : c'est ce dont le Coach se plaignait.
export const SLOW_VIDEO_STARTUP_MS = 3000;

// En deçà, une attente en route ne compte pas : c'est le saut d'un curseur déplacé à la main, que
// même une fibre ne sert pas instantanément. Au-delà, la lecture s'est vraiment arrêtée.
export const VIDEO_STALL_MIN_MS = 1000;

/**
 * Ce que le lecteur natif signale, ramené à trois faits :
 * - `firstFrame` : la première image est à l'écran (les suivantes, sur un changement de piste, ne
 *   comptent pas) ;
 * - `loading` : il attend des octets ;
 * - `ready` : il en a assez pour (re)jouer.
 */
export type VideoPlaybackEvent = { type: "firstFrame" | "loading" | "ready"; atMs: number };

type Stall = { startMs: number; endMs: number | null };

export type VideoPlaybackTimeline = {
  openedAtMs: number;
  // `null` : aucune image n'est encore sortie.
  firstFrameAtMs: number | null;
  // Les attentes APRÈS la première image : celle d'avant est le démarrage, compté à part.
  stalls: readonly Stall[];
};

export type VideoPlaybackReport = {
  // Du geste à la première image — ou à la fermeture, quand aucune n'est sortie.
  startupMs: number;
  // Faux : fermée avant la première image. C'est le pire cas, pas un cas à taire.
  started: boolean;
  // Les attentes d'au moins `VIDEO_STALL_MIN_MS`, et leur durée cumulée.
  stallCount: number;
  stallMs: number;
  // `null` : taille ou durée inconnue, on ne devine pas le débit.
  bitrateMbps: number | null;
};

/** Le relevé d'une lecture, ouvert au geste de l'utilisateur — avant la re-signature de l'URL. */
export function openVideoPlayback(openedAtMs: number): VideoPlaybackTimeline {
  return { openedAtMs, firstFrameAtMs: null, stalls: [] };
}

function openStall(timeline: VideoPlaybackTimeline): Stall | undefined {
  const last = timeline.stalls.at(-1);
  return last?.endMs === null ? last : undefined;
}

function closeOpenStall(timeline: VideoPlaybackTimeline, atMs: number): VideoPlaybackTimeline {
  const open = openStall(timeline);
  if (open == null) return timeline;
  return { ...timeline, stalls: [...timeline.stalls.slice(0, -1), { ...open, endMs: atMs }] };
}

/** Le relevé, après un événement du lecteur. Ne mute rien. */
export function trackVideoPlayback(
  timeline: VideoPlaybackTimeline,
  event: VideoPlaybackEvent,
): VideoPlaybackTimeline {
  if (event.type === "firstFrame") {
    return timeline.firstFrameAtMs == null ? { ...timeline, firstFrameAtMs: event.atMs } : timeline;
  }
  if (event.type === "ready") return closeOpenStall(timeline, event.atMs);

  // `loading` avant la première image : c'est encore le démarrage. Déjà en attente : la même.
  if (timeline.firstFrameAtMs == null || openStall(timeline) != null) return timeline;
  return { ...timeline, stalls: [...timeline.stalls, { startMs: event.atMs, endMs: null }] };
}

/**
 * Le débit moyen d'une vidéo, en Mbit/s arrondi au dixième. `null` quand la taille ou la durée
 * manque : un débit inventé ferait conclure à tort sur le lien.
 */
export function videoBitrateMbps(
  sizeBytes: number | null,
  durationSeconds: number | null,
): number | null {
  if (sizeBytes == null || durationSeconds == null || durationSeconds <= 0) return null;
  return Math.round((sizeBytes * 8) / durationSeconds / 100_000) / 10;
}

/**
 * Le rapport d'une lecture fermée, ou `null` si elle a été fluide : démarrée sous le seuil, sans
 * recharge d'au moins `VIDEO_STALL_MIN_MS`. Une attente encore ouverte à la fermeture compte
 * jusqu'à elle.
 */
export function videoPlaybackReport(
  timeline: VideoPlaybackTimeline,
  closedAtMs: number,
  sizeBytes: number | null,
  durationSeconds: number | null,
): VideoPlaybackReport | null {
  const started = timeline.firstFrameAtMs != null;
  const startupMs = (timeline.firstFrameAtMs ?? closedAtMs) - timeline.openedAtMs;
  const stalls = timeline.stalls
    .map((stall) => (stall.endMs ?? closedAtMs) - stall.startMs)
    .filter((duration) => duration >= VIDEO_STALL_MIN_MS);
  const stallMs = stalls.reduce((total, duration) => total + duration, 0);
  const stallCount = stalls.length;

  if (startupMs <= SLOW_VIDEO_STARTUP_MS && stallCount === 0) return null;
  return {
    startupMs,
    started,
    stallCount,
    stallMs,
    bitrateMbps: videoBitrateMbps(sizeBytes, durationSeconds),
  };
}
