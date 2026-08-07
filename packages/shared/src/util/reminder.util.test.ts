import { describe, expect, it } from "vitest";
import { ReminderStatus } from "../dto/reminder.schema";
import { isReminderDue } from "./reminder.util";

const NOW = new Date("2026-08-07T10:00:00.000Z");

describe("isReminderDue", () => {
  it("est dû dès que l'échéance est passée", () => {
    expect(
      isReminderDue({ status: ReminderStatus.PENDING, dueAt: "2026-08-07T09:59:00.000Z" }, NOW),
    ).toBe(true);
  });

  it("n'est pas dû tant que l'échéance est à venir", () => {
    expect(
      isReminderDue({ status: ReminderStatus.PENDING, dueAt: "2026-08-07T10:01:00.000Z" }, NOW),
    ).toBe(false);
  });

  // La borne est INCLUSIVE : à la seconde pile, le rappel est dû. C'est ce que le `lte` de la
  // requête Prisma applique côté API — les deux doivent dire la même chose.
  it("est dû à la seconde exacte de son échéance", () => {
    expect(
      isReminderDue({ status: ReminderStatus.PENDING, dueAt: "2026-08-07T10:00:00.000Z" }, NOW),
    ).toBe(true);
  });

  it("ne rouvre jamais un rappel traité ou abandonné, même très en retard", () => {
    const past = { dueAt: "2020-01-01T00:00:00.000Z" };
    expect(isReminderDue({ ...past, status: ReminderStatus.DONE }, NOW)).toBe(false);
    expect(isReminderDue({ ...past, status: ReminderStatus.DISMISSED }, NOW)).toBe(false);
  });

  // Un instant illisible ne doit pas fabriquer une alerte : c'est une donnée corrompue, pas un
  // rappel en retard.
  it("n'est pas dû sur une échéance illisible", () => {
    expect(isReminderDue({ status: ReminderStatus.PENDING, dueAt: "hier" }, NOW)).toBe(false);
  });

  /**
   * Le piège que cette fonction existe pour éviter : `dueAt` est un INSTANT, pas une date civile.
   * Comparé comme une chaîne de date (`"2026-08-07" < "2026-08-07T..."`), un rappel du matin
   * paraîtrait dû le soir précédent selon le fuseau du lecteur.
   */
  it("compare des instants, donc tient compte de l'heure et du décalage", () => {
    // 11:30 à Paris (UTC+2 en août) = 09:30 UTC : déjà passé à 10:00 UTC.
    expect(
      isReminderDue({ status: ReminderStatus.PENDING, dueAt: "2026-08-07T11:30:00+02:00" }, NOW),
    ).toBe(true);
    // 13:00 à Paris = 11:00 UTC : encore à venir.
    expect(
      isReminderDue({ status: ReminderStatus.PENDING, dueAt: "2026-08-07T13:00:00+02:00" }, NOW),
    ).toBe(false);
  });
});
