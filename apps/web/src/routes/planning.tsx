import { createFileRoute } from "@tanstack/react-router";
import { AthletePlanningScreen } from "@/feature/plan";
import { CmvRoleGate } from "@/shared/component";

/**
 * `?week=<n>` — la semaine affichée vit dans l'URL, pas dans un `useState`.
 *
 * Un lien vers « ma semaine 3 » reste valable, le bouton Retour fait ce qu'on attend, et le défaut
 * (paramètre absent) suit le calendrier : demain, la même URL montre la semaine suivante.
 *
 * Clé REQUISE mais possiblement `undefined` (et non `week?: number`) : sous
 * `exactOptionalPropertyTypes`, « absente » et « présente à undefined » diffèrent, et TanStack
 * construit toujours l'objet.
 */
export type PlanningSearch = { week: number | undefined };

export const Route = createFileRoute("/planning")({
  validateSearch: (search: Record<string, unknown>): PlanningSearch => {
    const raw = Number(search.week);
    // Un numéro de semaine est un entier ≥ 1 ; tout le reste retombe sur le défaut plutôt que de
    // demander à l'écran une semaine qui ne peut pas exister.
    return { week: Number.isInteger(raw) && raw >= 1 ? raw : undefined };
  },
  component: () => (
    <CmvRoleGate capability="athlete">
      <AthletePlanningScreen />
    </CmvRoleGate>
  ),
});
