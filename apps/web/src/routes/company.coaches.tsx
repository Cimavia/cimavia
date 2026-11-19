import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/feature/auth";
import { CompanyCoachesScreen } from "@/feature/company";

/** Les coachs de l'entreprise (#601). Gardée `company` : un coach ou un athlète n'y a rien. */
export const Route = createFileRoute("/company/coaches")({
  component: () => (
    <RoleGate capability="company">
      <CompanyCoachesScreen />
    </RoleGate>
  ),
});
