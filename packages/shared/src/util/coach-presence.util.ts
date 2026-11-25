import type { CoachAthleteDto } from "../dto/coach-athlete.schema";
import { isEndedLink } from "./follow.util";

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
 *
 * Seul un suivi EN COURS compte (#909) : un Coach quitté reste dans la liste pour relire l'archive,
 * mais l'athlète qui n'a plus que lui n'a plus de coach.
 */
export type CoachPresence = "loading" | "error" | "none" | "some";

export function coachPresence(query: {
  data: readonly Pick<CoachAthleteDto, "status">[] | undefined;
  isError: boolean;
}): CoachPresence {
  if (query.data != null) return query.data.some((link) => !isEndedLink(link)) ? "some" : "none";
  return query.isError ? "error" : "loading";
}
