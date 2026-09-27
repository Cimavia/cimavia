/**
 * Ce qu'une URL ne doit JAMAIS emporter vers un journal ou vers Sentry (#335, #433).
 *
 * Une seule liste pour les deux côtés du réseau : le web blanchit l'URL de la page et ses fils
 * d'Ariane, l'API celle des requêtes qu'elle reçoit. Un secret ajouté à l'une et oublié dans
 * l'autre fuirait par la couche qu'on ne regarde pas.
 *
 * En paramètre de requête :
 * - `token` — le lien de réinitialisation, côté web (`/reset-password?token=…`) comme dans la
 *   redirection que l'API renvoie vers lui ;
 * - `x-amz-signature` — une URL signée donne de quoi lire ou écrire un média sans être connecté ;
 * - `code` — défensif : aucune route ne le porte aujourd'hui, c'est le nom qu'un futur lien magique
 *   prendrait.
 *
 * En segment de chemin, là où `redact` de Pino ne sait pas réécrire une partie de chaîne :
 * - `/reset-password/<jeton>` — le lien que Better Auth met dans l'e-mail, qui arrive sur l'API ;
 * - `/push-tokens/<jeton>` — la révocation d'un appareil. Sans la sécurité renforcée du compte
 *   Expo, ce jeton suffit à pousser une notification vers l'appareil.
 *
 * Le NOM reste, seule la valeur part : un événement qui dit « il y avait un jeton ici » se
 * diagnostique mieux qu'une URL tronquée.
 */
const SECRET_PARAM = /([?&](?:token|code|x-amz-signature)=)[^&#\s]*/gi;
const SECRET_SEGMENT = /(\/(?:reset-password|push-tokens)\/)[^/?#\s]+/gi;

export const FILTERED = "[Filtered]";

export function redactUrlSecrets(text: string): string {
  return text.replace(SECRET_SEGMENT, `$1${FILTERED}`).replace(SECRET_PARAM, `$1${FILTERED}`);
}
