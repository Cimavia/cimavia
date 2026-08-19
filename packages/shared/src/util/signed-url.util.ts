// Les médias privés (photo, vidéo, note vocale, document, justificatif de facture) ne sont jamais
// servis par une URL publique : l'API signe un GET à durée courte, régénéré à chaque lecture.
//
// La valeur vit ici plutôt que dans l'API parce qu'elle fait partie du CONTRAT : elle est déjà
// renvoyée aux clients sous `UploadUrlDto.expiresIn`, et un client qui garde une URL en cache doit
// pouvoir dire lui-même si elle vaut encore quelque chose. C'est la même logique que les plafonds
// `MAX_FEEDBACK_*` — une seule source, des deux côtés du réseau.

// Durée de validité par défaut des URLs signées (secondes). Courte : l'URL n'est qu'un ticket
// d'accès ponctuel, et c'est ce qui rend le bucket privé sûr (cf. dette P3-3).
export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Marge avant l'échéance en deçà de laquelle on considère l'URL comme perdue.
 *
 * Elle couvre deux écarts qu'un client ne peut pas mesurer : le délai entre la signature côté
 * serveur et l'arrivée de la réponse (l'URL est donc TOUJOURS un peu plus vieille que ce que le
 * client croit), et le temps que met une ouverture à atteindre le storage. Sans marge, une URL
 * jugée valide à la milliseconde près arriverait périmée.
 */
const SIGNED_URL_SAFETY_MARGIN_SECONDS = 30;

/**
 * Une URL signée reçue à `receivedAtMs` est-elle encore ouvrable à `nowMs` ?
 *
 * Sert à décider s'il faut re-signer AVANT d'ouvrir un média : un cache client peut très bien
 * détenir une URL morte sans le savoir — le cache TanStack de l'app mobile est persisté sept jours,
 * il en ressort donc des URLs signées la semaine passée. Ouvrir sans vérifier envoie l'utilisateur
 * sur la réponse 403 du storage, illisible.
 *
 * `receivedAtMs` est la date d'ARRIVÉE de la réponse (`dataUpdatedAt` côté TanStack Query), pas
 * celle de la signature, que le client ignore : d'où la marge, qui absorbe l'écart.
 */
export function isSignedUrlUsable(receivedAtMs: number, nowMs: number): boolean {
  const ageSeconds = (nowMs - receivedAtMs) / 1000;
  return ageSeconds < SIGNED_URL_TTL_SECONDS - SIGNED_URL_SAFETY_MARGIN_SECONDS;
}
