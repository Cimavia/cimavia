import { STALE_WRITE } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import { assertReadAtVersion, assertWrittenAtVersion, writeAtVersion } from "./stale-write.util";

describe("assertWrittenAtVersion", () => {
  it("laisse passer une écriture qui a eu lieu, sans relire", async () => {
    const exists = vi.fn(() => Promise.resolve(true));

    await expect(assertWrittenAtVersion(1, exists, "Introuvable")).resolves.toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it("répond 409 quand l'élément existe encore : il a changé depuis la lecture", async () => {
    await expect(
      assertWrittenAtVersion(0, () => Promise.resolve(true), "Introuvable"),
    ).rejects.toMatchObject({ status: 409, message: STALE_WRITE });
  });

  // « Recharger » ne trouverait rien : l'élément supprimé se dit comme tel.
  it("répond 404 quand l'élément a disparu", async () => {
    await expect(
      assertWrittenAtVersion(0, () => Promise.resolve(false), "Exercice introuvable"),
    ).rejects.toMatchObject({ status: 404, message: "Exercice introuvable" });
  });
});

describe("assertReadAtVersion", () => {
  const read = new Date("2026-10-12T08:00:00.000Z");

  it("laisse passer la version lue, quelle que soit son écriture", () => {
    expect(() => assertReadAtVersion(read, new Date("2026-10-12T08:00:00Z"))).not.toThrow();
  });

  it("répond 409 sur une version déjà dépassée", () => {
    expect(() => assertReadAtVersion(read, new Date("2026-10-12T07:59:59.999Z"))).toThrow(
      expect.objectContaining({ status: 409, message: STALE_WRITE }),
    );
  });
});

describe("writeAtVersion", () => {
  const expected = new Date("2026-10-12T08:00:00.000Z");
  const delegate = (count: number, remaining: number) => ({
    updateMany: vi.fn(() => Promise.resolve({ count })),
    count: vi.fn(() => Promise.resolve(remaining)),
  });

  // La version avance même sans autre champ : c'est elle que la prochaine écriture citera.
  it("écrit sous la version lue, et la fait avancer", async () => {
    const db = delegate(1, 1);

    await writeAtVersion(db, "el-1", expected, { title: "Force" }, "Introuvable");

    const [args] = db.updateMany.mock.calls[0] as unknown as [
      { where: unknown; data: { title: string; updatedAt: Date } },
    ];
    expect(args.where).toEqual({ id: "el-1", updatedAt: expected });
    expect(args.data.title).toBe("Force");
    expect(args.data.updatedAt.getTime()).toBeGreaterThan(expected.getTime());
    expect(db.count).not.toHaveBeenCalled();
  });

  it("répond 404 quand rien n'est écrit et que l'élément a disparu", async () => {
    await expect(
      writeAtVersion(delegate(0, 0), "el-1", expected, {}, "Séance introuvable"),
    ).rejects.toMatchObject({ status: 404, message: "Séance introuvable" });
  });

  it("répond 409 quand rien n'est écrit et que l'élément existe encore", async () => {
    await expect(
      writeAtVersion(delegate(0, 1), "el-1", expected, {}, "Introuvable"),
    ).rejects.toMatchObject({ status: 409, message: STALE_WRITE });
  });
});
