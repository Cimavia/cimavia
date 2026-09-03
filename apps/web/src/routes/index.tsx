import { ATHLETE_ROW_FILTERS, type AthleteRowFilter } from "@cmv/shared";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { DashboardScreen } from "@/feature/dashboard";
import { CmvRoleGate } from "@/shared/component";

/**
 * `/` est l'accueil du COACH — son tableau de bord.
 *
 * L'athlète n'a rien à y voir : il est renvoyé sur son planning, qui EST son accueil. Le fallback
 * portait jusqu'ici une page « ton espace arrive », légitime tant qu'aucun écran athlète n'existait
 * (#27) — elle n'a plus lieu d'être depuis que le planning est là (#25).
 *
 * `search` est requis mais peut valoir `undefined` : sans paramètre, le planning ouvre la semaine
 * courante, ce qui est exactement ce qu'on veut d'un accueil.
 */

/**
 * `?q=` et `?filter=` — l'état de la barre d'outils du tableau vit dans l'URL, pas dans un
 * `useState` (#123).
 *
 * Cet écran DISTRIBUE déjà des liens à paramètres (`/feedbacks?feedback=`, `/messages?athlete=`) ;
 * n'en accepter aucun serait incohérent. Et une vue filtrée se recharge, se met en favori, et
 * survit à un aller-retour vers un autre écran — un filtre qui ne passe pas F5 n'est pas le même
 * produit.
 *
 * Clés REQUISES mais possiblement `undefined` (et non `q?: string`) : sous
 * `exactOptionalPropertyTypes`, « absente » et « présente à undefined » ne sont pas la même chose,
 * et TanStack construit toujours l'objet.
 *
 * `filter` absent vaut « Tous ». Une valeur inconnue est ramenée là : un paramètre d'URL malformé
 * n'est pas une mesure métier manquante, et refuser de rendre l'écran pour ça serait disproportionné.
 */
export type DashboardSearch = {
  q: string | undefined;
  filter: AthleteRowFilter | undefined;
  /**
   * `?athlete=<id>` — la fiche ouverte. Elle vivait dans un `useState` de l'écran, donc n'était
   * atteignable QUE par un clic sur une ligne du tableau : rien ne pouvait y mener d'ailleurs, et
   * elle ne survivait ni au rechargement ni au bouton Retour. C'est le volet de lecture des
   * débriefs (#121) qui l'a rendu bloquant — sa maquette porte un « Voir la fiche athlète » qui
   * n'avait aucune adresse où pointer.
   */
  athlete: string | undefined;
};

// `some` plutôt que `includes` : `ATHLETE_ROW_FILTERS.includes(x)` exigerait de forcer le type de
// `x` avant de l'avoir vérifié, ce qui vide le contrôle de son sens.
function toFilter(value: unknown): AthleteRowFilter | undefined {
  return ATHLETE_ROW_FILTERS.find((known) => known === value);
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): DashboardSearch => ({
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    filter: toFilter(search.filter),
    athlete:
      typeof search.athlete === "string" && search.athlete.length > 0 ? search.athlete : undefined,
  }),
  component: () => (
    <CmvRoleGate
      capability="coach"
      fallback={<Navigate to="/planning" search={{ week: undefined }} replace />}
    >
      <DashboardScreen />
    </CmvRoleGate>
  ),
});
