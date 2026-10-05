import { DocumentType } from "@cmv/shared";
import { describe, expect, it, vi } from "vitest";
import type { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { DocumentCleanupService } from "./document-cleanup.service";

const FILE = { id: "doc-1", type: DocumentType.FILE, storagePath: "coach/c/exercises/e/a.jpg" };

function cleanupWith(counts: { copies: number; siblings: number }) {
  const exerciseDocumentCount = vi.fn().mockResolvedValue(counts.siblings);
  const db = {
    scheduledSessionExerciseDocument: { count: vi.fn().mockResolvedValue(counts.copies) },
    exerciseDocument: { count: exerciseDocumentCount },
  } as unknown as TenantPrisma;
  const deleteObject = vi.fn().mockResolvedValue(undefined);
  const storage = { deleteObject } as unknown as StorageService;
  return { cleanup: new DocumentCleanupService(db, storage), deleteObject, exerciseDocumentCount };
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
    const { cleanup, exerciseDocumentCount } = cleanupWith({ copies: 0, siblings: 0 });
    await cleanup.deleteObjectIfUnreferenced(FILE);
    expect(exerciseDocumentCount).toHaveBeenCalledWith({
      where: { storagePath: FILE.storagePath, id: { not: FILE.id } },
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
