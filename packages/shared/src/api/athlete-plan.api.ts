import type { PlanDto, ScheduledSessionDto } from "../dto/plan.schema";
import type { ApiClient } from "./client";

/**
 * Appels HTTP de la LECTURE de planification par l'athlète, partagés web ↔ mobile.
 *
 * Deux routes suffisent aux trois écrans (planning, liste des séances, détail) : les cycles servis
 * portent déjà leurs semaines et leurs séances, la liste s'en dérive sans requête de plus.
 *
 * ⚠️ Ce module n'a rien de commun avec la surface COACH (`/plans`, `/plan-weeks`,
 * `/scheduled-sessions`), qui reste dans `apps/web` : ce ne sont pas deux copies d'un même appel
 * mais deux surfaces distinctes, gardées différemment (`@Roles([ATHLETE])` contre
 * `@Roles([COACH])`) et servant des besoins opposés — lire ce qu'on doit faire, contre composer ce
 * qu'un autre fera. Le builder reste par ailleurs web-only (#20).
 *
 * ⚠️ Le scope tenant ne dit RIEN du statut : c'est `AthletePlanService` qui impose `PUBLISHED`,
 * côté serveur et lui seul. Ne jamais reconstituer ce filtre côté client — un cycle brouillon ne
 * doit pas être filtré à l'affichage, il ne doit pas arriver.
 */

/**
 * UNE racine pour toute la lecture athlète, et pas les deux du coach.
 *
 * C'est un choix, pas une simplification : la clé de session du coach (`["scheduled-sessions",
 * "detail", id]`, `feature/plan/api.ts` côté web) désigne `/scheduled-sessions/:id`, celle-ci
 * désigne `/me/scheduled-sessions/:id`. Deux routes, deux gardes, deux contenus — les faire
 * partager une clé de cache marcherait tant qu'un rôle exclut l'autre, et deviendrait un bug
 * silencieux le jour où un même compte porte les deux capacités (#7).
 *
 * Racine unique aussi parce que le détail d'une séance est un ZOOM sur le cycle courant, pas une
 * autre ressource : débriefer change le statut de la séance ET le cycle qui la contient, et une
 * seule invalidation doit suffire à rafraîchir les deux.
 */
export const myPlanKeys = {
  all: ["my-plan"] as const,
  /**
   * Les cycles que l'athlète voit — au pluriel depuis #172, où ils ont cessé de se remplacer. La
   * clé a changé de nom AVEC la route : garder `current` aurait laissé croire qu'un seul cycle
   * répond, et c'est cette croyance-là qui a produit le défaut.
   */
  visible: () => ["my-plan", "visible"] as const,
  session: (sessionId: string) => ["my-plan", "session", sessionId] as const,
};

export type AthletePlanApi = {
  /**
   * Tous les cycles diffusés que l'athlète voit — semaines et séances comprises —, en cours puis à
   * venir. Liste VIDE s'il n'en a aucun : pas encore de coach, ou coach qui n'a rien diffusé. Le
   * `null` reste au niveau de la requête, que les écrans traitent séparément (chargement, panne).
   */
  visible: () => Promise<PlanDto[]>;
  /** Détail d'une séance : exercices, consignes, documents (URLs signées, donc réseau requis). */
  session: (sessionId: string) => Promise<ScheduledSessionDto>;
};

export function createAthletePlanApi(api: ApiClient): AthletePlanApi {
  return {
    visible: () => api.get<PlanDto[]>("/me/plans"),
    session: (sessionId) => api.get<ScheduledSessionDto>(`/me/scheduled-sessions/${sessionId}`),
  };
}
