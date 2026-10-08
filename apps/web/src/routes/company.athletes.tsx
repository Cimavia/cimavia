import { createFileRoute } from "@tanstack/react-router";
import { CompanyAthletesScreen } from "@/feature/company";
import { CmvRoleGate } from "@/shared/component";

/** Les athlètes de l'entreprise (#602). Gardée `company` : un coach ou un athlète n'y a rien. */
export const Route = createFileRoute("/company/athletes")({
  component: () => (
    <CmvRoleGate capability="company">
      <CompanyAthletesScreen />
    </CmvRoleGate>
  ),
});
