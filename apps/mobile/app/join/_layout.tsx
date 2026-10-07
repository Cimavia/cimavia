import { Stack } from "expo-router";
import { CmvCapabilityGate } from "@/shared/component";

// « Mes coachs » : athlète seul (`GET /me/coaches`, `POST /invitations/accept`, `@Roles([ATHLETE])`).
// Dossier plutôt que fichier plat, uniquement pour porter cette garde — la route reste `/join`,
// que les notifications d'invitation déjà émises et le planning visent (#599).
export default function Layout() {
  return (
    <CmvCapabilityGate capability="athlete">
      <Stack screenOptions={{ headerShown: false }} />
    </CmvCapabilityGate>
  );
}
