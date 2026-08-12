import { Stack } from "expo-router";
import { CmvCapabilityGate } from "@/shared/component";

// Rejoindre un coach : athlète seul (`POST /invitations/accept`, `@Roles([ATHLETE])`).
// Dossier plutôt que fichier plat, uniquement pour porter cette garde — la route reste `/join`.
export default function Layout() {
  return (
    <CmvCapabilityGate capability="athlete">
      <Stack screenOptions={{ headerShown: false }} />
    </CmvCapabilityGate>
  );
}
