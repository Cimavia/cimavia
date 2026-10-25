import type { Capabilities } from "../capability";
import { CapabilityBlocker, type UpdateCapabilitiesInput } from "../dto/capability.schema";
import { type ApiClient, ApiError } from "./client";
import { ProblemType } from "./problem";

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

const BLOCKER_BY_PROBLEM: Readonly<Record<string, CapabilityBlocker>> = {
  [ProblemType.ACTIVE_ATHLETES]: CapabilityBlocker.ACTIVE_ATHLETES,
  [ProblemType.ACTIVE_COACH]: CapabilityBlocker.ACTIVE_COACH,
};

/**
 * Ce qui a empêché de retirer une capacité, d'après le `type` du problème. `null` pour tout le
 * reste — un code inconnu (API plus récente que ce client) ou une panne : l'appelant retombe sur
 * son message générique, jamais sur un identifiant brut.
 */
export function capabilityBlockerOf(error: unknown): CapabilityBlocker | null {
  return error instanceof ApiError ? (BLOCKER_BY_PROBLEM[error.type] ?? null) : null;
}
