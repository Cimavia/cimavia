import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ObjectPurgeService } from "./object-purge.service";
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
      findMany: vi.fn().mockResolvedValue(cited.map((documentPath) => ({ documentPath }))),
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
  const service = new ObjectPurgeService(
    { pendingObjectDeletion: queue, ...citingTables(cited) } as unknown as PrismaService,
    { deleteObject } as unknown as StorageService,
    logger as unknown as PinoLogger,
  );
  return { service, queue, deleteObject, logger };
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

  it("ne retire pas un objet cité de nouveau : sa prise en charge part, l'objet reste", async () => {
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
    expect(queue.deleteMany).toHaveBeenCalledWith({
      where: { key: { in: ["rattache-de-nouveau.pdf"] } },
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
      { reason: "AccessDenied" },
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
