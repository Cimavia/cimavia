import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/athletes` a fusionné avec le tableau de bord (#113) : la liste d'athlètes y est devenue le
 * tableau de suivi, sous les tuiles — c'est l'écran unique que décrivait la maquette depuis le
 * début (`coach_dashboard_athletes.dc.html`).
 *
 * La route SURVIT en redirection plutôt que d'être supprimée : des liens existent dans la nature
 * (favoris du coach, historique du navigateur), et un 404 sur un chemin qu'on a nous-mêmes publié
 * serait une régression gratuite. `replace: true` — l'étape intermédiaire ne doit pas piéger le
 * bouton Retour dans une boucle.
 */
export const Route = createFileRoute("/athletes")({
  beforeLoad: () => {
    throw redirect({
      to: "/",
      search: { q: undefined, filter: undefined, athlete: undefined },
      replace: true,
    });
  },
});
