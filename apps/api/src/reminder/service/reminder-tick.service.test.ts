import { InvoiceStatus, ReminderEntityType, ReminderReason, ReminderStatus } from "@cmv/shared";
import type { ClsService } from "nestjs-cls";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../infra/prisma/prisma.service";
import type { NotificationService } from "../../notification/notification.service";
import type { TenantPrisma } from "../../tenancy/tenancy.extension";
import { HANDLED_RETENTION_DAYS, retentionCutoff } from "../../util/retention.util";
import { REMINDER_GENERATION_WINDOW_DAYS, ReminderTickService } from "./reminder-tick.service";

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
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
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
  plans?: { id: string; startDate: Date; weekCount: number; publishedAt?: Date }[];
  invoices?: { id: string; dueDate: Date; issuedAt?: Date }[];
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
    reminder: {
      createMany,
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
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

/**
 * La fenêtre de génération (#107) : une cible échue ET émise depuis plus longtemps que
 * `REMINDER_GENERATION_WINDOW_DAYS` n'engendre plus rien. C'est ce qui empêche un rappel traité,
 * une fois purgé, de renaître au tick suivant — un cycle diffusé reste candidat à vie.
 */
describe("ReminderTickService — fenêtre de génération", () => {
  const WINDOW_MS = REMINDER_GENERATION_WINDOW_DAYS * 86_400_000;
  const after = (instant: Date, ms: number) => new Date(instant.getTime() + ms);

  // Facture échue le 4 octobre : son retard commence le 4 à 22 h UTC (minuit à Paris).
  const INVOICE = { id: "inv1", dueDate: new Date("2026-10-04T00:00:00.000Z") };
  const OVERDUE_AT = new Date("2026-10-04T22:00:00.000Z");

  // Cycle de trois semaines parti le 21/09 : le rappel de fin tombe le 3 à 22 h UTC.
  const PLAN = { id: "pln1", startDate: new Date("2026-09-21T00:00:00.000Z"), weekCount: 3 };
  const ENDING_AT = new Date("2026-10-03T22:00:00.000Z");

  it("relance encore une facture échue depuis exactement la fenêtre", async () => {
    const { service, inserted } = buildGeneration({ invoices: [INVOICE] });

    await service.run(after(OVERDUE_AT, WINDOW_MS));

    expect(inserted()).toEqual([expect.objectContaining({ entityId: "inv1" })]);
  });

  it("ne relance plus une facture échue depuis plus longtemps que la fenêtre", async () => {
    const { service, inserted } = buildGeneration({ invoices: [INVOICE] });

    const result = await service.run(after(OVERDUE_AT, WINDOW_MS + 1));

    expect(result.createdReminders).toBe(0);
    expect(inserted()).toEqual([]);
  });

  // Une facture de rattrapage : déjà vieille quand elle est émise. L'écran des factures la dit en
  // retard dès l'émission — la liste des rappels ne doit pas se taire.
  it("relance une facture émise récemment, même échue depuis longtemps", async () => {
    const now = after(OVERDUE_AT, 3 * WINDOW_MS);
    const issued = { ...INVOICE, issuedAt: after(now, -86_400_000) };
    const { service, inserted } = buildGeneration({ invoices: [issued] });

    await service.run(now);

    expect(inserted()).toEqual([expect.objectContaining({ entityId: "inv1" })]);
  });

  it("annonce encore la fin d'un cycle dont l'échéance date d'exactement la fenêtre", async () => {
    const { service, inserted } = buildGeneration({ plans: [PLAN] });

    await service.run(after(ENDING_AT, WINDOW_MS));

    expect(inserted()).toEqual([expect.objectContaining({ entityId: "pln1" })]);
  });

  it("n'annonce plus la fin d'un cycle dont l'échéance a passé la fenêtre", async () => {
    const { service, inserted } = buildGeneration({ plans: [PLAN] });

    await service.run(after(ENDING_AT, WINDOW_MS + 1));

    expect(inserted()).toEqual([]);
  });

  it("annonce la fin d'un cycle diffusé récemment, même fini depuis longtemps", async () => {
    const now = after(ENDING_AT, 3 * WINDOW_MS);
    const { service, inserted } = buildGeneration({
      plans: [{ ...PLAN, publishedAt: after(now, -86_400_000) }],
    });

    await service.run(now);

    expect(inserted()).toEqual([expect.objectContaining({ entityId: "pln1" })]);
  });
});

/**
 * Une facture réglée par un autre Coach que le propriétaire du cycle (#607) : sa transaction n'a
 * pas vu le rappel du propriétaire, c'est le tick de ce dernier qui le clôt.
 */
describe("ReminderTickService — clôture des retards réglés ailleurs", () => {
  function buildClosing(settledIds: string[]) {
    const updateMany = vi.fn();
    const invoiceFindMany = vi.fn(async ({ where }: { where: { status: unknown } }) =>
      // La génération lit les factures `PENDING` ; la clôture, celles qui ne le sont plus.
      where.status === InvoiceStatus.PENDING ? [] : settledIds.map((id) => ({ id })),
    );
    const db = {
      plan: { findMany: vi.fn().mockResolvedValue([]) },
      planWeek: { groupBy: vi.fn().mockResolvedValue([]) },
      invoice: { findMany: invoiceFindMany },
      reminder: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ entityId: "inv1" }, { entityId: "inv2" }])
          .mockResolvedValue([]),
        createMany: vi.fn(),
        updateMany,
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as TenantPrisma;
    const service = new ReminderTickService(
      { user: { findMany: vi.fn().mockResolvedValue([{ id: "c1" }]) } } as unknown as PrismaService,
      db,
      { run: (fn: () => unknown) => fn(), set: vi.fn() } as unknown as ClsService,
      { notifyReminderDue: vi.fn() } as unknown as NotificationService,
    );
    return { service, updateMany, invoiceFindMany };
  }

  it("clôt le rappel d'une facture qui n'est plus en attente", async () => {
    const { service, updateMany, invoiceFindMany } = buildClosing(["inv2"]);

    await service.run(NOW);

    expect(invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["inv1", "inv2"] }, status: { not: InvoiceStatus.PENDING } },
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        entityType: ReminderEntityType.INVOICE,
        reason: ReminderReason.INVOICE_OVERDUE,
        status: ReminderStatus.PENDING,
        entityId: { in: ["inv2"] },
      },
      data: { status: ReminderStatus.DONE },
    });
  });

  it("ne touche à rien si toutes ses factures sont encore en attente", async () => {
    const { service, updateMany } = buildClosing([]);

    await service.run(NOW);

    expect(updateMany).not.toHaveBeenCalled();
  });
});

