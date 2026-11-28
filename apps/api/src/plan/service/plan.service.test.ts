import { ProblemType } from "@cmv/shared";
import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import type { AccessService } from "../../access/service/access.service";
import type { ObjectPurgeService } from "../../infra/storage/object-purge.service";
import type { InvoiceService } from "../../invoice/service/invoice.service";
import type { NotificationService } from "../../notification/notification.service";
import type { ReminderService } from "../../reminder/service/reminder.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { PlanService } from "./plan.service";
import type { PlanAccessService } from "./plan-access.service";

const VERSION = new Date("2026-11-27T08:00:00.000Z");
const QUERY = { expectedUpdatedAt: VERSION.toISOString() };
const KEY = "athlete/a1/invoice/p1/0b6f3c2e-facture.pdf";

/**
 * Un brouillon `p1` que l'acteur peut supprimer. `deleted` : ce que la suppression conditionnelle
 * atteint — 0 quand un autre geste a fait avancer la version entre la lecture et l'écriture.
 */
function build({
  invoice = { documentPath: KEY } as { documentPath: string | null } | null,
  deleted = 1,
} = {}) {
  const deleteOrDefer = vi.fn().mockResolvedValue(undefined);
  const tx = {
    invoice: { findFirst: vi.fn().mockResolvedValue(invoice) },
    plan: {
      deleteMany: vi.fn().mockResolvedValue({ count: deleted }),
      count: vi.fn().mockResolvedValue(1),
    },
  };
  const db = {
    plan: {
      findFirst: vi.fn().mockResolvedValue({ id: "p1", status: "DRAFT", updatedAt: VERSION }),
    },
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as TenantPrisma;
  // Le droit de supprimer est hors sujet : l'accès rend la ligne chargée, comme s'il l'accordait.
  const access = {
    loadFor: async (load: Promise<unknown>) => ({ row: await load, context: {} }),
  } as unknown as AccessService;
  const service = new PlanService(
    db,
    {} as InvoiceService,
    { purgeForPlan: vi.fn().mockResolvedValue(undefined) } as unknown as ReminderService,
    {} as ClsService,
    access,
    {} as PlanAccessService,
    { deleteOrDefer } as unknown as ObjectPurgeService,
    {} as NotificationService,
  );
  return { service, deleteOrDefer, tx };
}

describe("PlanService.delete — le justificatif de la facture (#73)", () => {
  it("retire le justificatif une fois le cycle supprimé", async () => {
    const { service, deleteOrDefer, tx } = build();

    await service.delete("p1", QUERY);

    expect(deleteOrDefer).toHaveBeenCalledExactlyOnceWith(KEY);
    expect(tx.plan.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      deleteOrDefer.mock.invocationCallOrder[0] ?? 0,
    );
  });

  // Le cas que l'ordre inverse casserait : le cycle reste, son PDF doit rester servi.
  it("ne retire rien quand la suppression perd contre un autre geste (409)", async () => {
    const { service, deleteOrDefer } = build({ deleted: 0 });

    await expect(service.delete("p1", QUERY)).rejects.toMatchObject({
      status: 409,
      problemType: ProblemType.STALE_WRITE,
    });

    expect(deleteOrDefer).not.toHaveBeenCalled();
  });

  it("ne retire rien sans justificatif joint, ni sans facture", async () => {
    for (const invoice of [{ documentPath: null }, null]) {
      const { service, deleteOrDefer } = build({ invoice });

      await service.delete("p1", QUERY);

      expect(deleteOrDefer).not.toHaveBeenCalled();
    }
  });
});
