import type { Capabilities } from "../capability";
import type { UpdateCapabilitiesInput } from "../dto/capability.schema";
import type { ApiClient } from "./client";

/**
 * Capacités du compte courant (#13), partagées web ↔ mobile : les deux plateformes offrent le même
 * réglage, sur une seule route.
 */
export const capabilityKeys = {
  all: ["capabilities"] as const,
};

export type CapabilityApi = {
  /**
   * Remplace les capacités du compte. Les deux drapeaux sont l'ÉTAT VISÉ, pas un delta — le
   * schéma partagé refuse d'en retirer les deux (400), et l'API refuse d'en retirer une qui porte
   * une relation active (409).
   */
  update: (input: UpdateCapabilitiesInput) => Promise<Capabilities>;
};

export function createCapabilityApi(api: ApiClient): CapabilityApi {
  return {
    update: (input) => api.patch<Capabilities>("/me/capabilities", input),
  };
}
