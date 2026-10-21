import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { TenantTx } from "../tenancy/tenancy.extension";
import { StaleWriteException } from "../util/stale-write.util";
import { lockWeeksInOrder, touchWeeks } from "./plan-week.version";

/**
 * Une transaction factice qui retient l'ordre des écritures sur les semaines : c'est lui qu'on
 * affirme (#689). Un interblocage ne se provoque pas à coup sûr dans un e2e ; l'ordre, si.
 * `missing` désigne les semaines absentes de la base, `stale` celles dont la version a changé.
 */
function fakeTx({ missing = [], stale = [] }: { missing?: string[]; stale?: string[] } = {}) {
  const written: string[] = [];
  const exists = (id: string) => !missing.includes(id);
  const planWeek = {
    updateMany: vi.fn(async ({ where }: { where: { id: string; updatedAt?: Date } }) => {
      const refused = !exists(where.id) || (where.updatedAt != null && stale.includes(where.id));
      if (!refused) written.push(where.id);
      return { count: refused ? 0 : 1 };
    }),
    count: vi.fn(async ({ where }: { where: { id: string } }) => (exists(where.id) ? 1 : 0)),
    findMany: vi.fn(),
    update: vi.fn(async ({ where }: { where: { id: string } }) => {
      written.push(where.id);
    }),
  };
  return { tx: { planWeek } as unknown as TenantTx, planWeek, written };
}

const READ = new Date("2026-10-01T10:00:00.000Z");

describe("lockWeeksInOrder", () => {
  // Deux gestes croisés, S1 → S3 et S3 → S1, verrouillent dans le MÊME ordre : aucun ne tient la
  // semaine que l'autre attend.
  it("verrouille dans l'ordre des numéros de semaine, quel que soit l'ordre donné", async () => {
    const { tx, written } = fakeTx();

    await lockWeeksInOrder(tx, [
      { id: "s3", weekNumber: 3 },
      { id: "s1", weekNumber: 1, readAt: READ },
    ]);

    expect(written).toEqual(["s1", "s3"]);
  });

  // Départ et arrivée confondus — un changement de jour dans la même semaine : un seul verrou.
  it("ne verrouille qu'une fois une semaine citée deux fois", async () => {
    const { tx, written } = fakeTx();

    await lockWeeksInOrder(tx, [
      { id: "s2", weekNumber: 2 },
      { id: "s2", weekNumber: 2 },
    ]);

    expect(written).toEqual(["s2"]);
  });

  it("écrit sous la version lue quand elle est donnée, et répond 409 si elle a changé", async () => {
    const { tx, planWeek } = fakeTx({ stale: ["s1"] });

    await expect(lockWeeksInOrder(tx, [{ id: "s1", weekNumber: 1, readAt: READ }])).rejects.toThrow(
      StaleWriteException,
    );
    expect(planWeek.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1", updatedAt: READ } }),
    );
  });

  // Sans version, une semaine retirée entre-temps répond 404 — et non une clé étrangère violée
  // plus loin, en 500, quand la séance y serait posée.
  it("répond 404 sur une semaine disparue, même sans version lue", async () => {
    const { tx } = fakeTx({ missing: ["s3"] });

    await expect(
      lockWeeksInOrder(tx, [
        { id: "s1", weekNumber: 1 },
        { id: "s3", weekNumber: 3 },
      ]),
    ).rejects.toThrow(NotFoundException);
  });
});

describe("touchWeeks", () => {
  // Le décalage du cycle les touche toutes : une par une, dans l'ordre des numéros, pour ne pas
  // croiser l'ordre de `lockWeeksInOrder`.
  it("fait avancer les semaines une par une, dans l'ordre des numéros", async () => {
    const { tx, planWeek, written } = fakeTx();
    planWeek.findMany.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);

    await touchWeeks(tx, { planId: "pln_1" });

    expect(planWeek.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { planId: "pln_1" }, orderBy: { weekNumber: "asc" } }),
    );
    expect(written).toEqual(["s1", "s2"]);
  });
});
