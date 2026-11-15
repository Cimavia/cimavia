import type { TrainingCapability } from "@cmv/shared";
import { type Href, router } from "expo-router";

/** Ce dont `openUnder` a besoin du sélecteur de titre : savoir s'il existe, et le basculer. */
export type CapabilitySwitchControl = Readonly<{
  visible: boolean;
  select: (capability: TrainingCapability) => void;
}>;

/**
 * Ouvre un écran sous un titre : bascule le sélecteur, PUIS navigue — dans cet ordre, sinon
 * l'écran d'arrivée se rendrait une fois sous l'ancien titre. Le sélecteur n'est visible que pour
 * un compte qui cumule ; pour les autres, la question du titre ne se pose pas.
 *
 * Le seul endroit où vit ce geste : une notification ouverte (#344) et un écran d'un seul titre
 * qui mène à Factures ou Messages (#343) le partagent, faute de quoi l'un finirait par naviguer
 * sans basculer.
 */
export function openUnder(
  href: Href,
  capability: TrainingCapability,
  capabilitySwitch: CapabilitySwitchControl,
): void {
  if (capabilitySwitch.visible) capabilitySwitch.select(capability);
  router.push(href);
}
