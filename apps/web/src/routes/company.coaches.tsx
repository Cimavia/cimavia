import { createFileRoute } from "@tanstack/react-router";
import { CompanyCoachesScreen } from "@/feature/company";
import { CmvRoleGate } from "@/shared/component";

/** Les coachs de l'entreprise (#601). Gardée `company` : un coach ou un athlète n'y a rien. */
export const Route = createFileRoute("/company/coaches")({
  component: () => (
    <CmvRoleGate capability="company">
      <CompanyCoachesScreen />
    </CmvRoleGate>
  ),
});
