import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { ObjectPurgeService } from "./object-purge.service";
import type { StorageService } from "./storage.service";

function purgeWith(rows: { id: string; key: string }[], deleteObject = vi.fn()) {
  const queue = {
    findMany: vi.fn().mockResolvedValue(rows),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const logger = { warn: vi.fn() };
  const service = new ObjectPurgeService(
    { pendingObjectDeletion: queue } as unknown as PrismaService,
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
    const deleteObject = vi.fn().mockRejectedValueOnce(new Error("panne"));
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
