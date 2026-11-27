import { DocumentType } from "@cmv/shared";
import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { ObjectPurgeService } from "../../infra/storage/object-purge.service";
import type { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import type { ExerciseService } from "./exercise.service";
import { ExerciseDocumentService } from "./exercise-document.service";

const KEY = "coach/c/exercises/e/a.jpg";

function serviceWith(doc: { id: string; type: DocumentType; storagePath: string | null } | null) {
  const order: string[] = [];
  const db = {
    exerciseDocument: {
      findFirst: vi.fn().mockResolvedValue(doc),
      delete: vi.fn(async () => {
        order.push("ligne");
      }),
    },
  };
  const purge = {
    deleteManyOrDefer: vi.fn(async () => {
      order.push("objet");
    }),
  };
  const exercises = { getForOrThrow: vi.fn().mockResolvedValue({}) };
  const service = new ExerciseDocumentService(
    db as unknown as TenantPrisma,
    {} as StorageService,
    exercises as unknown as ExerciseService,
    purge as unknown as ObjectPurgeService,
  );
  return { service, db, purge, exercises, order };
}

describe("ExerciseDocumentService.remove", () => {
  it("retire la ligne, puis confie son objet à la purge (#75)", async () => {
    const { service, purge, exercises, order } = serviceWith({
      id: "d1",
      type: DocumentType.FILE,
      storagePath: KEY,
    });
    await service.remove("e1", "d1");
    expect(exercises.getForOrThrow).toHaveBeenCalledWith("e1", "write");
    expect(order).toEqual(["ligne", "objet"]);
    expect(purge.deleteManyOrDefer).toHaveBeenCalledExactlyOnceWith([KEY], { documentId: "d1" });
  });

  it("ne demande rien au stockage pour un lien", async () => {
    const { service, purge } = serviceWith({
      id: "d2",
      type: DocumentType.LINK,
      storagePath: null,
    });
    await service.remove("e1", "d2");
    expect(purge.deleteManyOrDefer).toHaveBeenCalledExactlyOnceWith([], { documentId: "d2" });
  });

  it("ne retire rien quand la ligne ne part pas", async () => {
    const { service, db, purge } = serviceWith({
      id: "d1",
      type: DocumentType.FILE,
      storagePath: KEY,
    });
    db.exerciseDocument.delete.mockRejectedValueOnce(new Error("base indisponible"));
    await expect(service.remove("e1", "d1")).rejects.toThrow("base indisponible");
    expect(purge.deleteManyOrDefer).not.toHaveBeenCalled();
  });

  it("404 sur un document inconnu de l'exercice, sans rien retirer", async () => {
    const { service, db, purge } = serviceWith(null);
    await expect(service.remove("e1", "inconnu")).rejects.toBeInstanceOf(NotFoundException);
    expect(db.exerciseDocument.delete).not.toHaveBeenCalled();
    expect(purge.deleteManyOrDefer).not.toHaveBeenCalled();
  });
});
