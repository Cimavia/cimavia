import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { OBJECT_DELETE_CONCURRENCY, ObjectPurgeService } from "./object-purge.service";
import type { StorageService } from "./storage.service";

/** Ce que le SDK S3 lève : la réponse recopiée sur l'exception, clé comprise. */
function s3Failure(key: string): Error {
  return Object.assign(new Error("Access Denied."), {
    name: "AccessDenied",
    Key: key,
    Resource: `/cimavia/${key}`,
  });
}

/** Les tables qui citent une clé : vides, sauf `cited`, citées par un justificatif de facture. */
function citingTables(cited: string[] = []) {
  const none = () => ({ findMany: vi.fn().mockResolvedValue([]) });
  return {
    exerciseDocument: none(),
    scheduledSessionExerciseDocument: none(),
    feedbackMedia: none(),
    message: none(),
    invoice: {
      findMany: vi.fn(async ({ where }: { where: { documentPath: { in: string[] } } }) =>
        where.documentPath.in
          .filter((key) => cited.includes(key))
          .map((documentPath) => ({ documentPath })),
      ),
    },
  };
}

function purgeWith(
  rows: { id: string; key: string }[],
  deleteObject = vi.fn(),
  cited: string[] = [],
) {
  const queue = {
    findMany: vi.fn().mockResolvedValue(rows),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const logger = { warn: vi.fn(), error: vi.fn() };
  const tables = { pendingObjectDeletion: queue, ...citingTables(cited) };
  // L'instantané des citations : la transaction rend la main au client lui-même.
  const db = {
    ...tables,
    $transaction: vi.fn((work: (tx: typeof tables) => unknown) => work(tables)),
  };
  const service = new ObjectPurgeService(
    db as unknown as PrismaService,
    { deleteObject } as unknown as StorageService,
    logger as unknown as PinoLogger,
  );
  return { service, queue, deleteObject, logger, db };
}

describe("ObjectPurgeService.drain", () => {
  it("retire l'objet avant la ligne, et compte ce qui est parti", async () => {
    const { service, queue, deleteObject } = purgeWith([
      { id: "1", key: "a" },
      { id: "2", key: "b" },
    ]);
    await expect(service.drain()).resolves.toBe(2);
    expect(deleteObject.mock.calls.map(([key]) => key)).toEqual(["a", "b"]);
    expect(queue.deleteMany).toHaveBeenCalledWith({ where: { id: "1" } });
    expect(queue.updateMany).not.toHaveBeenCalled();
  });

  it("garde la ligne d'un objet en échec et continue avec les suivants", async () => {
    const deleteObject = vi.fn().mockRejectedValueOnce(s3Failure("secret-nom.pdf"));
    const { service, queue, logger } = purgeWith(
      [
        { id: "1", key: "secret-nom.pdf" },
        { id: "2", key: "b" },
      ],
      deleteObject,
    );
    await expect(service.drain()).resolves.toBe(1);
    expect(queue.updateMany).toHaveBeenCalledWith({
      where: { id: "1" },
      data: { attempts: { increment: 1 } },
    });
    expect(queue.deleteMany).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("secret-nom.pdf");
  });

  it("s'arrête au bout de son budget, le reste attend le passage suivant", async () => {
    const { service, deleteObject } = purgeWith([{ id: "1", key: "a" }]);
    await expect(service.drain(10, 0)).resolves.toBe(0);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("drainSafely rend zéro quand la base ne répond plus, sans lever", async () => {
    const { service, queue, logger } = purgeWith([]);
    queue.findMany.mockRejectedValueOnce(new Error("base indisponible"));
    await expect(service.drainSafely()).resolves.toBe(0);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("drainSafely rend le nombre retiré quand tout va bien", async () => {
    const { service } = purgeWith([{ id: "1", key: "a" }]);
    await expect(service.drainSafely()).resolves.toBe(1);
  });

  // Rattachée de nouveau, la clé reste en file : c'est l'objet retiré qui solde une prise en
  // charge, jamais une lecture — redevenue orpheline, elle partira au passage suivant.
  it("ne retire pas un objet cité de nouveau, et le garde en file", async () => {
    const { service, queue, deleteObject } = purgeWith(
      [
        { id: "1", key: "rattache-de-nouveau.pdf" },
        { id: "2", key: "b" },
      ],
      vi.fn(),
      ["rattache-de-nouveau.pdf"],
    );
    await expect(service.drain()).resolves.toBe(1);
    expect(deleteObject.mock.calls.map(([key]) => key)).toEqual(["b"]);
    expect(queue.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { id: "2" } });
    expect(queue.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "1" },
      data: { attempts: { increment: 1 } },
    });
  });

  // Le cas que la lecture en tête de lot laissait passer : citée APRÈS le début du passage.
  it("relit la citation juste avant chaque retrait, dans un instantané", async () => {
    const { service, deleteObject, db } = purgeWith([
      { id: "1", key: "a" },
      { id: "2", key: "rattachee-pendant.pdf" },
    ]);
    deleteObject.mockImplementationOnce(async () => {
      db.invoice.findMany.mockResolvedValue([{ documentPath: "rattachee-pendant.pdf" }]);
    });
    await expect(service.drain()).resolves.toBe(1);
    expect(deleteObject.mock.calls.map(([key]) => key)).toEqual(["a"]);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
  });

  it("passe d'abord les objets les moins tentés, par lots bornés", async () => {
    const { service, queue } = purgeWith([]);
    await expect(service.drain(5)).resolves.toBe(0);
    expect(queue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        orderBy: [{ attempts: "asc" }, { createdAt: "asc" }],
      }),
    );
  });
});

