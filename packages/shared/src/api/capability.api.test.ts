import { describe, expect, it, vi } from "vitest";
import { capabilityKeys, createCapabilityApi } from "./capability.api";
import type { ApiClient } from "./client";

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
