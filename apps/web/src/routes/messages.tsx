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
  // Coach seul en l'état. #29 ouvre cette route à l'athlète (fil unique, sans colonne de fils) :
  // c'est le seul endroit à changer, l'écran se branchera sur la capacité pour choisir sa mise en
  // page — mais il ne sera toujours pas monté pour un rôle qui n'a rien à y faire.
  component: () => (
    <CmvRoleGate capability="coach">
      <MessagesScreen />
    </CmvRoleGate>
  ),
});
