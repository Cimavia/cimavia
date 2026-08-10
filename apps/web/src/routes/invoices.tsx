import { createFileRoute } from "@tanstack/react-router";
import { InvoicesScreen } from "@/feature/invoice";
import { CmvRoleGate } from "@/shared/component";

/**
 * Suivi des factures émises — coach seul en l'état. #27 ouvrira cette route à l'athlète (vue
 * lecture seule) : c'est le `capability` d'ici qui bougera, l'écran ne saura toujours pas qui le
 * regarde.
 */
export const Route = createFileRoute("/invoices")({
  component: () => (
    <CmvRoleGate capability="coach">
      <InvoicesScreen />
    </CmvRoleGate>
  ),
});
