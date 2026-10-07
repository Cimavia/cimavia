import type { TrainingCapability } from "@cmv/shared";
import { createFileRoute } from "@tanstack/react-router";
import { MessagesScreen } from "@/feature/message";
import { parseAsSearch } from "@/routes/invoices";
import { CmvRoleGate } from "@/shared/component";

/**
 * Le fil ouvert vit dans l'URL, pas dans un `useState` : `?athlete=<id>` côté coach, `?coach=<id>`
 * côté athlète (#599), chacun nommant l'interlocuteur. `?conversation=<id>` est la porte des
 * notifications, qui ne connaissent que le fil — l'écran le traduit en interlocuteur.
 *
 * C'est ce qui permet au tableau de suivi du dashboard d'ouvrir directement la bonne conversation
 * (#113), et accessoirement de recharger la page ou d'utiliser le bouton Retour sans perdre le fil.
 *
 * Clé REQUISE mais possiblement `undefined` (et non `athlete?: string`) : sous
 * `exactOptionalPropertyTypes`, « absente » et « présente à undefined » ne sont pas la même chose,
 * et TanStack construit toujours l'objet.
 */
export type MessagesSearch = {
  athlete: string | undefined;
  coach: string | undefined;
  conversation: string | undefined;
  as: TrainingCapability | undefined;
};

const idSearch = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): MessagesSearch => ({
    athlete: idSearch(search.athlete),
    coach: idSearch(search.coach),
    conversation: idSearch(search.conversation),
    // `?as=` : à quel titre on ouvre la messagerie. Même raison que sur `/invoices` — deux entrées
    // de nav distinctes pour un compte à double capacité, et l'API qui l'exige de lui (#129).
    as: parseAsSearch(search.as),
  }),
  // Les DEUX rôles : `conversation.controller.ts` et `message.controller.ts` portent
  // `@Roles([COACH, ATHLETE])`, et un fil est 1:1. Ce que chacun y voit diffère (un fil par
  // athlète, un fil par coach), et c'est l'écran qui le tranche — pas la garde.
  component: () => (
    <CmvRoleGate capability={["coach", "athlete"]}>
      <MessagesScreen />
    </CmvRoleGate>
  ),
});
