import { createFileRoute } from "@tanstack/react-router";
import { AthleteHomeScreen, DashboardScreen } from "@/feature/dashboard";
import { CmvRoleGate } from "@/shared/component";

/**
 * `/` porte DEUX écrans, un par rôle : le tableau de bord du coach, et l'accueil de l'athlète —
 * lequel n'est pas un refus mais bien sa page. D'où le `fallback` explicite plutôt que la
 * redirection par défaut, qui renverrait ici en boucle.
 */
export const Route = createFileRoute("/")({
  component: () => (
    <CmvRoleGate capability="coach" fallback={<AthleteHomeScreen />}>
      <DashboardScreen />
    </CmvRoleGate>
  ),
});
