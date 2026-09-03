import { createFileRoute } from "@tanstack/react-router";
import { FeedbacksScreen } from "@/feature/feedback";
import { CmvRoleGate } from "@/shared/component";

/**
 * `?feedback=<id>` — le débrief ouvert vit dans l'URL, pas dans un `useState`.
 *
 * C'est ce qui permet au tableau de suivi du dashboard d'ouvrir directement le dernier débrief non
 * lu d'un athlète (#113). Corollaire assumé : ouvrir un débrief le marque lu, que le clic vienne
 * de la liste ou de l'URL — les deux chemins passent par le même endroit (cf. `FeedbacksScreen`).
 *
 * `?session=<id>` désigne LE MÊME panneau, par la séance débriefée plutôt que par le débrief.
 * Il existe parce que la puce « à propos de… » d'un message qui cite une SÉANCE ne connaît pas
 * l'id du débrief — et parce que c'est déjà ainsi que le mobile adresse cet écran
 * (`/feedbacks/[sessionId]`). Deux paramètres pour une même cible est un doublon assumé le temps
 * de #121, qui refond cet écran et peut n'en garder qu'un.
 */
export type FeedbacksSearch = { feedback: string | undefined; session: string | undefined };

function param(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute("/feedbacks")({
  validateSearch: (search: Record<string, unknown>): FeedbacksSearch => ({
    feedback: param(search.feedback),
    session: param(search.session),
  }),
  // Débriefs reçus : c'est la surface de LECTURE du coach. L'athlète écrit les siens sur une autre
  // route (`/me/…`, à venir avec #26) — ouvrir celle-ci ne le servirait pas, elle liste N athlètes.
  component: () => (
    <CmvRoleGate capability="coach">
      <FeedbacksScreen />
    </CmvRoleGate>
  ),
});
