import { describe, expect, it } from "vitest";
import { athleteRecipientOrThrow } from "./plan.recipient";

/**
 * Le narrowing du destinataire d'un cycle diffusé (#144). Ce qui se vérifie ici n'est pas la
 * comparaison — elle est triviale — mais le fait que la rupture d'invariant soit BRUYANTE.
 */
describe("athleteRecipientOrThrow", () => {
  it("rend le destinataire quand il y en a un", () => {
    expect(athleteRecipientOrThrow({ id: "pln_1", athleteId: "ath_lea" })).toBe("ath_lea");
  });

  /**
   * Un `!` aurait laissé passer `undefined` jusqu'à la notification, qui serait partie chez
   * personne sans que rien ne le dise — la panne muette que #172 décrit. L'erreur NOMME la ligne
   * fautive, parce qu'un état que le code prétend impossible ne se diagnostique pas autrement.
   */
  it("casse en nommant la ligne quand un cycle diffusé n'a personne", () => {
    expect(() => athleteRecipientOrThrow({ id: "pln_1", athleteId: null })).toThrow(/pln_1/);
  });
});
