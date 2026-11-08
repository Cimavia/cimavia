import { DocumentType } from "@cmv/shared";
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
  return {
    cleanup: new DocumentCleanupService(db, storage),
    deleteObject,
    exerciseDocumentFindMany,
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
