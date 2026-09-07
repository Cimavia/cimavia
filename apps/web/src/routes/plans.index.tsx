import { PLAN_ROW_FILTERS, type PlanRowFilter } from "@cmv/shared";
import { createFileRoute } from "@tanstack/react-router";
import { PlansScreen } from "@/feature/plan";
import { CmvRoleGate } from "@/shared/component";

/**
 * `?q=`, `?state=` et `?athlete=` — l'état de la barre d'outils et l'athlète déplié vivent dans
 * l'URL, comme ceux de la facturation (#120) et du tableau de suivi (#123).
 *
 * Une vue filtrée se recharge, se met en favori et survit à un aller-retour vers le constructeur :
 * un filtre qui ne passe pas F5 n'est pas le même produit — et ici l'aller-retour est le geste
 * COURANT, puisque ouvrir un cycle quitte l'écran. Ce qui n'y est PAS, délibérément : la page de
 * l'historique déplié. Elle appartient à un athlète et meurt avec son dépliage.
 *
 * `state` et non `situation` : les segments s'intitulent « État », et une URL qui nomme autrement
 * ce que l'écran affiche se relit mal. Absente, elle vaut « Tous ». Une valeur inconnue y est
 * ramenée : un paramètre malformé n'est pas une mesure métier manquante, et refuser de rendre
 * l'écran serait disproportionné.
 *
 * Pas de `?as=` ici, contrairement à la facturation : `GET /plans` est une surface COACH, il n'y a
 * pas deux titres possibles pour la lire.
 */
export type PlansSearch = {
  q: string | undefined;
  state: PlanRowFilter | undefined;
  athlete: string | undefined;
};

// `find` plutôt qu'`includes` : `PLAN_ROW_FILTERS.includes(x)` exigerait de forcer le type de `x`
// avant de l'avoir vérifié, ce qui vide le contrôle de son sens.
function toState(value: unknown): PlanRowFilter | undefined {
  return PLAN_ROW_FILTERS.find((known) => known === value);
}

/**
 * Nommée et exportée plutôt qu'écrite en ligne : c'est la seule chose de ce fichier qui DÉCIDE —
 * ce qu'une URL bricolée à la main devient avant d'atteindre l'écran — et elle s'éprouve alors
 * sans monter de routeur.
 */
export function parsePlansSearch(search: Record<string, unknown>): PlansSearch {
  return {
    q: typeof search.q === "string" && search.q.length > 0 ? search.q : undefined,
    state: toState(search.state),
    athlete:
      typeof search.athlete === "string" && search.athlete.length > 0 ? search.athlete : undefined,
  };
}

// Liste des cycles du coach : coach seul. L'athlète lit SON cycle par une autre surface
// (`/me/plans`, #25) — ce n'est ni la même route ni les mêmes données.
export const Route = createFileRoute("/plans/")({
  validateSearch: parsePlansSearch,
  component: () => (
    <CmvRoleGate capability="coach">
      <PlansScreen />
    </CmvRoleGate>
  ),
});
