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
export const Route = createFileRoute("/")({
  component: () => (
    <CmvRoleGate
      capability="coach"
      fallback={<Navigate to="/planning" search={{ week: undefined }} replace />}
    >
      <DashboardScreen />
    </CmvRoleGate>
  ),
});
