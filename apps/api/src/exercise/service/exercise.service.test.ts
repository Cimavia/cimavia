import { DocumentType } from "@cmv/shared";
import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AccessService } from "../../access/service/access.service";
import type { AccessGrantService } from "../../access/service/access-grant.service";
import type { CustomMetricService } from "../../custom-metric/service/custom-metric.service";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import type { ObjectPurgeService } from "../../infra/storage/object-purge.service";
import type { StorageService } from "../../infra/storage/storage.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { StaleWriteException } from "../../util/stale-write.util";
import { ExerciseService } from "./exercise.service";
import type { ExerciseCopyService } from "./exercise-copy.service";

const READ_AT = new Date("2026-11-27T08:00:00.000Z");

/** Un exercice de C, sans séance qui le cite : rien ne s'oppose à sa suppression. */
function serviceWith({ written = 1, ownSessions = 0 } = {}) {
  const order: string[] = [];
  const exercise = {
    id: "e1",
    coachId: "c",
    updatedAt: READ_AT,
    sessionExercises: Array.from({ length: ownSessions }, () => ({ coachId: "c" })),
    documents: [
      { id: "d1", type: DocumentType.FILE, storagePath: "coach/c/exercises/e1/a.jpg" },
      { id: "d2", type: DocumentType.LINK, storagePath: null },
      { id: "d3", type: DocumentType.FILE, storagePath: "coach/c/exercises/e1/b.pdf" },
    ],
  };
  const tx = {
    exercise: {
      deleteMany: vi.fn(async () => {
        order.push("ligne");
        return { count: written };
      }),
      count: vi.fn().mockResolvedValue(1),
    },
  };
  const db = {
    exercise: { findFirst: vi.fn().mockResolvedValue(exercise) },
    $transaction: vi.fn((work: (client: typeof tx) => unknown) => work(tx)),
  };
  const access = {
    loadFor: vi.fn(async (load: Promise<unknown>) => ({ row: await load, context: {} })),
  };
  const purge = {
    deleteManyOrDefer: vi.fn(async () => {
      order.push("objets");
    }),
  };
  const service = new ExerciseService(
    db as unknown as TenantPrisma,
    {} as StorageService,
    {} as CustomMetricService,
    {} as PrismaService,
    access as unknown as AccessService,
    {} as AccessGrantService,
    {} as ExerciseCopyService,
    purge as unknown as ObjectPurgeService,
  );
  return { service, purge, order };
}

const AT_VERSION = { expectedUpdatedAt: READ_AT.toISOString() };

describe("ExerciseService.delete", () => {
  it("retire l'exercice, puis confie tous ses fichiers à la purge en un seul appel (#75)", async () => {
    const { service, purge, order } = serviceWith();
    await service.delete("e1", AT_VERSION);
    expect(order).toEqual(["ligne", "objets"]);
    expect(purge.deleteManyOrDefer).toHaveBeenCalledExactlyOnceWith([
      "coach/c/exercises/e1/a.jpg",
      "coach/c/exercises/e1/b.pdf",
    ]);
  });

  it("ne purge rien quand la suppression est refusée sur une version périmée (409)", async () => {
    const { service, purge } = serviceWith({ written: 0 });
    await expect(service.delete("e1", AT_VERSION)).rejects.toBeInstanceOf(StaleWriteException);
    expect(purge.deleteManyOrDefer).not.toHaveBeenCalled();
  });

  it("ne purge rien quand une séance du propriétaire le cite encore (409)", async () => {
    const { service, purge, order } = serviceWith({ ownSessions: 1 });
    await expect(service.delete("e1", AT_VERSION)).rejects.toBeInstanceOf(ConflictException);
    expect(order).toEqual([]);
    expect(purge.deleteManyOrDefer).not.toHaveBeenCalled();
  });
});
