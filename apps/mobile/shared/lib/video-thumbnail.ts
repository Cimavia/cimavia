import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { createVideoPlayer, type VideoPlayer } from "expo-video";

/**
 * La vignette d'une vidéo, tirée SUR L'APPAREIL à l'affichage et gardée sur le disque (#92, #155).
 *
 * POURQUOI à l'affichage et pas à l'envoi. Stocker une vignette à l'envoi demandait une migration,
 * un champ de DTO, un second envoi signé — et laissait sans image toutes les vidéos déjà envoyées,
 * comme celles déposées depuis le web. Tirée ici, elle ne touche ni l'API ni la base, vaut pour
 * l'existant, et ne coûte le réseau qu'à la première vue : la suivante lit le fichier.
 *
 * POURQUOI sans module natif de plus. `generateThumbnailsAsync` (expo-video, déjà là pour la lecture,
 * #407) rend une image NATIVE, que seul l'`Image` d'expo-image sait afficher. `expo-image-manipulator`
 * — déjà là pour les photos — accepte cette même référence et l'écrit en JPEG : un fichier, que
 * l'`Image` de React Native affiche.
 *
 * Tout y est défensif : une vignette est un CONFORT. Réseau coupé, URL non re-signable, décodage
 * refusé → `null`, et la pastille d'avant reste. Jamais une case vide, jamais un écran qui tombe.
 */

const DIRECTORY_NAME = "video-thumbnails";

// Une vignette de bulle fait 192 px de large : 480 laisse de la marge aux écrans denses, sans
// peser plus que quelques dizaines de Ko.
const THUMBNAIL_MAX_WIDTH_PX = 480;
const THUMBNAIL_COMPRESS = 0.7;

// La toute première image d'une vidéo est souvent noire (ouverture de l'obturateur, fondu).
const THUMBNAIL_AT_SECONDS = 1;

// L'identifiant compose un chemin de fichier : borné et filtré, même s'il vient de notre API.
const MEDIA_ID_PATTERN = /^[\w-]{1,64}$/;

/** Rend l'URL de lecture, re-signée s'il le faut ; `null` si c'est impossible. */
export type ResolveVideoUrl = () => Promise<string | null>;

/**
 * L'ÉPOQUE du magasin, incrémentée à chaque purge — même raisonnement que `document-cache` : une
 * demande faite avant une déconnexion, qu'elle soit en cours ou encore dans la file, ne doit pas
 * réécrire l'image d'un athlète du compte QUITTÉ dans le magasin qu'on vient de vider.
 */
let generation = 0;

// Une génération à la fois : chacune ouvre un lecteur natif et tire des octets du storage. Un fil
// de vingt vidéos n'en ouvre donc jamais vingt ensemble.
let queue: Promise<unknown> = Promise.resolve();

/**
 * Une demande dans la file, et combien d'écrans l'attendent encore. Une vidéo affichée deux fois (le
 * fil, puis sous le débrief qu'elle commente) n'est tirée qu'une ; un écran quitté retire son
 * attente, et la demande que plus personne n'attend sort de la file sans rien tirer (#809).
 */
type Pending = { task: Promise<string | null>; waiting: number };
const inFlight = new Map<string, Pending>();

/**
 * Les lecteurs vidéo ouverts, qui suspendent la file (#809). Une vignette tire des octets sur le
 * MÊME lien que la vidéo qu'on regarde : en 5G, c'est autant de moins pour la lecture. Celle déjà
 * en cours finit — un tirage natif ne s'interrompt pas —, les suivantes attendent la fermeture.
 */
let suspensions = 0;
let resumed: Promise<void> = Promise.resolve();
let resume: () => void = () => undefined;

/** Met la file en pause ; rend la fonction qui la relâche, sans effet au-delà du premier appel. */
export function suspendVideoThumbnails(): () => void {
  if (suspensions === 0) {
    resumed = new Promise((resolve) => {
      resume = resolve;
    });
  }
  suspensions += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    suspensions -= 1;
    if (suspensions === 0) resume();
  };
}

// Lu au moment où la tâche arrive en tête de file, pas à la demande : c'est là qu'elle tirerait.
function whenResumed(): Promise<void> {
  return suspensions === 0 ? Promise.resolve() : resumed;
}

function thumbnailDirectory(): Directory {
  return new Directory(Paths.cache, DIRECTORY_NAME);
}

function thumbnailFile(mediaId: string): File {
  return new File(thumbnailDirectory(), `${mediaId}.jpg`);
}

/**
 * L'instant où tirer l'image : une seconde, ou le milieu d'une vidéo plus courte. Durée inconnue :
 * une seconde quand même — au pire le lecteur rend l'image la plus proche.
 */
export function thumbnailTimeSeconds(durationSeconds: number | null): number {
  if (durationSeconds == null) return THUMBNAIL_AT_SECONDS;
  return Math.min(THUMBNAIL_AT_SECONDS, durationSeconds / 2);
}

