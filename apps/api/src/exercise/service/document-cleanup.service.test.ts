import { DocumentType } from "@cmv/shared";
import type { PinoLogger } from "nestjs-pino";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import type { StorageService } from "../../infra/storage/storage.service";
import { DocumentCleanupService } from "./document-cleanup.service";

const FILE = { id: "doc-1", type: DocumentType.FILE, storagePath: "coach/c/exercises/e/a.jpg" };

function cleanupWith(counts: { copies: number; siblings: number }) {
  const cited = (count: number) => Array(count).fill({ storagePath: FILE.storagePath });
  const exerciseDocumentFindMany = vi.fn().mockResolvedValue(cited(counts.siblings));
  const db = {
    scheduledSessionExerciseDocument: { findMany: vi.fn().mockResolvedValue(cited(counts.copies)) },
    exerciseDocument: { findMany: exerciseDocumentFindMany },
  } as unknown as PrismaService;
  const deleteObject = vi.fn().mockResolvedValue(undefined);
  const storage = { deleteObject } as unknown as StorageService;
  const logger = { warn: vi.fn() };
  return {
    cleanup: new DocumentCleanupService(db, storage, logger as unknown as PinoLogger),
    deleteObject,
    exerciseDocumentFindMany,
    logger,
  };
}

/**
 * Les e2e montrent l'objet retenu par une séance planifiée et par une variante. Ici, ce que la
 * règle DÉCIDE pour chaque combinaison — dont la seule qui purge.
 */
describe("DocumentCleanupService.deleteObjectIfUnreferenced", () => {
  it("purge l'objet quand plus rien ne porte sa clé", async () => {
    const { cleanup, deleteObject } = cleanupWith({ copies: 0, siblings: 0 });
    await cleanup.deleteObjectIfUnreferenced(FILE);
    expect(deleteObject).toHaveBeenCalledWith(FILE.storagePath);
  });

  it.each([
    ["une séance planifiée", { copies: 1, siblings: 0 }],
    ["une variante de l'exercice", { copies: 0, siblings: 1 }],
  ])("garde l'objet que %s affiche encore", async (_label, counts) => {
    const { cleanup, deleteObject } = cleanupWith(counts);
    await cleanup.deleteObjectIfUnreferenced(FILE);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("ne compte pas le document supprimé parmi ceux qui retiennent la clé", async () => {
    const { cleanup, exerciseDocumentFindMany } = cleanupWith({ copies: 0, siblings: 0 });
    await cleanup.deleteObjectIfUnreferenced(FILE);
    expect(exerciseDocumentFindMany.mock.calls[0]?.[0].where).toEqual({
      storagePath: { in: [FILE.storagePath] },
      id: { not: FILE.id },
    });
  });

  it.each([
    ["un lien", { id: "doc-2", type: DocumentType.LINK, storagePath: null }],
    ["un fichier sans clé", { id: "doc-3", type: DocumentType.FILE, storagePath: null }],
  ])("ne touche pas au stockage pour %s", async (_label, doc) => {
    const { cleanup, deleteObject } = cleanupWith({ copies: 0, siblings: 0 });
    await cleanup.deleteObjectIfUnreferenced(doc);
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

describe("DocumentCleanupService.purgeUnreferencedObjectsSafely", () => {
  const OTHER = { ...FILE, id: "doc-2", storagePath: "coach/c/exercises/e/b.jpg" };

  it("compte toutes les clés en une requête, puis purge chaque objet que plus rien ne porte", async () => {
    const { cleanup, deleteObject, exerciseDocumentFindMany } = cleanupWith({
      copies: 0,
      siblings: 0,
    });
    await cleanup.purgeUnreferencedObjectsSafely([FILE, OTHER]);

    expect(exerciseDocumentFindMany).toHaveBeenCalledTimes(1);
    expect(exerciseDocumentFindMany.mock.calls[0]?.[0].where).toEqual({
      storagePath: { in: [FILE.storagePath, OTHER.storagePath] },
    });
    expect(deleteObject.mock.calls.map(([key]) => key)).toEqual([
      FILE.storagePath,
      OTHER.storagePath,
    ]);
  });

  it("garde l'objet qu'une séance planifiée affiche encore, purge l'autre", async () => {
    const { cleanup, deleteObject } = cleanupWith({ copies: 1, siblings: 0 });
    await cleanup.purgeUnreferencedObjectsSafely([FILE, OTHER]);
    expect(deleteObject.mock.calls.map(([key]) => key)).toEqual([OTHER.storagePath]);
  });

  it("ne touche pas au stockage sans fichier à purger", async () => {
    const { cleanup, deleteObject, exerciseDocumentFindMany } = cleanupWith({
      copies: 0,
      siblings: 0,
    });
    await cleanup.purgeUnreferencedObjectsSafely([
      { id: "lien", type: DocumentType.LINK, storagePath: null },
    ]);
    expect(exerciseDocumentFindMany).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  // Les lignes sont déjà parties : un stockage en panne ne doit pas faire échouer l'écriture. Le
  // SDK S3 recopie la clé sur l'exception : le journal ne doit garder que son nom.
  it("journalise un échec sans la clé, et purge quand même les autres objets", async () => {
    const { cleanup, deleteObject, logger } = cleanupWith({ copies: 0, siblings: 0 });
    const refused = Object.assign(new Error("Access Denied."), {
      name: "AccessDenied",
      Key: FILE.storagePath,
    });
    deleteObject.mockRejectedValueOnce(refused);

    await expect(cleanup.purgeUnreferencedObjectsSafely([FILE, OTHER])).resolves.toBeUndefined();

    expect(deleteObject).toHaveBeenCalledWith(OTHER.storagePath);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]?.[0]).toEqual({ documentId: FILE.id, reason: "AccessDenied" });
  });

  it("journalise un décompte en échec sans faire échouer l'appelant", async () => {
    const { cleanup, deleteObject, exerciseDocumentFindMany, logger } = cleanupWith({
      copies: 0,
      siblings: 0,
    });
    exerciseDocumentFindMany.mockRejectedValueOnce(new Error("base indisponible"));

    await expect(cleanup.purgeUnreferencedObjectsSafely([FILE])).resolves.toBeUndefined();

    expect(deleteObject).not.toHaveBeenCalled();
    expect(logger.warn.mock.calls[0]?.[0]).toEqual({ documentIds: [FILE.id], reason: "Error" });
  });
});
