import type { MessageMediaDto } from "@cmv/shared";
import { Directory, File, Paths } from "expo-file-system";
import { extensionOf } from "@/shared/lib/document-cache";
import { type OpenFileOutcome, openLocalFile } from "@/shared/lib/open-file";

/**
 * Ouvre le fichier joint d'un message (#771) : descendu sur l'appareil au premier tap, puis remis
 * à l'OS par le geste des documents de séance (#95).
 *
 * POURQUOI le descendre. Une URL signée ne s'ouvre pas dans une autre application : Android n'y lit
 * qu'un `content://`, et l'ouvrir dans le navigateur mènerait au 403 du storage une fois l'URL
 * périmée. Le fichier local, lui, se tend à n'importe quel lecteur PDF.
 *
 * `Paths.cache` et NON `Paths.document`, à l'inverse des documents de séance : ceux-là doivent
 * survivre en salle sans réseau, un fichier de message n'est qu'un confort de seconde ouverture.
 * Que l'OS le reprenne sous pression mémoire, et le tap suivant le redescendra.
 *
 * Rangement `<messageId>.<ext>` : un message ne porte qu'un fichier, et il ne change jamais.
 */

const DIRECTORY_NAME = "message-files";

// Là où `expo-document-picker` copie chaque fichier choisi, sous le cache, iOS comme Android.
const PICKED_DIRECTORY_NAME = "DocumentPicker";

type LocalMedia = Pick<MessageMediaDto, "fileName" | "mimeType" | "sizeBytes">;

// L'identifiant compose un chemin de fichier : borné et filtré, même s'il vient de notre API.
const MESSAGE_ID_PATTERN = /^[\w-]{1,64}$/;

/**
 * L'ÉPOQUE du magasin, incrémentée à chaque purge — même raisonnement que `document-cache` : un
 * téléchargement lancé avant une déconnexion ne doit pas réécrire le fichier du compte QUITTÉ dans
 * le magasin qu'on vient de vider.
 */
let generation = 0;

// Deux taps rapprochés sur la même bulle ne lancent qu'un téléchargement : deux écritures
// concurrentes sur le même fichier en laisseraient un mélange.
const inFlight = new Map<string, Promise<string | null>>();

function filesDirectory(): Directory {
  return new Directory(Paths.cache, DIRECTORY_NAME);
}

function pickedDirectory(): Directory {
  return new Directory(Paths.cache, PICKED_DIRECTORY_NAME);
}

function messageFile(messageId: string, fileName: string): File {
  return new File(filesDirectory(), `${messageId}${extensionOf(fileName)}`);
}

/**
 * La copie locale, si elle est ENTIÈRE. `File.downloadFileAsync` écrit directement à sa place : un
 * processus tué en plein téléchargement y laisse un fichier tronqué, que `exists` seul ferait
 * rouvrir à chaque tap — un PDF corrompu, sans un mot. Comparé à la taille du message, il est jeté
 * et redescendu.
 */
function localUri(messageId: string, media: LocalMedia): string | null {
  try {
    const file = messageFile(messageId, media.fileName);
    if (!file.exists) return null;
    if (file.size === media.sizeBytes) return file.uri;
    discard(file);
    return null;
  } catch {
    return null;
  }
}

/** L'URI du fichier descendu, `null` si rien n'a pu l'être — URL introuvable, réseau, disque. */
async function download(
  messageId: string,
  fileName: string,
  resolveUrl: () => Promise<string | null>,
): Promise<string | null> {
  const started = generation;
  const url = await resolveUrl().catch(() => null);
  if (url == null) return null;

  const file = messageFile(messageId, fileName);
  try {
    const directory = filesDirectory();
    if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
    await File.downloadFileAsync(url, file, { idempotent: true });
  } catch {
    // Un téléchargement coupé en route peut laisser un fichier tronqué : gardé, il serait rouvert
    // à chaque tap sans jamais s'afficher.
    discard(file);
    return null;
  }
  if (generation !== started) {
    discard(file);
    return null;
  }
  return file.uri;
}

function discard(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // Rien de plus à faire : le cache de l'OS finira par partir.
  }
}

/** Le téléchargement en cours pour ce message, ou un nouveau. */
function downloadOnce(
  messageId: string,
  fileName: string,
  resolveUrl: () => Promise<string | null>,
): Promise<string | null> {
  const current = inFlight.get(messageId);
  if (current != null) return current;

  const pending = download(messageId, fileName, resolveUrl).finally(() => {
    if (inFlight.get(messageId) === pending) inFlight.delete(messageId);
  });
  inFlight.set(messageId, pending);
  return pending;
}

/**
 * `resolveUrl` rend l'URL de lecture, re-signée si celle du fil a expiré (#304) ; il n'est appelé
 * que si le fichier n'est pas déjà sur l'appareil.
 */
export async function openMessageFile(
  messageId: string,
  media: LocalMedia,
  isOnline: boolean,
  resolveUrl: () => Promise<string | null>,
): Promise<OpenFileOutcome> {
  if (!MESSAGE_ID_PATTERN.test(messageId)) return "failed";

  // Le téléchargement en vol d'abord : pendant qu'il écrit, le disque porte un fichier à moitié.
  if (!inFlight.has(messageId)) {
    const local = localUri(messageId, media);
    if (local != null) return (await openLocalFile(local, media.mimeType)) ? "opened" : "failed";
    if (!isOnline) return "offline";
  }

  const uri = await downloadOnce(messageId, media.fileName, resolveUrl);
  if (uri == null) return "failed";
  return (await openLocalFile(uri, media.mimeType)) ? "opened" : "failed";
}

/**
 * Efface la copie qu'a laissée le sélecteur d'un fichier envoyé (#771). Rien hors de son dossier :
 * une URI d'ailleurs serait le fichier de l'utilisateur lui-même, pas une copie.
 */
export function discardPickedFile(uri: string): void {
  const root = pickedDirectory().uri.replace(/\/$/, "");
  if (uri.startsWith(`${root}/`)) discard(new File(uri));
}

/**
 * Efface les fichiers de messages — appelé au changement de compte, comme les documents : laisser
 * les PDF d'un compte sur l'appareil du suivant serait la fuite que `resetAccountData` referme.
 *
 * Les copies du sélecteur partent avec : `discardPickedFile` les efface après l'envoi, mais un
 * processus tué en plein lot en laisse.
 */
export function purgeMessageFiles(): void {
  // AVANT la suppression : aucun téléchargement en vol ne doit se croire encore légitime.
  generation += 1;
  inFlight.clear();
  for (const directory of [filesDirectory(), pickedDirectory()]) deleteDirectory(directory);
}

function deleteDirectory(directory: Directory): void {
  try {
    if (directory.exists) directory.delete();
  } catch {
    // Rien qui vaille de faire échouer une déconnexion.
  }
}
