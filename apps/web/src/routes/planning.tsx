import { isMondayIsoDate } from "@cmv/shared";
import { createFileRoute } from "@tanstack/react-router";
import { AthletePlanningScreen } from "@/feature/plan";
import { CmvRoleGate } from "@/shared/component";

/**
 * `?from=<lundi ISO>` — la semaine affichée vit dans l'URL, pas dans un `useState`.
 *
 * Un lien vers « ma semaine du 12 octobre » reste valable, le bouton Retour fait ce qu'on attend,
 * et le défaut (paramètre absent) suit le calendrier : la semaine prochaine, la même URL montre la
 * semaine suivante.
 *
 * Une DATE et non plus un numéro de semaine (`?week=3`, #172) : le numéro appartenait à UN cycle,
 * et deux cycles concurrents n'en sont pas à la même semaine — la S3 de l'un tombe sur la S1 de
 * l'autre. Seule la semaine civile est commune aux deux.
 *
 * Clé REQUISE mais possiblement `undefined` (et non `from?: string`) : sous
 * `exactOptionalPropertyTypes`, « absente » et « présente à undefined » diffèrent, et TanStack
 * construit toujours l'objet.
 */
export type PlanningSearch = { from: string | undefined };

export const Route = createFileRoute("/planning")({
  validateSearch: (search: Record<string, unknown>): PlanningSearch => {
    const raw = search.from;
    // Un LUNDI, et rien d'autre : une grille décalée d'un jour serait pire qu'un retour au défaut.
    return { from: typeof raw === "string" && isMondayIsoDate(raw) ? raw : undefined };
  },
  component: () => (
    <CmvRoleGate capability="athlete">
      <AthletePlanningScreen />
    </CmvRoleGate>
  ),
});
