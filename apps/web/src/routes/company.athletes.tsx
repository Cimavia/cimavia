import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/feature/auth";
import { CompanyAthletesScreen } from "@/feature/company";

/** Les athlètes de l'entreprise (#602). Gardée `company` : un coach ou un athlète n'y a rien. */
export const Route = createFileRoute("/company/athletes")({
  component: () => (
    <RoleGate capability="company">
      <CompanyAthletesScreen />
    </RoleGate>
  ),
});
