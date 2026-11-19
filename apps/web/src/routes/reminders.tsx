import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/feature/auth";
import { RemindersScreen } from "@/feature/reminder";

/**
 * Rappels : coach seul, et pas seulement par convention. `Reminder` est scopé `coachId` **seul** —
 * un athlète qui atteint ce modèle prend une *erreur* (fail closed), pas un 403. Cette garde est la
 * seconde des deux que le modèle exige, après le `@Roles([Role.COACH])` du contrôleur.
 */
export const Route = createFileRoute("/reminders")({
  component: () => (
    <RoleGate capability="coach">
      <RemindersScreen />
    </RoleGate>
  ),
});
