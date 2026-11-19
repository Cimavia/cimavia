import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/feature/auth";
import { DosageScreen } from "@/feature/plan";

/** `?type=` : la séance-type que Dosage règle — la première du cycle sans lui. */
export type DosageSearch = { type?: string };

export function parseDosageSearch(search: Record<string, unknown>): DosageSearch {
  return typeof search.type === "string" && search.type !== "" ? { type: search.type } : {};
}

// Dosage du cycle (#721) : une page à elle, hors du builder — `$planId_` ne monte pas le builder
// autour. Coach seul, comme lui.
export const Route = createFileRoute("/plans/$planId_/dosage")({
  validateSearch: parseDosageSearch,
  component: () => (
    <RoleGate capability="coach">
      <DosageScreen />
    </RoleGate>
  ),
});