// La purge de rétention passe aussi par `deleteMany` : la clôture est celle qui vise des entités.
function closings(deleteMany: ReturnType<typeof vi.fn>): unknown[] {
  return deleteMany.mock.calls
    .map(([args]) => args as { where: { entityId?: unknown } })
    .filter((args) => args.where.entityId !== undefined);
}

describe("ReminderTickService — clôture des rappels d'un suivi terminé (#909)", () => {
  type IdWhere = { where: { id?: { in: string[] } } };
  function buildEnded(pending: { entityType: ReminderEntityType; entityId: string }[]) {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    // Seules les lectures par id viennent de la clôture ; la génération lit sans, et ne trouve rien.
    const endedOnly = (ids: string[]) =>
      vi.fn(async ({ where }: IdWhere) =>
        (where.id?.in ?? []).filter((id) => ids.includes(id)).map((id) => ({ id })),
      );
    const planFindMany = endedOnly(["pln-fini"]);
    const invoiceFindMany = endedOnly(["inv-fini"]);
    const db = {
      plan: { findMany: planFindMany },
      planWeek: { groupBy: vi.fn().mockResolvedValue([]) },
      invoice: { findMany: invoiceFindMany },
      reminder: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([]) // les retards réglés ailleurs : aucun
          .mockResolvedValueOnce(pending)
          .mockResolvedValue([]),
        createMany: vi.fn(),
        updateMany: vi.fn(),
        deleteMany,
      },
    } as unknown as TenantPrisma;
    const service = new ReminderTickService(
      { user: { findMany: vi.fn().mockResolvedValue([{ id: "c1" }]) } } as unknown as PrismaService,
      db,
      { run: (fn: () => unknown) => fn(), set: vi.fn() } as unknown as ClsService,
      { notifyReminderDue: vi.fn() } as unknown as NotificationService,
    );
    return { service, deleteMany, planFindMany, invoiceFindMany };
  }

  it("efface la fin de cycle et le retard d'un couple rompu, pas ceux d'un suivi en cours", async () => {
    const { service, deleteMany } = buildEnded([
      { entityType: ReminderEntityType.PLAN, entityId: "pln-fini" },
      { entityType: ReminderEntityType.PLAN, entityId: "pln-en-cours" },
      { entityType: ReminderEntityType.INVOICE, entityId: "inv-fini" },
      { entityType: ReminderEntityType.INVOICE, entityId: "inv-en-cours" },
    ]);

    await service.run(NOW);

    // Supprimés, pas écartés : un `DISMISSED` survivrait à la réactivation (index d'unicité).
    expect(closings(deleteMany)).toEqual([
      {
        where: {
          status: ReminderStatus.PENDING,
          reason: { in: [ReminderReason.PLAN_ENDING, ReminderReason.INVOICE_OVERDUE] },
          // Annoté, le rappel est au Coach (#105) : effacé, sa note serait perdue.
          note: null,
          entityId: { in: ["pln-fini", "inv-fini"] },
        },
      },
    ]);
  });

  it("ne lit ni cycle ni facture sans rappel généré en attente", async () => {
    const { service, deleteMany, planFindMany, invoiceFindMany } = buildEnded([]);

    await service.run(NOW);

    expect(planFindMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: expect.anything() }) }),
    );
    expect(invoiceFindMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: expect.anything() }) }),
    );
    expect(closings(deleteMany)).toEqual([]);
  });

  it("ne touche à rien quand tous ses suivis continuent", async () => {
    const { service, deleteMany } = buildEnded([
      { entityType: ReminderEntityType.PLAN, entityId: "pln-en-cours" },
    ]);

    await service.run(NOW);

    expect(closings(deleteMany)).toEqual([]);
  });
});

