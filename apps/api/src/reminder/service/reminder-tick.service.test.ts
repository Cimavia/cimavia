import { ReminderReason, ReminderStatus } from "@cmv/shared";
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
