import { createFileRoute } from "@tanstack/react-router";
import { PlanBuilderScreen } from "@/feature/plan";
import { CmvRoleGate } from "@/shared/component";

/**
 * `?session=` : la séance dont le panneau s'ouvre en arrivant — « Composer cette séance », depuis
 * une colonne de Dosage (#721). Facultatif : tous les autres liens ouvrent le cycle seul.
 */
export type PlanBuilderSearch = { session?: string };

export function parsePlanBuilderSearch(search: Record<string, unknown>): PlanBuilderSearch {
  return typeof search.session === "string" && search.session !== ""
    ? { session: search.session }
    : {};
}

// Builder de planification : coach seul, et il le RESTE (web-only, #20).
export const Route = createFileRoute("/plans/$planId")({
  validateSearch: parsePlanBuilderSearch,
  component: () => (
    <CmvRoleGate capability="coach">
      <PlanBuilderScreen />
    </CmvRoleGate>
  ),
});