/**
 * La rétention des rappels traités (#107). Le `where` est lu tel quel : c'est lui qui décide ce
 * qui part — l'e2e vérifie qu'il est bien appliqué par la base.
 */
describe("ReminderTickService — rétention des rappels traités", () => {
  function buildPurge(purgedCount: number) {
    const deleteMany = vi.fn().mockResolvedValue({ count: purgedCount });
    const planFindMany = vi.fn().mockResolvedValue([]);
    const db = {
      plan: { findMany: planFindMany },
      planWeek: { groupBy: vi.fn().mockResolvedValue([]) },
      invoice: { findMany: vi.fn().mockResolvedValue([]) },
      reminder: { findMany: vi.fn().mockResolvedValue([]), deleteMany },
    } as unknown as TenantPrisma;
    const service = new ReminderTickService(
      {
        user: { findMany: vi.fn().mockResolvedValue([{ id: "c1" }, { id: "c2" }]) },
      } as unknown as PrismaService,
      db,
      { run: (fn: () => unknown) => fn(), set: vi.fn() } as unknown as ClsService,
      { notifyReminderDue: vi.fn() } as unknown as NotificationService,
    );
    return { service, deleteMany, planFindMany };
  }

  it("purge, coach par coach, les rappels faits ou écartés que personne n'a retouchés", async () => {
    const { service, deleteMany } = buildPurge(2);

    const result = await service.run(NOW);

    expect(deleteMany).toHaveBeenCalledTimes(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        status: { in: [ReminderStatus.DONE, ReminderStatus.DISMISSED] },
        updatedAt: { lt: retentionCutoff(NOW) },
      },
    });
    expect(result.purgedReminders).toBe(4);
  });

  // La purge passe APRÈS les rappels de tous les coachs : un échec chez l'un ne prive personne.
  it("génère pour tous les coachs avant de purger, même si la purge échoue", async () => {
    const { service, deleteMany, planFindMany } = buildPurge(0);
    deleteMany.mockRejectedValueOnce(new Error("lock timeout"));

    await expect(service.run(NOW)).rejects.toThrow("lock timeout");

    expect(planFindMany).toHaveBeenCalledTimes(2);
  });

  /**
   * L'invariant dont dépend la purge : un rappel généré, purgé, ne renaît que si sa cible tombe
   * encore dans la fenêtre de génération. Elle doit donc rester plus courte que la rétention —
   * allonger l'une ou raccourcir l'autre sans le voir ferait relancer le coach sur ce qu'il a déjà
   * réglé.
   */
  it("garde la fenêtre de génération plus courte que la rétention", () => {
    expect(REMINDER_GENERATION_WINDOW_DAYS).toBeLessThan(HANDLED_RETENTION_DAYS);
  });
});
