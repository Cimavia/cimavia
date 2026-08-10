import { createFileRoute } from "@tanstack/react-router";
import { MessagesScreen } from "@/feature/message";
import { CmvRoleGate } from "@/shared/component";

/**
 * `?athlete=<id>` — le fil ouvert vit dans l'URL, pas dans un `useState`.
 *
 * C'est ce qui permet au tableau de suivi du dashboard d'ouvrir directement la bonne conversation
 * (#113), et accessoirement de recharger la page ou d'utiliser le bouton Retour sans perdre le fil.
 *
 * Clé REQUISE mais possiblement `undefined` (et non `athlete?: string`) : sous
 * `exactOptionalPropertyTypes`, « absente » et « présente à undefined » ne sont pas la même chose,
 * et TanStack construit toujours l'objet.
 */
export type MessagesSearch = { athlete: string | undefined };

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): MessagesSearch => ({
    athlete:
      typeof search.athlete === "string" && search.athlete.length > 0 ? search.athlete : undefined,
  }),
  // Les DEUX rôles : `conversation.controller.ts` et `message.controller.ts` portent
  // `@Roles([COACH, ATHLETE])`, et un fil est 1:1. Ce que chacun y voit diffère (N fils contre un
  // seul), et c'est l'écran qui le tranche — pas la garde.
  component: () => (
    <CmvRoleGate capability={["coach", "athlete"]}>
      <MessagesScreen />
    </CmvRoleGate>
  ),
});
