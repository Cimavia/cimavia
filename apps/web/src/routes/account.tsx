import { CAPABILITY_NAMES } from "@cmv/shared";
import { createFileRoute } from "@tanstack/react-router";
import { AccountScreen } from "@/feature/account";
import { CmvRoleGate } from "@/shared/component";

/**
 * Le compte : toutes les capacités, et c'est le point — c'est ici qu'on en ajoute une, et d'ici
 * qu'on supprime son compte, Entreprise comprise (#795). Une garde qui en exigerait une précise
 * fermerait la porte à celui qui vient l'ouvrir.
 */
export const Route = createFileRoute("/account")({
  component: () => (
    <CmvRoleGate capability={CAPABILITY_NAMES}>
      <AccountScreen />
    </CmvRoleGate>
  ),
});
