import { Stack } from "expo-router";
import { CmvCapabilityGate } from "@/shared/component";

// L'écran du compte Entreprise (#600) : à lui seul. Dossier plutôt que fichier plat, uniquement
// pour porter cette garde, comme `join/`.
export default function Layout() {
  return (
    <CmvCapabilityGate capability="company">
      <Stack screenOptions={{ headerShown: false }} />
    </CmvCapabilityGate>
  );
}
