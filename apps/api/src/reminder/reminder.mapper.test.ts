import { ReminderEntityType, ReminderStatus } from "@cmv/shared";
import type { Reminder } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { type ReminderTargetLabels, toReminderDto } from "./reminder.mapper";

const ROW = {
  id: "rem_1",
  coachId: "coach_1",
  entityType: ReminderEntityType.PLAN,
  entityId: "plan_1",
  dueAt: new Date("2026-09-01T00:00:00.000Z"),
  note: null,
  reason: null,
  status: ReminderStatus.PENDING,
  readAt: null,
  pushedAt: null,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
} as Reminder;

const labels = (plans: [string, string][], invoices: [string, string][] = []) =>
  ({
    [ReminderEntityType.PLAN]: new Map(plans),
    [ReminderEntityType.INVOICE]: new Map(invoices),
  }) as ReminderTargetLabels;

describe("toReminderDto — libellé de la cible", () => {
  it("rend le libellé brut de la cible, lu dans la map de SON type", () => {
    // Même id des deux côtés : c'est le type qui choisit la table, jamais l'id seul.
    const dto = toReminderDto(ROW, labels([["plan_1", "Cycle force"]], [["plan_1", "2026-03"]]));
    expect(dto.targetLabel).toBe("Cycle force");
  });

  /**
   * `entityId` n'a pas de clé étrangère (N-4, #108) : une cible disparue par un chemin que la purge
   * ne couvre pas encore laisse un rappel sans libellé. Il reste lisible, et le rendu affiche « — »
   * — pas un libellé inventé, pas une erreur qui viderait toute la liste.
   */
  it("rend null quand la cible a disparu", () => {
    const dto = toReminderDto(ROW, labels([], [["plan_1", "2026-03"]]));
    expect(dto).toMatchObject({ id: "rem_1", entityId: "plan_1", targetLabel: null });
  });
});
