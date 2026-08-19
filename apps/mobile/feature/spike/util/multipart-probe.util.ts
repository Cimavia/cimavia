import { File, FileMode, Paths, UploadType } from "expo-file-system";

/**
 * SPIKE JETABLE — à supprimer une fois la stratégie d'upload multipart tranchée (cf. plan #0).
 *
 * Ce que ce fichier cherche à savoir, et rien d'autre : sur un VRAI appareil, sait-on extraire une
 * tranche d'octets d'une vidéo locale et la pousser en PUT sans charger le fichier entier en
 * mémoire ? `UploadOptions` d'expo-file-system n'offre AUCUNE option de plage d'octets — `upload()`
 * envoie toujours le fichier complet — donc le multipart ne peut reposer que sur l'une des deux
 * stratégies ci-dessous.
 *
 * La vérification d'exactitude est GRATUITE : l'API signe l'URL avec le `ContentLength` annoncé
 * (cf. StorageService.createUploadUrl). Un 200 prouve donc que le storage a reçu très exactement
 * le nombre d'octets déclaré — un octet de trop ou de moins et la signature est refusée en 403.
 * Pas besoin d'écho ni de service tiers pour valider le découpage.
 */

// 10 Mio : au-dessus du minimum de 5 Mio qu'impose S3/MinIO à toute part non finale, et très en
// dessous du plafond de 100 Mo mesuré au bord Cloudflare.
export const PROBE_PART_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * - `SLICE` : `File.slice()` (la classe implémente `Blob`) envoyé par `fetch`. C'est la voie
 *   souhaitable — aucun fichier temporaire, aucune E/S disque en double. Le risque est que React
 *   Native matérialise le Blob entier en mémoire, ou pose un `Transfer-Encoding: chunked` au lieu
 *   du `Content-Length` exact que la signature exige (le 403 le dirait alors immédiatement).
 * - `HANDLE` : `FileHandle.readBytes()` sur une plage, écriture dans un fichier de cache, puis
 *   `upload()` natif — le chemin déjà éprouvé en production, au prix d'une écriture disque par
 *   part. Repli si `SLICE` échoue.
 */
export type ProbeStrategy = "SLICE" | "HANDLE";

export type PartOutcome = {
  partNumber: number;
  bytes: number;
  status: number;
  elapsedMs: number;
};

/** Bornes de la part `partNumber` (1-based), la dernière étant tronquée à la fin du fichier. */
export function partRange(
  partNumber: number,
  totalBytes: number,
): { start: number; end: number; length: number } {
  const start = (partNumber - 1) * PROBE_PART_SIZE_BYTES;
  const end = Math.min(start + PROBE_PART_SIZE_BYTES, totalBytes);
  return { start, end, length: end - start };
}

export function partCountOf(totalBytes: number): number {
  return Math.ceil(totalBytes / PROBE_PART_SIZE_BYTES);
}

/** Voie souhaitable : une tranche `Blob`, envoyée telle quelle. */
async function putBySlice(
  source: File,
  range: { start: number; end: number },
  uploadUrl: string,
  mimeType: string,
): Promise<number> {
  const blob = source.slice(range.start, range.end, mimeType);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: blob,
  });
  return response.status;
}

/**
 * Repli : la plage est lue dans un `Uint8Array` (une seule part en mémoire à la fois, jamais le
 * fichier entier), déposée dans le cache, poussée par le chemin natif, puis effacée — y compris
 * si l'envoi échoue, sinon un test de 30 parts laisserait 300 Mo derrière lui.
 */
async function putByHandle(
  source: File,
  range: { start: number; length: number },
  uploadUrl: string,
  mimeType: string,
): Promise<number> {
  const part = new File(Paths.cache, `spike-part-${range.start}.bin`);
  const handle = source.open(FileMode.ReadOnly);
  try {
    handle.offset = range.start;
    part.create({ overwrite: true });
    part.write(handle.readBytes(range.length));
  } finally {
    handle.close();
  }

  try {
    const result = await part.upload(uploadUrl, {
      httpMethod: "PUT",
      uploadType: UploadType.BINARY_CONTENT,
      headers: { "Content-Type": mimeType },
    });
    return result.status;
  } finally {
    part.delete();
  }
}

export async function uploadPart(
  strategy: ProbeStrategy,
  source: File,
  partNumber: number,
  totalBytes: number,
  uploadUrl: string,
  mimeType: string,
): Promise<PartOutcome> {
  const range = partRange(partNumber, totalBytes);
  const startedAt = Date.now();
  const status =
    strategy === "SLICE"
      ? await putBySlice(source, range, uploadUrl, mimeType)
      : await putByHandle(source, range, uploadUrl, mimeType);

  return { partNumber, bytes: range.length, status, elapsedMs: Date.now() - startedAt };
}
