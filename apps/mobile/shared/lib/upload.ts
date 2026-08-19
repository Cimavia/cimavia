import { File, FileMode, Paths, UploadType } from "expo-file-system";

/**
 * Envoi DÉCOUPÉ d'un fichier local vers l'object storage : une requête PUT par part.
 *
 * Pourquoi ce détour par un fichier de cache plutôt que `File.slice()`, qui rendrait un `Blob`
 * directement envoyable — MESURÉ sur appareil, vidéo de 398 Mo
 * (`docs/dette-technique.md` §« Envoi découpé des médias ») :
 *
 *     Call to function 'FileSystemFile.bytesSync' has been rejected.
 *     java.lang.OutOfMemoryError: Failed to allocate a 418159312 byte allocation
 *
 * L'allocation vaut le fichier ENTIER, pas la part : `slice()` n'est pas paresseux sur Android, il
 * matérialise tout puis découpe. Contre un tas plafonné à 256 Mo, ça meurt — et même en dessous,
 * charger 400 Mo pour en envoyer 10 n'aurait aucun sens. `FileHandle.readBytes()` lit une PLAGE :
 * la mémoire reste bornée à une part, et le chemin natif streame ensuite depuis le disque.
 *
 * Le coût assumé est une écriture disque transitoire par part (aussitôt effacée). Mesuré à
 * ~5 Mo/s de bout en bout depuis un mobile à travers le tunnel — le réseau domine largement.
 */

/**
 * Deux échecs radicalement différents, qu'on ne confond pas : le storage est INJOIGNABLE (réseau,
 * ou endpoint signé que le téléphone ne sait pas résoudre), ou il RÉPOND et refuse (403 signature,
 * 400 taille…). Les distinguer n'est pas cosmétique — « vérifie ta connexion » sur une signature
 * invalide envoie chercher la panne au mauvais endroit.
 *
 * L'erreur reste NEUTRE (pas de clé i18n) : le débrief et la messagerie ont chacun leurs libellés,
 * et c'est l'appelant qui traduit.
 */
export type StorageUploadReason = "unreachable" | "rejected";

export class StorageUploadError extends Error {
  constructor(readonly reason: StorageUploadReason) {
    super(reason);
  }
}

/**
 * Envoi en UNE requête — le cas courant, sous le seuil de découpage.
 *
 * Le fichier est streamé depuis le disque par le chemin natif, là où un `blob` le chargerait
 * entièrement en mémoire. Le `Content-Length` exact qu'exige l'URL signée est posé par ce même
 * chemin (le storage rejette tout autre poids).
 */
export async function uploadFileToStorage(
  uploadUrl: string,
  fileUri: string,
  mimeType: string,
  onProgress: (percent: number) => void = noop,
): Promise<void> {
  const file = new File(fileUri);
  await put(file, uploadUrl, { "Content-Type": mimeType }, (sent) =>
    onProgress(percentOf(sent, file.size)),
  );
}

// Discriminant des fichiers de cache, monotone pour la durée de vie du process.
let uploadSequence = 0;

export async function uploadPartsToStorage(
  sourceUri: string,
  partUrls: readonly string[],
  partSize: number,
  onProgress: (percent: number) => void = noop,
): Promise<void> {
  const source = new File(sourceUri);
  const totalBytes = source.size;
  // Deux envois simultanés (un débrief et un message, par exemple) écriraient sinon dans le même
  // fichier de cache et se corrompraient l'un l'autre. Un COMPTEUR et non un tirage aléatoire :
  // on cherche l'unicité au sein du process, pas de l'imprévisibilité — un générateur
  // pseudo-aléatoire n'apporterait ici qu'une collision possible et une alerte de sécurité.
  uploadSequence += 1;
  const token = `${Date.now().toString(36)}-${uploadSequence}`;

  for (const [index, url] of partUrls.entries()) {
    const start = index * partSize;
    // La dernière part est tronquée à la fin du fichier ; les autres font exactement `partSize`,
    // qui vient du TICKET et non d'une constante locale — c'est avec cette valeur que le serveur
    // a signé le `ContentLength` de chaque part.
    const length = Math.min(partSize, totalBytes - start);
    const part = writePartToCache(source, start, length, `${token}-${index + 1}`);

    try {
      // La progression est rapportée sur le TOTAL du fichier, pas sur la part : `start` est le
      // cumul des parts déjà montées, sans quoi la barre repartirait de zéro à chaque part.
      // Aucun Content-Type : `UploadPartCommand` ne le signe pas (le type de l'objet est fixé à
      // l'ouverture de l'upload). Seul `Content-Length` l'est, et le chemin natif le pose.
      await put(part, url, {}, (sent) => onProgress(percentOf(start + sent, totalBytes)));
    } finally {
      // Y COMPRIS en cas d'échec : un envoi de 40 parts abandonné en route laisserait sinon
      // des centaines de Mo dans le cache de l'app.
      part.delete();
    }
  }
}

function writePartToCache(source: File, start: number, length: number, name: string): File {
  const part = new File(Paths.cache, `upload-part-${name}.bin`);
  const handle = source.open(FileMode.ReadOnly);
  try {
    handle.offset = start;
    part.create({ overwrite: true });
    part.write(handle.readBytes(length));
  } finally {
    handle.close();
  }
  return part;
}

async function put(
  file: File,
  url: string,
  headers: Record<string, string>,
  onSentBytes: (sentBytes: number) => void,
): Promise<void> {
  let status: number;
  try {
    const result = await file.upload(url, {
      httpMethod: "PUT",
      uploadType: UploadType.BINARY_CONTENT,
      headers,
      onProgress: ({ bytesSent }) => onSentBytes(bytesSent),
    });
    status = result.status;
  } catch {
    throw new StorageUploadError("unreachable");
  }

  if (status < 200 || status >= 300) {
    throw new StorageUploadError("rejected");
  }
}

function percentOf(sentBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 100;
  return Math.min(100, Math.round((sentBytes / totalBytes) * 100));
}

function noop(): void {
  // Progression ignorée : tous les appelants n'ont pas de barre à nourrir.
}
