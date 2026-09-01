import { createFileRoute } from "@tanstack/react-router";
import { AccountScreen } from "@/feature/account";
import { CmvRoleGate } from "@/shared/component";

/**
 * Le compte : les DEUX capacités, et c'est le point — c'est ici qu'on en ajoute une. Une garde qui
 * en exigerait une précise fermerait la porte à celui qui vient l'ouvrir.
 */
export const Route = createFileRoute("/account")({
  component: () => (
    <CmvRoleGate capability={["coach", "athlete"]}>
      <AccountScreen />
    </CmvRoleGate>
  ),
});
