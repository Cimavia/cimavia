import { Stack } from "expo-router";
import { CmvCapabilityGate } from "@/shared/component";

// Séance et débrief : athlète seul (`/me/scheduled-sessions/…`, `@Roles([ATHLETE])`).
// La garde est ici et non dans l'écran : les hooks partiraient avant tout `return`.
export default function Layout() {
  return (
    <CmvCapabilityGate capability="athlete">
      <Stack screenOptions={{ headerShown: false }} />
    </CmvCapabilityGate>
  );
}
