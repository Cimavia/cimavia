import { createFileRoute } from "@tanstack/react-router";
import { PlansScreen } from "@/feature/plan";
import { CmvRoleGate } from "@/shared/component";

// Liste des cycles du coach : coach seul. L'athlète lit SON cycle par une autre surface
// (`/me/plan`, à venir avec #25) — ce n'est ni la même route ni les mêmes données.
export const Route = createFileRoute("/plans/")({
  component: () => (
    <CmvRoleGate capability="coach">
      <PlansScreen />
    </CmvRoleGate>
  ),
});
