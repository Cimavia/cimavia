import { createFileRoute } from "@tanstack/react-router";
import { AthleteSessionScreen } from "@/feature/plan";

/**
 * Détail d'une séance, côté ATHLÈTE : `/me/scheduled-sessions/:id`, gardée `@Roles([ATHLETE])`.
 * Le coach ouvre les siennes depuis son builder, sur une autre route et une autre surface — d'où
 * deux chemins plutôt qu'un écran qui devinerait.
 *
 * Fichier `.index.tsx` et non `sessions.$sessionId.tsx` : ce dernier est le LAYOUT du sous-arbre
 * (il porte la garde et l'`<Outlet />`), celui-ci en est la feuille exacte.
 */
export const Route = createFileRoute("/sessions/$sessionId/")({
  component: AthleteSessionScreen,
});
