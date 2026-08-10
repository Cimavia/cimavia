import { createFileRoute } from "@tanstack/react-router";
import { AthleteSessionScreen } from "@/feature/plan";
import { CmvRoleGate } from "@/shared/component";

/**
 * Détail d'une séance, côté ATHLÈTE : `/me/scheduled-sessions/:id`, gardée `@Roles([ATHLETE])`.
 * Le coach ouvre les siennes depuis son builder, sur une autre route et une autre surface — d'où
 * deux chemins plutôt qu'un écran qui devinerait.
 */
export const Route = createFileRoute("/sessions/$sessionId")({
  component: () => (
    <CmvRoleGate capability="athlete">
      <AthleteSessionScreen />
    </CmvRoleGate>
  ),
});
