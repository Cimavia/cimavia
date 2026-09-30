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

// Une vidéo affichée deux fois (le fil, puis sous le débrief qu'elle commente) n'est tirée qu'une.
const inFlight = new Map<string, Promise<string | null>>();

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
    saved.move(target);
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
 */
export function videoThumbnail(
  mediaId: string,
  resolveUrl: ResolveVideoUrl,
  durationSeconds: number | null,
): Promise<string | null> {
  if (!MEDIA_ID_PATTERN.test(mediaId)) return Promise.resolve(null);

  const local = localVideoThumbnailUri(mediaId);
  if (local != null) return Promise.resolve(local);

  const pending = inFlight.get(mediaId);
  if (pending != null) return pending;

  // L'époque de la DEMANDE, pas celle du tirage : une vidéo peut attendre son tour longtemps.
  const epoch = generation;
  const task = queue.then(() => generate(mediaId, resolveUrl, durationSeconds, epoch));
  // `generate` ne lève jamais, mais la file ne doit en aucun cas rester bloquée sur un rejet.
  queue = task.catch(() => null);
  inFlight.set(mediaId, task);
  void task.finally(() => {
    // Une purge a pu vider la table, et un nouvel appel y reposer SA tâche : on ne retire que la nôtre.
    if (inFlight.get(mediaId) === task) inFlight.delete(mediaId);
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
