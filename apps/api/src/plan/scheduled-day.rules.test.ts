import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { toDbDate } from "../util/date.util";
import { assertDateInWeek, assertDayContent } from "./scheduled-day.rules";

describe("assertDateInWeek", () => {
  // Un cycle qui commence le lundi 16 novembre : sa S1 couvre du 16 au 22, sa S2 du 23 au 29.
  const plan = { startDate: toDbDate("2026-11-16") };

  it("accepte le premier et le dernier jour de la semaine visée", () => {
    expect(() => assertDateInWeek(plan, { weekNumber: 1 }, "2026-11-16")).not.toThrow();
    expect(() => assertDateInWeek(plan, { weekNumber: 1 }, "2026-11-22")).not.toThrow();
    expect(() => assertDateInWeek(plan, { weekNumber: 2 }, "2026-11-23")).not.toThrow();
  });

  it("refuse en 400 un jour de la semaine voisine, en nommant la semaine visée", () => {
    expect(() => assertDateInWeek(plan, { weekNumber: 1 }, "2026-11-23")).toThrow(
      new BadRequestException("La date 2026-11-23 ne tombe pas dans la semaine 1 du cycle"),
    );
    expect(() => assertDateInWeek(plan, { weekNumber: 2 }, "2026-11-22")).toThrow(
      BadRequestException,
    );
  });
});

describe("assertDayContent", () => {
  const monday = toDbDate("2026-11-16");
  const tuesday = toDbDate("2026-11-17");
  const session = (id: string, scheduledDate: Date, position: number) => ({
    id,
    scheduledDate,
    position,
  });
  // Lundi porte a puis b ; mardi porte c.
  const cycle = [session("a", monday, 0), session("b", monday, 1), session("c", tuesday, 0)];

  it("rend les séances du jour dans l'ordre demandé, pas dans l'ordre lu", () => {
    expect(assertDayContent(cycle, ["b", "a"], monday).map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("accepte une séance d'un autre jour du cycle, au rang où le tableau la place", () => {
    const ordered = assertDayContent(cycle, ["a", "c", "b"], monday);
    expect(ordered.map((s) => s.id)).toEqual(["a", "c", "b"]);
    // La séance rendue est celle lue, avec sa date d'origine : c'est elle qui dit qu'elle bouge.
    expect(ordered[1]?.scheduledDate).toEqual(tuesday);
  });

  it("refuse une séance citée deux fois", () => {
    expect(() => assertDayContent(cycle, ["a", "b", "a"], monday)).toThrow(
      new BadRequestException("Une séance est citée deux fois dans l'ordre demandé"),
    );
  });

  it("refuse d'omettre une séance déjà posée ce jour-là", () => {
    expect(() => assertDayContent(cycle, ["a"], monday)).toThrow(
      new BadRequestException(
        "L'ordre doit citer TOUTES les séances déjà posées ce jour-là, sans en omettre",
      ),
    );
  });

  it("laisse partir la séance d'un autre jour sans exiger qu'on la cite", () => {
    // Mardi est le jour visé : a et b, posés lundi, n'ont pas à y figurer.
    expect(assertDayContent(cycle, ["c"], tuesday).map((s) => s.id)).toEqual(["c"]);
  });

  it("refuse une séance que la lecture du cycle n'a pas rendue", () => {
    expect(() => assertDayContent(cycle, ["a", "b", "z"], monday)).toThrow(
      new BadRequestException("La séance z n'appartient pas à ce cycle"),
    );
  });

  it("accepte une journée vide quand le cycle n'y porte rien", () => {
    expect(assertDayContent(cycle, [], toDbDate("2026-11-18"))).toEqual([]);
  });
});
