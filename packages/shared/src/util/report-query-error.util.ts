import { ApiError } from "../api/client";

/**
 * Faut-il envoyer à Sentry une erreur de requête ou de mutation ? (#699)
 *
 * Le client ne signale que ce que l'API n'a PAS pu voir : celle-ci capture déjà toute réponse
 * qu'elle écrit, 4xx comme 5xx (#697) — la reprendre ferait un doublon par incident. Reste :
 * - une `ApiError` que l'API n'a pas écrite (`fromApi` faux) : la page de cloudflared pendant un
 *   redémarrage, un portail captif, un corps vide ou illisible ;
 * - toute erreur qui n'est pas une `ApiError` : le réseau coupé alors que l'appareil se croit en
 *   ligne, ou une exception dans un `queryFn` ou un `select`, c'est-à-dire un bug du client.
 *
 * Deux silences, dans cet ordre :
 * - **hors-ligne, l'échec est normal** — l'athlète en salle sans réseau, c'est le cas d'usage de la
 *   lecture hors-ligne. `online` vient de `onlineManager.isOnline()`. Une exception de client levée
 *   à ce moment-là est perdue avec le reste : un vrai bug se reproduit en ligne.
 * - **le 401** : la session perdue est un signal traité à part (#336), pas une panne. #697 l'écarte
 *   de même côté API.
 *
 * Les erreurs de Better Auth n'arrivent pas ici : ses routes ne passent pas par le client d'API, et
 * les écrans d'auth lisent son `{ error }` au lieu de le lever. Si l'une d'elles devait un jour
 * être levée telle quelle dans une mutation, elle partirait comme un bug du client — c'est à
 * l'appelant de la traiter avant.
 */
export function shouldReportQueryError(error: unknown, online: boolean): boolean {
  if (!online) return false;
  if (!(error instanceof ApiError)) return true;
  if (error.status === 401) return false;
  return !error.fromApi;
}
