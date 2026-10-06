import { ReminderEntityType, ReminderReason, ReminderStatus } from "@cmv/shared";
import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import type { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { ReminderTickService } from "./reminder-tick.service";

const NOW = new Date("2026-10-04T09:00:00.000Z");
const YESTERDAY = new Date("2026-10-03T09:00:00.000Z");
const TOMORROW = new Date("2026-10-05T09:00:00.000Z");

type Row = {
  id: string;
  dueAt: Date;
  note: string | null;
  reason: ReminderReason | null;
  status: ReminderStatus;
  pushedAt: Date | null;
};

type StampWhere = { OR?: { id: string; dueAt: Date }[]; id?: { in: string[] } };

/**
 * Une table `reminder` en mémoire, qui APPLIQUE le `where` de l'estampille au lieu de le
 * mémoriser : c'est ce qui permet d'affirmer ce que devient une ligne, pas la forme d'une requête.
 * Rien à générer — ni cycle ni facture — pour que seul le push soit en jeu.
 */
function build(rows: Row[], onPush?: (reminderId: string) => void) {
  const matches = (row: Row, where: StampWhere) =>
    where.OR != null
      ? where.OR.some((c) => c.id === row.id && c.dueAt.getTime() === row.dueAt.getTime())
      : (where.id?.in.includes(row.id) ?? false);

  const db = {
    plan: { findMany: vi.fn().mockResolvedValue([]) },
    planWeek: { groupBy: vi.fn().mockResolvedValue([]) },
    invoice: { findMany: vi.fn().mockResolvedValue([]) },
    reminder: {
      findMany: vi.fn(async () =>
        rows.filter(
          (r) => r.status === ReminderStatus.PENDING && r.dueAt <= NOW && r.pushedAt == null,
        ),
      ),
      updateMany: vi.fn(async ({ where, data }: { where: StampWhere; data: Partial<Row> }) => {
        for (const row of rows) if (matches(row, where)) Object.assign(row, data);
      }),
    },
  } as unknown as TenantPrisma;

  const notifyReminderDue = vi.fn(async ({ reminderId }: { reminderId: string }) =>
    onPush?.(reminderId),
  );

  const service = new ReminderTickService(
    { user: { findMany: vi.fn().mockResolvedValue([{ id: "c1" }]) } } as unknown as PrismaService,
    db,
    { run: (fn: () => unknown) => fn(), set: vi.fn() } as unknown as ClsService,
    { notifyReminderDue } as unknown as NotificationService,
  );
  return { service, notifyReminderDue };
}

const due = (id: string, overrides: Partial<Row> = {}): Row => ({
  id,
  dueAt: YESTERDAY,
  note: "Relancer",
  reason: null,
  status: ReminderStatus.PENDING,
  pushedAt: null,
  ...overrides,
});

describe("ReminderTickService — push à l'échéance", () => {
  it("pousse les rappels dus et les estampille à l'heure du tick", async () => {
    const rows = [due("r1"), due("r2", { note: null, reason: ReminderReason.PLAN_ENDING })];
    const { service, notifyReminderDue } = build(rows);

    const result = await service.run(NOW);

    expect(result.pushedReminders).toBe(2);
    expect(notifyReminderDue).toHaveBeenCalledWith({
      coachId: "c1",
      reminderId: "r2",
      label: "Un cycle se termine — proposer le renouvellement.",
    });
    expect(rows.map((r) => r.pushedAt)).toEqual([NOW, NOW]);
  });

  /**
   * LE cas de #295 côté tick. Le coach repousse le rappel PENDANT que les envois défilent : son
   * report change `dueAt` et remet `pushedAt` à `null`. L'estampille posée ensuite ne doit pas
   * recouvrir cette nouvelle échéance — rien n'est parti pour elle, elle doit partir à son tour.
   */
  it("n'estampille pas la nouvelle échéance d'un rappel repoussé pendant l'envoi", async () => {
    const rows = [due("r1"), due("r2")];
    const { service } = build(rows, (reminderId) => {
      const row = rows.find((r) => r.id === reminderId);
      if (reminderId === "r1" && row != null)
        Object.assign(row, { dueAt: TOMORROW, pushedAt: null });
    });

    await service.run(NOW);

    expect(rows.find((r) => r.id === "r1")).toMatchObject({ dueAt: TOMORROW, pushedAt: null });
    // Le voisin, lui, n'a pas bougé : il est bien estampillé.
    expect(rows.find((r) => r.id === "r2")?.pushedAt).toEqual(NOW);
  });

  // Sans note ni motif, aucun texte à pousser : le rappel n'est ni envoyé ni estampillé, il reste
  // visible comme anomalie plutôt que déguisé en push plausible.
  it("n'envoie ni n'estampille un rappel sans note ni motif", async () => {
    const rows = [due("r1", { note: null, reason: null })];
    const { service, notifyReminderDue } = build(rows);

    const result = await service.run(NOW);

    expect(result.pushedReminders).toBe(0);
    expect(notifyReminderDue).not.toHaveBeenCalled();
    expect(rows[0]?.pushedAt).toBeNull();
  });
});

/**
 * La génération, seule en jeu : aucun rappel déjà en base, rien à pousser. Le `createMany` est
 * capturé pour lire ce qui serait inséré — l'unicité, elle, est l'affaire de la base.
 */
function buildGeneration(source: {
  plans?: { id: string; startDate: Date; weekCount: number }[];
  invoices?: { id: string; dueDate: Date }[];
}) {
  const plans = source.plans ?? [];
  const createMany = vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  const db = {
    plan: { findMany: vi.fn().mockResolvedValue(plans) },
    planWeek: {
      groupBy: vi
        .fn()
        .mockResolvedValue(plans.map((p) => ({ planId: p.id, _count: { _all: p.weekCount } }))),
    },
    invoice: { findMany: vi.fn().mockResolvedValue(source.invoices ?? []) },
    reminder: { createMany, findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
  } as unknown as TenantPrisma;

  const service = new ReminderTickService(
    { user: { findMany: vi.fn().mockResolvedValue([{ id: "c1" }]) } } as unknown as PrismaService,
    db,
    { run: (fn: () => unknown) => fn(), set: vi.fn() } as unknown as ClsService,
    { notifyReminderDue: vi.fn() } as unknown as NotificationService,
  );
  const inserted = () => (createMany.mock.calls[0]?.[0].data ?? []) as Record<string, unknown>[];
  return { service, inserted };
}

/**
 * Les échéances tombent à minuit À PARIS (« Tranché en #321 »), pas à minuit UTC : sans quoi le
 * rappel ne devenait dû qu'à 1 h ou 2 h du matin, quand l'écran des factures annonçait déjà le
 * retard depuis minuit.
 */
describe("ReminderTickService — échéances à l'heure du produit", () => {
  // Facture échue le 4 octobre : en retard le 5 à 0 h à Paris, soit le 4 à 22 h UTC (heure d'été).
  const INVOICE = { id: "inv1", dueDate: new Date("2026-10-04T00:00:00.000Z") };

  it("rend une facture en retard dès minuit à Paris", async () => {
    const { service, inserted } = buildGeneration({ invoices: [INVOICE] });

    const result = await service.run(new Date("2026-10-04T22:30:00.000Z"));

    expect(result.createdReminders).toBe(1);
    expect(inserted()).toEqual([
      expect.objectContaining({
        entityType: ReminderEntityType.INVOICE,
        entityId: "inv1",
        reason: ReminderReason.INVOICE_OVERDUE,
        dueAt: new Date("2026-10-04T22:00:00.000Z"),
      }),
    ]);
  });

  it("ne rend pas en retard une facture dont le jour d'échéance court encore à Paris", async () => {
    const { service, inserted } = buildGeneration({ invoices: [INVOICE] });

    const result = await service.run(new Date("2026-10-04T21:59:00.000Z"));

    expect(result.createdReminders).toBe(0);
    expect(inserted()).toEqual([]);
  });

  // Cycle de trois semaines parti le lundi 21/09 : il finit le dimanche 11/10, le rappel tombe une
  // semaine avant, le dimanche 4 à 0 h à Paris.
  it("annonce la fin d'un cycle une semaine avant, à minuit à Paris", async () => {
    const plan = { id: "pln1", startDate: new Date("2026-09-21T00:00:00.000Z"), weekCount: 3 };
    const { service, inserted } = buildGeneration({ plans: [plan] });

    await service.run(new Date("2026-10-03T22:30:00.000Z"));

    expect(inserted()).toEqual([
      expect.objectContaining({
        entityType: ReminderEntityType.PLAN,
        entityId: "pln1",
        reason: ReminderReason.PLAN_ENDING,
        dueAt: new Date("2026-10-03T22:00:00.000Z"),
      }),
    ]);
  });
});
