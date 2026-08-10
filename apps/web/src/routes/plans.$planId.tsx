import { createFileRoute } from "@tanstack/react-router";
import { PlanBuilderScreen } from "@/feature/plan";
import { CmvRoleGate } from "@/shared/component";

// Builder de planification : coach seul, et il le RESTE (web-only, #20).
export const Route = createFileRoute("/plans/$planId")({
  component: () => (
    <CmvRoleGate capability="coach">
      <PlanBuilderScreen />
    </CmvRoleGate>
  ),
});
