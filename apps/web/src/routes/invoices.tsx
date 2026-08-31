import type { CapabilityName } from "@cmv/shared";
import { createFileRoute } from "@tanstack/react-router";
import { InvoicesScreen } from "@/feature/invoice";
import { CmvRoleGate } from "@/shared/component";

/**
 * `?as=coach|athlete` — à quel titre on lit cette ressource.
 *
 * Factures émises : les DEUX capacités, une seule route, parce qu'il n'y a qu'une seule ressource
 * — `GET /invoices` est scopée par le tenant, le coach y lit celles qu'il a émises et l'athlète
 * les siennes (#27). Ce que chacun peut en FAIRE diffère, et c'est l'écran qui le tranche.
 *
 * Le titre est dans l'URL, et pas seulement dans l'état de l'écran, pour deux raisons : la nav en
 * fait DEUX entrées distinctes pour un compte à double capacité — sans quoi elles se surligneraient
 * ensemble, visant la même adresse (#129) — et l'API l'exige de ce compte, faute de quoi elle
 * répond 400 plutôt que de choisir à sa place (#10).
 *
 * Clé REQUISE mais possiblement `undefined` (et non `as?:`) : sous `exactOptionalPropertyTypes`,
 * « absente » et « présente à undefined » ne sont pas la même chose, et TanStack construit
 * toujours l'objet.
 */
export type InvoicesSearch = { as: CapabilityName | undefined };

export function parseAsSearch(value: unknown): CapabilityName | undefined {
  return value === "coach" || value === "athlete" ? value : undefined;
}

export const Route = createFileRoute("/invoices")({
  validateSearch: (search: Record<string, unknown>): InvoicesSearch => ({
    as: parseAsSearch(search.as),
  }),
  component: () => (
    <CmvRoleGate capability={["coach", "athlete"]}>
      <InvoicesScreen />
    </CmvRoleGate>
  ),
});
