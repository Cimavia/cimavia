import { createFileRoute } from "@tanstack/react-router";
import { DosageScreen } from "@/feature/plan";
import { CmvRoleGate } from "@/shared/component";

// Dosage d'une séance planifiée (#721) : une page à elle, hors du builder — `$planId_` ne monte pas
// le builder autour. Coach seul, comme lui.
export const Route = createFileRoute("/plans/$planId_/dosage/$sessionId")({
  component: () => (
    <CmvRoleGate capability="coach">
      <DosageScreen />
    </CmvRoleGate>
  ),
});
