import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import type { PlanService } from "./plan.service";
import { PlanWeekService } from "./plan-week.service";

const VERSION = new Date("2026-11-28T08:00:00.000Z");

/**
 * Insérer avant la semaine 2 d'un brouillon de quatre semaines, alors qu'un autre Coach vient de
 * la retirer : lue par la route, elle manque à la liste relue juste après, où la 3 est déjà
 * devenue la 2. Une course qu'un e2e ne provoque pas à coup sûr ; l'ordre des lectures, si.
 */
function insertAfterRemoval() {
  const tx = {
    planWeek: {
      // La semaine 2 n'existe plus : aucune écriture ne l'atteint, aucun compte ne la trouve.
      updateMany: vi.fn(async ({ where }: { where: { id: string } }) => ({
        count: where.id === "w2" ? 0 : 1,
      })),
      count: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === "w2" ? 0 : 1)),
      update: vi.fn(),
      createMany: vi.fn(),
    },
    scheduledSession: { updateMany: vi.fn(), findMany: vi.fn(async () => []) },
  };
  const db = {
    planWeek: {
      count: vi.fn(async () => 3),
      findMany: vi.fn(async () => [
        { id: "w3", weekNumber: 2 },
        { id: "w4", weekNumber: 3 },
      ]),
    },
    scheduledSession: { findMany: vi.fn(async () => []) },
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as TenantPrisma;
  const plans = {
    getWeekOrThrow: vi.fn(async () => ({
      id: "w2",
      planId: "p1",
      weekNumber: 2,
      updatedAt: VERSION,
    })),
    getForOrThrow: vi.fn(async () => ({
      plan: { id: "p1", status: "DRAFT", athleteId: null, title: "Cycle" },
      context: {},
    })),
    getDtoFor: vi.fn(),
  } as unknown as PlanService;
  const service = new PlanWeekService(db, plans, {} as NotificationService);
  return { service, tx };
}

describe("PlanWeekService.insertWeekBefore", () => {
  it("répond 404 sur une semaine retirée depuis la lecture, sans faire glisser la suite", async () => {
    const { service, tx } = insertAfterRemoval();

    await expect(
      service.insertWeekBefore("w2", {
        type: "TRAINING",
        expectedUpdatedAt: VERSION.toISOString(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.scheduledSession.updateMany).not.toHaveBeenCalled();
    expect(tx.planWeek.update).not.toHaveBeenCalled();
    expect(tx.planWeek.createMany).not.toHaveBeenCalled();
  });
});