describe("ObjectPurgeService.deleteOrDefer", () => {
  const KEY = "athlete/a1/invoice/p1/secret-nom.pdf";

  it("ne retire pas un objet qu'une autre ligne cite encore, ni ne le met en file", async () => {
    const { service, queue, deleteObject } = purgeWith([], vi.fn(), [KEY]);
    await service.deleteOrDefer(KEY);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(queue.createMany).not.toHaveBeenCalled();
  });

  it("retire l'objet sans passer par la file quand le stockage répond", async () => {
    const { service, queue, deleteObject, logger } = purgeWith([]);
    await service.deleteOrDefer(KEY);
    expect(deleteObject).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(queue.createMany).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("confie la clé à la file quand le stockage échoue, sans lever ni journaliser la clé", async () => {
    const deleteObject = vi.fn().mockRejectedValueOnce(s3Failure(KEY));
    const { service, queue, logger } = purgeWith([], deleteObject);
    await expect(service.deleteOrDefer(KEY)).resolves.toBeUndefined();
    expect(queue.createMany).toHaveBeenCalledExactlyOnceWith({
      data: [{ key: KEY }],
      skipDuplicates: true,
    });
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { count: 1, reason: "AccessDenied" },
      expect.any(String),
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("secret-nom.pdf");
  });

  it("ne lève pas quand la file échoue à son tour : l'objet reste au balayage", async () => {
    const deleteObject = vi.fn().mockRejectedValueOnce(s3Failure(KEY));
    const { service, queue, logger } = purgeWith([], deleteObject);
    queue.createMany.mockRejectedValueOnce(new Error("base indisponible"));
    await expect(service.deleteOrDefer(KEY)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledOnce();
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("secret-nom.pdf");
  });
});

describe("ObjectPurgeService.deleteManyOrDefer", () => {
  it("compte les clés d'un lot en un seul instantané, doublons compris une fois", async () => {
    const { service, db, deleteObject } = purgeWith([]);
    await service.deleteManyOrDefer(["a", "b", "a"]);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.invoice.findMany).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ where: { documentPath: { in: ["a", "b"] } } }),
    );
    expect(deleteObject.mock.calls.map(([key]) => key)).toEqual(["a", "b"]);
  });

  it("retire les objets que plus rien ne cite et garde celui qu'une ligne cite encore", async () => {
    const { service, queue, deleteObject } = purgeWith([], vi.fn(), ["partage.jpg"]);
    await service.deleteManyOrDefer(["seul.jpg", "partage.jpg"]);
    expect(deleteObject.mock.calls.map(([key]) => key)).toEqual(["seul.jpg"]);
    expect(queue.createMany).not.toHaveBeenCalled();
  });

  it("ne met en file que les clés en échec, en une seule écriture", async () => {
    const deleteObject = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(s3Failure("b-secret.jpg"))
      .mockRejectedValueOnce(s3Failure("c-secret.jpg"));
    const { service, queue, logger } = purgeWith([], deleteObject);
    await expect(
      service.deleteManyOrDefer(["a.jpg", "b-secret.jpg", "c-secret.jpg"], { exerciseId: "e1" }),
    ).resolves.toBeUndefined();
    expect(queue.createMany).toHaveBeenCalledExactlyOnceWith({
      data: [{ key: "b-secret.jpg" }, { key: "c-secret.jpg" }],
      skipDuplicates: true,
    });
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { exerciseId: "e1", count: 2, reason: "AccessDenied" },
      "objet à retirer : retrait en échec, confié à la file",
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("secret");
  });

  it("confie toutes les clés à la file quand la citation ne se lit pas", async () => {
    const { service, queue, db, deleteObject, logger } = purgeWith([]);
    db.$transaction.mockRejectedValueOnce(new Error("base indisponible"));
    await expect(service.deleteManyOrDefer(["a", "b"])).resolves.toBeUndefined();
    expect(deleteObject).not.toHaveBeenCalled();
    expect(queue.createMany).toHaveBeenCalledExactlyOnceWith({
      data: [{ key: "a" }, { key: "b" }],
      skipDuplicates: true,
    });
    // Aucun retrait n'a été tenté : le journal ne doit pas dire qu'il a échoué.
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { count: 2, reason: "Error" },
      "objet à retirer : citations illisibles, confié à la file sans retrait",
    );
  });

  it("situe l'échec de la file par le contexte de l'appelant, sans la clé", async () => {
    const deleteObject = vi.fn().mockRejectedValue(s3Failure("secret-nom.pdf"));
    const { service, queue, logger } = purgeWith([], deleteObject);
    queue.createMany.mockRejectedValueOnce(new Error("base indisponible"));
    await service.deleteManyOrDefer(["secret-nom.pdf"], { mediaId: "m1" });
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { mediaId: "m1", count: 1, reason: "Error" },
      expect.any(String),
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain("secret-nom.pdf");
  });

  it("borne les retraits simultanés, sans en perdre un", async () => {
    let inFlight = 0;
    let peak = 0;
    const deleteObject = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
    });
    const { service } = purgeWith([], deleteObject);
    const keys = Array.from({ length: 25 }, (_, index) => `k${index}`);
    await service.deleteManyOrDefer(keys);
    expect(deleteObject).toHaveBeenCalledTimes(25);
    expect(peak).toBe(OBJECT_DELETE_CONCURRENCY);
  });

  it("s'arrête au premier lot en échec : le reste rejoint la file sans tentative", async () => {
    const deleteObject = vi.fn().mockRejectedValueOnce(s3Failure("k0"));
    const { service, queue, logger } = purgeWith([], deleteObject);
    const keys = Array.from({ length: 25 }, (_, index) => `k${index}`);
    await service.deleteManyOrDefer(keys, { exerciseId: "e1" });
    expect(deleteObject).toHaveBeenCalledTimes(OBJECT_DELETE_CONCURRENCY);
    const queued = queue.createMany.mock.calls[0]?.[0].data.map(({ key }: { key: string }) => key);
    expect(queued).toEqual(["k0", ...keys.slice(OBJECT_DELETE_CONCURRENCY)]);
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { exerciseId: "e1", count: 16, reason: "AccessDenied" },
      "objet à retirer : retrait en échec, confié à la file",
    );
  });

  it("relit les citations avant chaque lot : une clé citée entre-temps reste", async () => {
    const { service, db, deleteObject } = purgeWith([]);
    const keys = Array.from({ length: 15 }, (_, index) => `k${index}`);
    deleteObject.mockImplementation(async () => {
      db.invoice.findMany.mockResolvedValue([{ documentPath: "k14" }]);
    });
    await service.deleteManyOrDefer(keys);
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(deleteObject).not.toHaveBeenCalledWith("k14");
    expect(deleteObject).toHaveBeenCalledTimes(14);
  });

  it("ne touche à rien sans clé", async () => {
    const { service, db, queue } = purgeWith([]);
    await service.deleteManyOrDefer([]);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(queue.createMany).not.toHaveBeenCalled();
  });
});
