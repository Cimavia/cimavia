import { Stack } from "expo-router";
import { CmvCapabilityGate } from "@/shared/component";

// Fiche athlète : coach seul (`GET /athletes/:id/sheet`, `@Roles([COACH])`).
// La garde est ici et non dans l'écran : les hooks partiraient avant tout `return`.
export default function Layout() {
  return (
    <CmvCapabilityGate capability="coach">
      <Stack screenOptions={{ headerShown: false }} />
    </CmvCapabilityGate>
  );
}
