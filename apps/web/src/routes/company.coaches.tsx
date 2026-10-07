import { createFileRoute } from "@tanstack/react-router";
import { CompanySectionScreen } from "@/feature/company";
import { CmvRoleGate } from "@/shared/component";

/** Les coachs de l'entreprise — vide jusqu'à #601. Gardée `company` : un coach ou un athlète n'y a rien. */
export const Route = createFileRoute("/company/coaches")({
  component: () => (
    <CmvRoleGate capability="company">
      <CompanySectionScreen section="coaches" />
    </CmvRoleGate>
  ),
});
