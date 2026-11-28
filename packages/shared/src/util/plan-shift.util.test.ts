import { describe, expect, it } from "vitest";
import { ScheduledSessionStatus } from "../dto/plan.schema";
import { firstMovableWeek, PlanShiftRefusal, publishedShiftRefusal } from "./plan-shift.util";

const { PLANNED, DONE, SKIPPED } = ScheduledSessionStatus;

const week = (weekNumber: number, ...statuses: string[]) => ({
  weekNumber,
  sessions: statuses.map((status) => ({ status })),
});

describe("firstMovableWeek", () => {
  it("rend 1 quand rien n'a été touché : le cycle entier peut glisser", () => {
    expect(firstMovableWeek([week(1, PLANNED), week(2, PLANNED, PLANNED)])).toBe(1);
  });

  it("rend 1 sur un cycle sans semaine ni séance", () => {
    expect(firstMovableWeek([])).toBe(1);
    expect(firstMovableWeek([week(1), week(2)])).toBe(1);
  });

  it("rend la semaine qui suit la dernière séance faite", () => {
    expect(firstMovableWeek([week(1, DONE), week(2, PLANNED, DONE), week(3, PLANNED)])).toBe(3);
  });

  it("compte une séance passée comme une séance faite", () => {
    expect(firstMovableWeek([week(1, PLANNED), week(2, SKIPPED), week(3)])).toBe(3);
  });

  it("laisse glisser une séance prévue mais manquée : seul le statut compte, pas la date", () => {
    expect(firstMovableWeek([week(1, PLANNED, PLANNED), week(2, PLANNED)])).toBe(1);
  });

  it("rend la semaine d'après la dernière quand celle-ci est touchée", () => {
    expect(firstMovableWeek([week(1, PLANNED), week(2, DONE)])).toBe(3);
  });

  it("ne dépend ni de l'ordre des semaines ni de leurs doublons", () => {
    expect(firstMovableWeek([week(4, DONE), week(2, DONE), week(4, PLANNED), week(6)])).toBe(5);
  });
});

describe("publishedShiftRefusal", () => {
  const untouched = [week(1, PLANNED), week(2, PLANNED)];
  const started = [week(1, DONE), week(2, PLANNED)];

  it("laisse reporter vers plus tard un cycle que rien n'a touché", () => {
    expect(publishedShiftRefusal(7, untouched)).toBeNull();
  });

  it("refuse d'avancer, même un cycle que rien n'a touché", () => {
    expect(publishedShiftRefusal(-7, untouched)).toBe(PlanShiftRefusal.EARLIER);
  });

  it("dit le sens avant la séance faite", () => {
    expect(publishedShiftRefusal(-7, started)).toBe(PlanShiftRefusal.EARLIER);
  });

  it("refuse de reporter en entier un cycle dont une séance est faite", () => {
    expect(publishedShiftRefusal(14, started)).toBe(PlanShiftRefusal.SETTLED);
  });

  it("laisse passer un décalage nul, qui ne déplace rien", () => {
    expect(publishedShiftRefusal(0, started)).toBeNull();
  });
});
