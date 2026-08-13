import { Stack } from "expo-router";
import { CmvCapabilityGate } from "@/shared/component";

/**
 * Rappels : coach seul, et pas seulement par convention. `Reminder` est scopé `coachId` **seul** —
 * un athlète qui atteint ce modèle est refusé par l'extension Prisma via une *erreur*, pas un 403.
 * Le `@Roles([Role.COACH])` du contrôleur en fait un 403 ; cette garde évite d'émettre la requête.
 *
 * La garde est ICI et non dans l'écran : les hooks React s'exécutent avant tout `return`, une garde
 * en tête d'écran laisserait donc partir `GET /reminders` (tranché en #20).
 */
export default function Layout() {
  return (
    <CmvCapabilityGate capability="coach">
      <Stack screenOptions={{ headerShown: false }} />
    </CmvCapabilityGate>
  );
}
