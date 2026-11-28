import { describe, expect, it, vi } from "vitest";
import type { InvoiceService } from "../invoice/service/invoice.service";
import type { TenantTx } from "../tenancy/tenancy.extension";
import { athleteRecipientOrThrow, propagateAthlete } from "./plan.recipient";

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

/**
 * L'ordre des verrous, et non leur effet : un interblocage ne se provoque pas à coup sûr dans un
 * e2e. Une insertion verrouille la suite par numéro croissant (#231) ; l'affectation, qui touche
 * toutes les semaines, doit les prendre dans le même ordre (#689).
 */
describe("propagateAthlete", () => {
  it("écrit les semaines une à une, dans l'ordre de leur numéro", async () => {
    const written: string[] = [];
    const findMany = vi.fn(async () => [{ id: "w1" }, { id: "w5" }, { id: "w2" }]);
    const tx = {
      planWeek: {
        findMany,
        update: vi.fn(async ({ where }: { where: { id: string } }) => {
          written.push(where.id);
        }),
      },
      scheduledSession: { updateMany: vi.fn(), findMany: vi.fn(async () => []) },
    } as unknown as TenantTx;
    const invoices = { followPlanAthlete: vi.fn() } as unknown as InvoiceService;

    await propagateAthlete(tx, invoices, "p1", "ath_lea");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { planId: "p1" }, orderBy: { weekNumber: "asc" } }),
    );
    // L'ordre rendu par la lecture triée, sans réordonnancement : c'est lui que Postgres verrouille.
    expect(written).toEqual(["w1", "w5", "w2"]);
  });
});
