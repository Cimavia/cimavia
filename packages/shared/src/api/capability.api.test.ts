import { describe, expect, it, vi } from "vitest";
import { CapabilityBlocker } from "../dto/capability.schema";
import { capabilityBlockerOf, capabilityKeys, createCapabilityApi } from "./capability.api";
import { type ApiClient, ApiError } from "./client";
import { ProblemType } from "./problem";

describe("createCapabilityApi", () => {
  /**
   * PATCH de l'ÉTAT VISÉ, les deux drapeaux ensemble : c'est ce que la route attend, et ce que le
   * schéma partagé valide. La réponse est rendue telle quelle — les capacités effectives.
   */
  it("envoie l'état visé en PATCH sur /me/capabilities et rend la réponse", async () => {
    const patch = vi.fn().mockResolvedValue({ isCoach: true, isAthlete: false });
    const capabilities = createCapabilityApi({ patch } as unknown as ApiClient);

    const result = await capabilities.update({ isCoach: true, isAthlete: false });

    expect(patch).toHaveBeenCalledExactlyOnceWith("/me/capabilities", {
      isCoach: true,
      isAthlete: false,
    });
    expect(result).toEqual({ isCoach: true, isAthlete: false });
  });

  // Web et mobile invalident ce cache après le réglage : une clé renommée d'un seul côté le
  // laisserait servir les anciennes capacités.
  it("range les capacités sous une clé de cache unique", () => {
    expect(capabilityKeys.all).toEqual(["capabilities"]);
  });
});

describe("capabilityBlockerOf", () => {
  it.each([
    [ProblemType.ACTIVE_ATHLETES, CapabilityBlocker.ACTIVE_ATHLETES],
    [ProblemType.ACTIVE_COACH, CapabilityBlocker.ACTIVE_COACH],
  ])("lit %s dans le type du problème", (type, blocker) => {
    expect(capabilityBlockerOf(new ApiError(409, "Refus", null, true, type))).toBe(blocker);
  });

  // API plus récente que le client, ou panne : l'appelant retombe sur son message générique.
  it("n'a rien à dire d'un type inconnu, d'un refus sans code ou d'une panne réseau", () => {
    expect(capabilityBlockerOf(new ApiError(409, "Refus", null, true, "urn:x:nouveau"))).toBeNull();
    expect(capabilityBlockerOf(new ApiError(409, "ACTIVE_COACH", null))).toBeNull();
    expect(capabilityBlockerOf(new TypeError("Failed to fetch"))).toBeNull();
  });
});
