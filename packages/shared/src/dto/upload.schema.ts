import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

/**
 * Transport des médias vers l'object storage — indépendant de CE qu'on envoie (débrief ou
 * message), qui reste décrit par `feedback.schema.ts` et `message.schema.ts`.
 *
 * Pourquoi deux modes plutôt qu'un seul chemin multipart : le tier dev est exposé par un tunnel
 * Cloudflare, dont le bord REFUSE tout corps de requête au-delà de 100 Mo (mesuré : 100 Mo
 * atteignent le storage, 101 Mo reviennent en 413 sans jamais l'atteindre). Un fichier lourd doit
 * donc partir en tranches — mais imposer ce détour aux photos et aux notes vocales, qui pèsent
 * quelques centaines de Ko, n'achèterait rien contre trois allers-retours de plus.
 */

// 80 Mo : 20 % de marge sous le plafond mesuré à 100 Mo. La marge n'est pas de la superstition —
// le corps réel porte aussi ses en-têtes, et un plan Cloudflare peut changer sous nos pieds.
export const MULTIPART_THRESHOLD_BYTES = 80 * 1024 * 1024;

/**
 * Taille d'une part. 10 Mio, encadrés des deux côtés :
 * - PLANCHER — S3 (et MinIO) refusent toute part non finale sous 5 Mio ;
 * - PLAFOND — chaque part est UNE requête HTTP, donc soumise aux 100 Mo du bord Cloudflare ;
 * - MÉMOIRE — le mobile lit la part dans un `Uint8Array` avant de l'écrire sur disque. C'est la
 *   contrainte qui a tranché : sur Android, `File.slice()` s'est révélé charger le fichier ENTIER
 *   (OOM mesuré à 418 Mo contre un tas plafonné à 256 Mo), d'où la lecture par plage.
 */
export const MULTIPART_PART_SIZE_BYTES = 10 * 1024 * 1024;

// Bornes du protocole S3 lui-même, pour situer les valeurs ci-dessus.
export const S3_MIN_PART_SIZE_BYTES = 5 * 1024 * 1024;
export const S3_MAX_PART_COUNT = 10_000;

export const UploadMode = {
  SINGLE: "SINGLE",
  MULTIPART: "MULTIPART",
} as const;
export type UploadMode = TypesValuesOf<typeof UploadMode>;

/** Au-delà du seuil, le PUT unique ne passerait pas le bord : on découpe. */
export function requiresMultipart(sizeBytes: number): boolean {
  return sizeBytes > MULTIPART_THRESHOLD_BYTES;
}

/** Nombre de parts pour un fichier de `totalBytes`. `null` si la taille n'a pas de sens. */
export function multipartPartCount(totalBytes: number): number | null {
  if (!Number.isInteger(totalBytes) || totalBytes <= 0) return null;
  return Math.ceil(totalBytes / MULTIPART_PART_SIZE_BYTES);
}

/**
 * Bornes de la part `partNumber` (1-based, comme les `PartNumber` de S3), la dernière étant
 * tronquée à la fin du fichier. `null` hors plage — jamais une tranche vide qui partirait quand
 * même et se ferait refuser plus loin, sans qu'on sache où l'erreur est née.
 */
export function multipartPartRange(
  partNumber: number,
  totalBytes: number,
): { start: number; end: number; length: number } | null {
  const count = multipartPartCount(totalBytes);
  if (count == null) return null;
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > count) return null;

  const start = (partNumber - 1) * MULTIPART_PART_SIZE_BYTES;
  const end = Math.min(start + MULTIPART_PART_SIZE_BYTES, totalBytes);
  return { start, end, length: end - start };
}

/**
 * La taille de CHAQUE part, dans l'ordre. Le serveur s'en sert pour signer les URLs — chaque part
 * portant son propre `ContentLength` — et le client pour découper. Une seule source, donc aucune
 * dérive possible entre ce qui est signé et ce qui est envoyé.
 */
export function multipartPartSizes(totalBytes: number): number[] | null {
  const count = multipartPartCount(totalBytes);
  if (count == null) return null;

  const sizes: number[] = [];
  for (let partNumber = 1; partNumber <= count; partNumber += 1) {
    const range = multipartPartRange(partNumber, totalBytes);
    if (range == null) return null;
    sizes.push(range.length);
  }
  return sizes;
}

/**
 * Ce que l'API répond à une demande d'upload de MÉDIA. Les documents (bibliothèque, factures)
 * gardent `uploadUrlDtoSchema` : ils ne dépassent jamais le seuil, et leur faire porter une union
 * discriminée coûterait un `switch` à chaque appel pour une branche morte.
 *
 * `partUrls` est ORDONNÉ : l'URL d'indice `i` signe la part `i + 1`. Un tableau plutôt qu'une carte
 * `partNumber → url`, parce que le client itère de toute façon dans l'ordre et qu'un trou dans la
 * numérotation n'est pas un état représentable.
 */
export const mediaUploadTicketDtoSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal(UploadMode.SINGLE),
    storagePath: z.string(),
    expiresIn: z.number().int().positive(),
    uploadUrl: z.url(),
  }),
  z.object({
    mode: z.literal(UploadMode.MULTIPART),
    storagePath: z.string(),
    expiresIn: z.number().int().positive(),
    uploadId: z.string().min(1),
    partSize: z.number().int().positive(),
    partUrls: z.array(z.url()).min(1),
  }),
]);
export type MediaUploadTicketDto = z.infer<typeof mediaUploadTicketDtoSchema>;

/**
 * Clôture d'un upload découpé : le storage recolle les parts en UN objet.
 *
 * Aucun ETag ici, et c'est délibéré. S3 en produit un par part, que le `complete` doit citer — mais
 * les lire côté client imposerait au storage d'exposer l'en-tête `ETag` en CORS, ce que MinIO ne
 * fait pas par défaut (vérifié : le préflight ne renvoie aucun `access-control-expose-headers`).
 * L'API les récupère donc elle-même par `ListParts`. Le client s'en trouve allégé, web et mobile
 * traités à l'identique, et c'est le SERVEUR qui constate ce qui a réellement atterri plutôt que
 * de croire ce que le client déclare.
 */
export const completeMultipartUploadSchema = z
  .object({
    storagePath: z.string().min(1),
    uploadId: z.string().min(1),
    /**
     * Combien de parts le client CROIT avoir envoyées. Le serveur compare au décompte réel du
     * storage et refuse de clore si ça diverge.
     *
     * Sans ce nombre, la vérification serait impossible : S3 recolle sans broncher ce qu'on lui
     * donne, et une part silencieusement perdue produirait une vidéo tronquée que rien ne
     * distingue d'une vidéo entière — ni le storage, ni le rattachement, ni la lecture.
     */
    partCount: z.number().int().positive().max(S3_MAX_PART_COUNT),
  })
  .strict();
export type CompleteMultipartUploadInput = z.infer<typeof completeMultipartUploadSchema>;

/**
 * Abandon explicite (l'utilisateur annule, une part échoue définitivement). Sans lui, les parts
 * déjà poussées restent facturées indéfiniment par le storage sans former d'objet visible —
 * invisibles à l'inventaire, donc jamais nettoyées à la main.
 */
export const abortMultipartUploadSchema = z
  .object({
    storagePath: z.string().min(1),
    uploadId: z.string().min(1),
  })
  .strict();
export type AbortMultipartUploadInput = z.infer<typeof abortMultipartUploadSchema>;
