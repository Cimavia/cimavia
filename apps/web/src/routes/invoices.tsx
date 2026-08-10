import { createFileRoute } from "@tanstack/react-router";
import { InvoicesScreen } from "@/feature/invoice";
import { CmvRoleGate } from "@/shared/component";

/**
 * Factures émises : les DEUX rôles. Une seule route parce qu'il n'y a qu'une seule ressource —
 * `GET /invoices` est scopée par le tenant, le coach y lit celles qu'il a émises et l'athlète les
 * siennes. Ce que chacun peut en FAIRE diffère, et c'est l'écran qui le tranche (#27).
 */
export const Route = createFileRoute("/invoices")({
  component: () => (
    <CmvRoleGate capability={["coach", "athlete"]}>
      <InvoicesScreen />
    </CmvRoleGate>
  ),
});
