/**
 * L'athlète a-t-il un coach, et le sait-on ? (#364, #599)
 *
 * Quatre états, pas un booléen : « pas encore lu » et « lecture en échec » ne valent jamais
 * « aucun coach » (règle dure n°5). Le confondre disait « Aucun coach pour l'instant » à un athlète
 * qui en avait un, le temps d'un aller-retour — ou pour de bon, sur une API injoignable. Un
 * `boolean | null` aurait encore confondu les deux premiers, que l'écran ne rend pas pareil :
 * l'un attend, l'autre propose de réessayer.
 *
 * Une liste DÉJÀ lue l'emporte sur une erreur de relecture : le cache dit vrai, la panne est
 * passagère, et la remplacer par un écran d'erreur ferait disparaître ce que l'athlète voyait.
 */
export type CoachPresence = "loading" | "error" | "none" | "some";

export function coachPresence(query: {
  data: readonly unknown[] | undefined;
  isError: boolean;
}): CoachPresence {
  if (query.data != null) return query.data.length > 0 ? "some" : "none";
  return query.isError ? "error" : "loading";
}
