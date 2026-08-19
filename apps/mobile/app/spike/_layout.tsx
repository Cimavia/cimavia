import { Stack } from "expo-router";
import { CmvCapabilityGate } from "@/shared/component";

// SPIKE JETABLE — supprimer avec `feature/spike`.
// La route signe des URLs sous `/me/scheduled-sessions/…` (`@Roles([ATHLETE])`) : même garde que
// `app/session`, posée sur le layout pour que les hooks de l'écran ne partent pas pour rien.
export default function Layout() {
  return (
    <CmvCapabilityGate capability="athlete">
      <Stack screenOptions={{ headerShown: false }} />
    </CmvCapabilityGate>
  );
}
