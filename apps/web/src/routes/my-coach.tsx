import { createFileRoute } from "@tanstack/react-router";
import { MyCoachScreen } from "@/feature/coach";
import { CmvRoleGate } from "@/shared/component";

/**
 * « Mon coach » : athlète seul. Le pendant coach n'est pas une route mais le tableau de suivi de
 * `/` (#113) — la relation se lit par ses deux bouts, elle ne se partage pas un écran.
 */
export const Route = createFileRoute("/my-coach")({
  component: () => (
    <CmvRoleGate capability="athlete">
      <MyCoachScreen />
    </CmvRoleGate>
  ),
});
