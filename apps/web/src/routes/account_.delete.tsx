import { CAPABILITY_NAMES } from "@cmv/shared";
import { createFileRoute } from "@tanstack/react-router";
import { DeleteAccountScreen } from "@/feature/account";
import { CmvRoleGate } from "@/shared/component";

/**
 * Supprimer son compte (#795), pour toute capacité. `account_` : la page ne se monte pas dans
 * `/account`, qui n'a pas d'`Outlet`. Déconnecté, la garde passe par la connexion et y revient.
 */
export const Route = createFileRoute("/account_/delete")({
  component: () => (
    <CmvRoleGate capability={CAPABILITY_NAMES}>
      <DeleteAccountScreen />
    </CmvRoleGate>
  ),
});
