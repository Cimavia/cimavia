import { describe, expect, it } from "vitest";
import { updateCapabilitiesSchema } from "./capability.schema";

describe("updateCapabilitiesSchema", () => {
  it("accepte une capacité, ou les deux", () => {
    expect(updateCapabilitiesSchema.safeParse({ isCoach: true, isAthlete: false }).success).toBe(
      true,
    );
    expect(updateCapabilitiesSchema.safeParse({ isCoach: true, isAthlete: true }).success).toBe(
      true,
    );
  });

  /**
   * La même règle qu'à l'inscription : un compte sans capacité se retrouverait devant une
   * application vide, sans rien pour l'expliquer.
   */
  it("refuse de tout retirer", () => {
    expect(updateCapabilitiesSchema.safeParse({ isCoach: false, isAthlete: false }).success).toBe(
      false,
    );
  });

  /**
   * Les deux champs sont REQUIS : c'est l'état visé, pas un delta. Accepter un champ absent
   * obligerait le serveur à le fusionner avec l'existant, et deux requêtes concurrentes décochant
   * chacune une case pourraient laisser le compte sans aucune capacité.
   */
  it("exige les deux drapeaux, et refuse un champ inconnu", () => {
    expect(updateCapabilitiesSchema.safeParse({ isCoach: true }).success).toBe(false);
    expect(
      updateCapabilitiesSchema.safeParse({ isCoach: true, isAthlete: false, role: "COACH" })
        .success,
    ).toBe(false);
  });
});