/**
 * La vignette déjà sur l'appareil, ou `null`. Synchrone : c'est ce qui permet au premier rendu de
 * l'afficher sans passer par la pastille.
 */
export function localVideoThumbnailUri(mediaId: string): string | null {
  if (!MEDIA_ID_PATTERN.test(mediaId)) return null;
  try {
    const file = thumbnailFile(mediaId);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

// Un appelant de plus attend cette demande. Sans signal, il l'attend jusqu'au bout.
function joinWaiters(pending: Pending, signal: AbortSignal | undefined): void {
  if (signal?.aborted) return;
  pending.waiting += 1;
  signal?.addEventListener("abort", () => {
    pending.waiting -= 1;
  });
}

async function generate(
  mediaId: string,
  resolveUrl: ResolveVideoUrl,
  durationSeconds: number | null,
  epoch: number,
): Promise<string | null> {
  // Demandée avant une purge, sortie de la file après : elle était pour le compte QUITTÉ.
  if (epoch !== generation) return null;

  let player: VideoPlayer | null = null;
  try {
    const url = await resolveUrl();
    if (url == null) return null;

    player = createVideoPlayer(url);
    const [thumbnail] = await player.generateThumbnailsAsync(
      thumbnailTimeSeconds(durationSeconds),
      {
        maxWidth: THUMBNAIL_MAX_WIDTH_PX,
      },
    );
    if (thumbnail == null) return null;

    const image = await ImageManipulator.manipulate(thumbnail).renderAsync();
    const saved = new File(
      (await image.saveAsync({ format: SaveFormat.JPEG, compress: THUMBNAIL_COMPRESS })).uri,
    );

    // Le compte a changé pendant qu'on tirait l'image : elle n'est plus à personne ici.
    if (epoch !== generation) {
      saved.delete();
      return null;
    }

    const directory = thumbnailDirectory();
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    const target = thumbnailFile(mediaId);
    // Asynchrone (#531) : rendre l'URI avant la fin du déplacement, c'était annoncer un fichier
    // absent, et laisser un échec hors du `catch`.
    await saved.move(target);

    // Une purge a pu passer pendant le déplacement : même raisonnement qu'avant lui.
    if (epoch !== generation) {
      target.delete();
      return null;
    }
    return target.uri;
  } catch {
    // Pas de message : c'est la pastille, toujours là, qui tient lieu de repli.
    return null;
  } finally {
    // Le lecteur n'a servi qu'à tirer une image : le garder retiendrait un décodeur natif.
    player?.release();
  }
}

/**
 * La vignette d'une vidéo : celle du disque, sinon tirée à son tour dans la file. `null` quand elle
 * n'a pas pu l'être — rien n'est retenu de l'échec, le prochain affichage retentera.
 *
 * `signal` : l'écran qui la demande est parti. Si plus personne ne l'attend quand vient son tour,
 * elle n'est pas tirée — un fil quitté ne continue pas à télécharger ses vidéos. Déjà en cours,
 * elle finit : un tirage natif ne s'interrompt pas.
 */
export function videoThumbnail(
  mediaId: string,
  resolveUrl: ResolveVideoUrl,
  durationSeconds: number | null,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!MEDIA_ID_PATTERN.test(mediaId)) return Promise.resolve(null);

  const local = localVideoThumbnailUri(mediaId);
  if (local != null) return Promise.resolve(local);

  const existing = inFlight.get(mediaId);
  if (existing != null) {
    joinWaiters(existing, signal);
    return existing.task;
  }

  // L'époque de la DEMANDE, pas celle du tirage : une vidéo peut attendre son tour longtemps.
  const epoch = generation;
  const pending: Pending = { task: Promise.resolve(null), waiting: 0 };
  joinWaiters(pending, signal);
  const task = queue
    .then(whenResumed)
    .then(() =>
      pending.waiting === 0 ? null : generate(mediaId, resolveUrl, durationSeconds, epoch),
    );
  pending.task = task;
  // `generate` ne lève jamais, mais la file ne doit en aucun cas rester bloquée sur un rejet.
  queue = task.catch(() => null);
  inFlight.set(mediaId, pending);
  void task.finally(() => {
    // Une purge a pu vider la table, et un nouvel appel y reposer SA tâche : on ne retire que la nôtre.
    if (inFlight.get(mediaId) === pending) inFlight.delete(mediaId);
  });
  return task;
}

/**
 * Efface toutes les vignettes — appelé au changement de compte. Ce sont des images des athlètes :
 * les laisser au compte suivant serait la fuite que `purgeAllDocuments` ferme pour les documents.
 */
export function purgeVideoThumbnails(): void {
  // AVANT la suppression : aucune génération en vol ne doit se croire encore légitime.
  generation += 1;
  inFlight.clear();
  try {
    const directory = thumbnailDirectory();
    if (directory.exists) directory.delete();
  } catch {
    // Rien qui vaille de faire échouer une déconnexion : le cache de l'OS finira par partir.
  }
}
