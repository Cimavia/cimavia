import { type CapabilityName, hasCapability } from "@cmv/shared";
import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { useCapabilities } from "@/shared/hook/useCapabilities";
import { landingTab } from "@/shared/lib/tabs";

type CmvCapabilityGateProps = {
  capability: CapabilityName;
  children: ReactNode;
};

/**
 * Garde de capacité pour les routes HORS onglets, posée dans leur `_layout.tsx`.
 *
 * La barre d'onglets ne protège que ses propres écrans (`redirectForPath`) : tout ce qui vit à côté
 * — la fiche athlète, le détail d'une séance, les débriefs — est atteignable par un lien profond,
 * une notification ou un état de navigation restauré, sans qu'aucune capacité soit vérifiée. Ces
 * écrans appellent des routes gardées (`@Roles`), donc l'autre rôle y prend un **403 sur un écran
 * qu'il n'aurait jamais dû ouvrir**.
 *
 * Dans le layout et non dans l'écran, pour la même raison que `CmvRoleGate` côté web : les hooks
 * React s'exécutent avant tout `return`, donc une garde interne laisserait partir les requêtes.
 *
 * Tant que la session n'est pas résolue, on n'accorde ni ne refuse — sinon toute capacité
 * paraîtrait absente le temps d'un aller-retour.
 */
export function CmvCapabilityGate({ capability, children }: Readonly<CmvCapabilityGateProps>) {
  const capabilities = useCapabilities();

  if (capabilities.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-cmv-bg-0">
        <ActivityIndicator />
      </View>
    );
  }

  if (!hasCapability(capabilities, capability)) {
    return <Redirect href={landingTab(capabilities) ?? "/login"} />;
  }

  return <>{children}</>;
}
