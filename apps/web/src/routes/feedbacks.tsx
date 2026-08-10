import { createFileRoute } from "@tanstack/react-router";
import { FeedbacksScreen } from "@/feature/feedback";
import { CmvRoleGate } from "@/shared/component";

/**
 * `?feedback=<id>` — le débrief ouvert vit dans l'URL, pas dans un `useState`.
 *
 * C'est ce qui permet au tableau de suivi du dashboard d'ouvrir directement le dernier débrief non
 * lu d'un athlète (#113). Corollaire assumé : ouvrir un débrief le marque lu, que le clic vienne
 * de la liste ou de l'URL — les deux chemins passent par le même endroit (cf. `FeedbacksScreen`).
 */
export type FeedbacksSearch = { feedback: string | undefined };

export const Route = createFileRoute("/feedbacks")({
  validateSearch: (search: Record<string, unknown>): FeedbacksSearch => ({
    feedback:
      typeof search.feedback === "string" && search.feedback.length > 0
        ? search.feedback
        : undefined,
  }),
  // Débriefs reçus : c'est la surface de LECTURE du coach. L'athlète écrit les siens sur une autre
  // route (`/me/…`, à venir avec #26) — ouvrir celle-ci ne le servirait pas, elle liste N athlètes.
  component: () => (
    <CmvRoleGate capability="coach">
      <FeedbacksScreen />
    </CmvRoleGate>
  ),
});
