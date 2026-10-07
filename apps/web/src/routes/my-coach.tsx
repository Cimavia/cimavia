import { createFileRoute } from "@tanstack/react-router";
import { MyCoachesScreen } from "@/feature/coach";
import { CmvRoleGate } from "@/shared/component";

/**
 * « Mes coachs » : athlète seul. L'url garde son nom d'origine — un favori ou une notification déjà
 * émise y mène encore (#599). Le pendant coach n'est pas une route mais le tableau de suivi de
 * `/` (#113) — la relation se lit par ses deux bouts, elle ne se partage pas un écran.
 */
export const Route = createFileRoute("/my-coach")({
  component: () => (
    <CmvRoleGate capability="athlete">
      <MyCoachesScreen />
    </CmvRoleGate>
  ),
});
