import { Prisma } from "@prisma/client";
import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ORPHAN_GRACE_MS } from "./orphan-sweep";
import { emptySweepReport, OrphanSweepService } from "./orphan-sweep.service";
import type { StorageService, StoredObject } from "./storage.service";

const NOW = new Date("2026-11-23T12:00:00Z");
const OLD = new Date(NOW.getTime() - ORPHAN_GRACE_MS);
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const key = (name: string) => `coach/c1/exercises/e1/${UUID}-${name}.pdf`;
const old = (name: string, size = 1): StoredObject => ({ key: key(name), lastModified: OLD, size });

/** Un bucket en `pages`, une base qui cite `cited` (par la bibliothèque d'exercices). */
function sweepWith(
  pages: (StoredObject[] | Error)[],
  cited: string[] = [],
  deleteObject = vi.fn(),
) {
  const rows = (storagePath: string) => ({ storagePath });
  const citing = {
    findMany: vi.fn(async ({ where }: { where: { storagePath: { in: string[] } } }) =>
      cited.filter((citedKey) => where.storagePath.in.includes(citedKey)).map(rows),
    ),
  };
  const none = { findMany: vi.fn().mockResolvedValue([]) };
  const tables = {
    exerciseDocument: citing,
    scheduledSessionExerciseDocument: none,
    feedbackMedia: none,
    message: none,
    invoice: none,
    pendingObjectDeletion: none,
  };
  const $transaction = vi.fn(
    async (run: (tx: typeof tables) => Promise<unknown>, _options?: object) => run(tables),
  );
  const listObjects = vi.fn(async function* (_options: { prefix?: string }) {
    for (const page of pages) {
      if (page instanceof Error) throw page;
      yield page;
    }
  });
  const logger = { warn: vi.fn() };
  const service = new OrphanSweepService(
    { ...tables, $transaction } as unknown as PrismaService,
    { listObjects, deleteObject } as unknown as StorageService,
    logger as unknown as PinoLogger,
  );
  return { service, deleteObject, logger, citing, listObjects, $transaction };
}

describe("OrphanSweepService.sweep", () => {
  it("rapporte sans rien supprimer en simulation", async () => {
    const { service, deleteObject } = sweepWith([[old("a", 10), old("b", 20)]], [key("a")]);

    const report = await service.sweep({ now: NOW, remove: false });

    expect(report).toEqual({
      scanned: 2,
      unknown: [],
      recent: 0,
      referenced: 1,
      orphans: [{ ...old("b", 20), family: "exercise" }],
      deleted: [],
      failed: [],
    });
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("supprime les seuls orphelins quand on le demande, et les nomme", async () => {
    const { service, deleteObject } = sweepWith([[old("a"), old("b")], [old("c")]], [key("a")]);

    const report = await service.sweep({ now: NOW, remove: true });

    expect(deleteObject.mock.calls.map(([deleted]) => deleted)).toEqual([key("b"), key("c")]);
    expect(report).toMatchObject({
      scanned: 3,
      referenced: 1,
      deleted: [key("b"), key("c")],
      failed: [],
    });
  });

  /**
   * Les six colonnes dans UN instantané : lues une à une, une copie créée puis sa source supprimée
   * entre deux lectures feraient passer une clé citée pour orpheline.
   */
  it("lit les citations d'une page dans une seule transaction en lecture répétable", async () => {
    const { service, $transaction } = sweepWith([[old("a")], [old("b")]]);

    await service.sweep({ now: NOW, remove: false });

    expect($transaction).toHaveBeenCalledTimes(2);
    expect($transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  });

  // La citation se relit page par page, juste avant de supprimer : pas sur une photo du bucket.
  it("confronte chaque page à la base avant de supprimer la suivante", async () => {
    const order: string[] = [];
    const deleteObject = vi.fn(async (deleted: string) => {
      order.push(`delete ${deleted}`);
    });
    const { service, citing } = sweepWith([[old("a")], [old("b")]], [], deleteObject);
    citing.findMany.mockImplementation(async ({ where }) => {
      order.push(`read ${where.storagePath.in.join()}`);
      return [];
    });

    await service.sweep({ now: NOW, remove: true });

    expect(order).toEqual([
      `read ${key("a")}`,
      `delete ${key("a")}`,
      `read ${key("b")}`,
      `delete ${key("b")}`,
    ]);
  });

  it("n'interroge la base que pour les objets reconnus et anciens", async () => {
    const { service, $transaction, deleteObject } = sweepWith([
      [
        { key: "backups/dump.sql", lastModified: OLD, size: 1 },
        { key: key("frais"), lastModified: NOW, size: 1 },
      ],
    ]);

    const report = await service.sweep({ now: NOW, remove: true });

    expect(report).toMatchObject({ scanned: 2, unknown: ["backups/dump.sql"], recent: 1 });
    expect($transaction).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("garde un échec au rapport et continue, sans journaliser la clé", async () => {
    const failure = Object.assign(new Error(`refus sur ${key("a")}`), { name: "AccessDenied" });
    const deleteObject = vi.fn().mockRejectedValueOnce(failure);
    const { service, logger } = sweepWith([[old("a"), old("b")]], [], deleteObject);

    const report = await service.sweep({ now: NOW, remove: true });

    expect(report).toMatchObject({ deleted: [key("b")], failed: [key("a")] });
    expect(logger.warn).toHaveBeenCalledWith(
      { family: "exercise", reason: "AccessDenied" },
      expect.any(String),
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(UUID);
  });

  it("donne le type d'un échec qui n'est pas une erreur", async () => {
    const deleteObject = vi.fn().mockRejectedValueOnce("panne");
    const { service, logger } = sweepWith([[old("a")]], [], deleteObject);

    await service.sweep({ now: NOW, remove: true });

    expect(logger.warn.mock.calls[0]?.[0]).toEqual({ family: "exercise", reason: "string" });
  });

  // Un balayage interrompu a peut-être déjà supprimé : l'appelant doit pouvoir le dire.
  it("laisse au rapport de l'appelant ce qui a été fait avant une panne", async () => {
    const outage = new Error("connexion perdue");
    const { service } = sweepWith([[old("a")], outage]);
    const report = emptySweepReport();

    await expect(service.sweep({ now: NOW, remove: true }, report)).rejects.toBe(outage);
    expect(report).toMatchObject({ scanned: 1, deleted: [key("a")] });
  });

  it("transmet le préfixe à la liste, et n'en pose aucun sans lui", async () => {
    const { service, listObjects } = sweepWith([]);

    await service.sweep({ now: NOW, remove: false, prefix: "conversation/" });
    await service.sweep({ now: NOW, remove: false });

    expect(listObjects.mock.calls).toEqual([
      [{ prefix: "conversation/" }],
      [{ prefix: undefined }],
    ]);
  });

  it("rend un rapport vide sur un bucket vide", async () => {
    const { service } = sweepWith([]);

    await expect(service.sweep({ now: NOW, remove: true })).resolves.toEqual(emptySweepReport());
  });
});
