import type { SessionFeedbackDto } from "../dto/feedback.schema";
import type { MessageDto } from "../dto/message.schema";
import { isSignedUrlUsable, keepSignedUrl, type SignedUrlReceipt } from "./signed-url.util";

/**
 * La mémoire des URLs signées d'une app : pour chaque média, l'URL qu'on lui garde et quand on
 * l'a reçue (#304).
 *
 * POURQUOI une table et pas la date de la requête. Tant que chaque réponse remplaçait toutes les
 * URLs, le `dataUpdatedAt` de TanStack disait l'âge de chacune. Dès qu'on en garde une d'une
 * réponse à l'autre, ce n'est plus vrai : la requête a dix secondes, l'URL gardée quatre minutes.
 * Le DTO ne porte pas cette date — c'est un contrat serveur, pas un état client —, il faut donc
 * la tenir à côté.
 *
 * UNE par app, et non une par écran : le fil, le débrief et la vérification avant ouverture
 * doivent voir la même URL pour le même média. Deux mémoires diraient deux choses.
 *
 * Un média absent de la table a une date INCONNUE, et une date inconnue vaut « périmée » : c'est
 * le cas d'un cache restauré au démarrage, dont on ignore quand ses URLs ont été reçues.
 */
export type SignedUrlKeeper = {
  /** Enregistre l'URL reçue pour ce média et rend celle à AFFICHER — la gardée si elle vaut encore. */
  keep: (mediaId: string, url: string, nowMs: number) => string;
  /** L'URL gardée si elle est encore ouvrable ; `null` si elle ne l'est plus ou n'est pas connue. */
  usableUrl: (mediaId: string, nowMs: number) => string | null;
};

export function createSignedUrlKeeper(): SignedUrlKeeper {
  const receipts = new Map<string, SignedUrlReceipt>();

  return {
    keep: (mediaId, url, nowMs) => {
      const kept = keepSignedUrl(
        receipts.get(mediaId) ?? null,
        { url, receivedAtMs: nowMs },
        nowMs,
      );
      receipts.set(mediaId, kept);
      return kept.url;
    },
    usableUrl: (mediaId, nowMs) => {
      const receipt = receipts.get(mediaId);
      if (receipt == null || !isSignedUrlUsable(receipt.receivedAtMs, nowMs)) return null;
      return receipt.url;
    },
  };
}

/**
 * Un message dont l'URL de média est celle que la table garde. Même objet quand rien ne change :
 * c'est ce qui permet au partage structurel de TanStack de rendre l'ancienne réponse intacte.
 */
function stabilizeMessage(keeper: SignedUrlKeeper, message: MessageDto, nowMs: number): MessageDto {
  if (message.media == null) return message;
  const url = keeper.keep(message.id, message.media.url, nowMs);
  return url === message.media.url ? message : { ...message, media: { ...message.media, url } };
}

/** Le fil d'une conversation, URLs stabilisées. Un message se repère par SON id. */
export function stabilizeMessageUrls(
  keeper: SignedUrlKeeper,
  messages: readonly MessageDto[],
  nowMs: number,
): MessageDto[] {
  return messages.map((message) => stabilizeMessage(keeper, message, nowMs));
}

/**
 * Un débrief, URLs stabilisées — ses médias ET les médias de ses réponses, qui sont des messages
 * servis par un second chemin et s'affichent sous le débrief avec leur propre lecteur.
 *
 * `null` passe tel quel : c'est « pas encore débriefé », un état normal.
 */
export function stabilizeFeedbackUrls(
  keeper: SignedUrlKeeper,
  feedback: SessionFeedbackDto | null,
  nowMs: number,
): SessionFeedbackDto | null {
  if (feedback == null) return null;
  return {
    ...feedback,
    media: feedback.media.map((item) => {
      const url = keeper.keep(item.id, item.url, nowMs);
      return url === item.url ? item : { ...item, url };
    }),
    messages: stabilizeMessageUrls(keeper, feedback.messages, nowMs),
  };
}

/**
 * Une URL ouvrable pour ce média, en re-signant s'il le faut : ce qu'un lecteur demande quand son
 * URL a lâché en cours de route, ou ce qu'on vérifie avant d'ouvrir un média hors de l'app.
 *
 * `refetch` recharge la requête qui porte le média : la réponse repasse par la table, qui
 * remplace alors l'URL périmée. Une seule relecture de la table couvre donc « rechargement
 * réussi », « rechargement raté » (la table n'a pas bougé) et « média disparu » (idem).
 *
 * `null` = impossible d'en avoir une (hors réseau, API en panne, média retiré). L'appelant ne
 * doit PAS ouvrir : mieux vaut un message clair que la page d'erreur du storage.
 */
export async function resolveUsableSignedUrl(
  keeper: SignedUrlKeeper,
  mediaId: string,
  refetch: () => Promise<unknown>,
  now: () => number,
): Promise<string | null> {
  const kept = keeper.usableUrl(mediaId, now());
  if (kept != null) return kept;

  try {
    await refetch();
  } catch {
    return null;
  }
  return keeper.usableUrl(mediaId, now());
}

/** Le partage structurel du cache client, injecté : `@cmv/shared` ne dépend pas de TanStack. */
type ReplaceEqualDeep = (previous: unknown, next: unknown) => unknown;

/**
 * La table d'une app, et les deux fonctions à brancher sur l'option `structuralSharing` des
 * requêtes qui portent des médias signés.
 *
 * `structuralSharing` est appelé à CHAQUE réponse, avant qu'elle soit rangée : c'est le seul point
 * par où passent à la fois le sondage, le retour au premier plan, les invalidations et
 * `setQueryData`. Une URL encore ouvrable y reprend la place de sa re-signature.
 *
 * `replaceEqualDeep` ensuite — c'est ce que TanStack fait par défaut : quand seules les URLs avaient
 * changé, il rend l'ANCIENNE réponse, intacte, et rien ne se redessine.
 *
 * Construit ici et non dans chaque app : le web et le mobile le tiendraient à l'identique.
 */
export function createSignedUrlSharing(replaceEqualDeep: ReplaceEqualDeep, now: () => number) {
  const keeper = createSignedUrlKeeper();

  return {
    keeper,
    keepThreadUrls: (previous: unknown, next: unknown) =>
      replaceEqualDeep(previous, stabilizeMessageUrls(keeper, next as MessageDto[], now())),
    keepFeedbackUrls: (previous: unknown, next: unknown) =>
      replaceEqualDeep(
        previous,
        stabilizeFeedbackUrls(keeper, next as SessionFeedbackDto | null, now()),
      ),
  };
}
