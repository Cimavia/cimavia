import { describe, expect, it } from "vitest";
import { type SessionsSource, splitSessionsByDate } from "./athlete-sessions.util";

const TODAY = "2026-09-09";

type Session = { id: string; scheduledDate: string };

function plan(title: string, ...weeks: Session[][]): SessionsSource<Session> {
  return { title, followEndedAt: null, weeks: weeks.map((sessions) => ({ sessions })) };
}

const ids = (entries: { session: Session }[]) => entries.map(({ session }) => session.id);

describe("splitSessionsByDate", () => {
  it("range la séance du jour dans les séances à venir", () => {
    const split = splitSessionsByDate(
      [plan("Cycle", [{ id: "today", scheduledDate: TODAY }])],
      TODAY,
    );

    expect(ids(split.upcoming)).toEqual(["today"]);
    expect(split.past).toEqual([]);
  });

  it("lit les séances à venir de la plus proche à la plus lointaine", () => {
    const split = splitSessionsByDate(
      [
        plan(
          "Cycle",
          [{ id: "far", scheduledDate: "2026-09-21" }],
          [{ id: "near", scheduledDate: "2026-09-10" }],
        ),
      ],
      TODAY,
    );

    expect(ids(split.upcoming)).toEqual(["near", "far"]);
  });

  it("lit les séances passées de la plus récente à la plus ancienne", () => {
    const split = splitSessionsByDate(
      [
        plan(
          "Cycle",
          [{ id: "old", scheduledDate: "2026-08-31" }],
          [{ id: "yesterday", scheduledDate: "2026-09-08" }],
        ),
      ],
      TODAY,
    );

    expect(ids(split.past)).toEqual(["yesterday", "old"]);
  });

  it("garde l'ordre des cycles pour deux séances du même jour, dans les deux segments", () => {
    const split = splitSessionsByDate(
      [
        plan(
          "A",
          [{ id: "a-past", scheduledDate: "2026-09-01" }],
          [{ id: "a-next", scheduledDate: "2026-09-12" }],
        ),
        plan(
          "B",
          [{ id: "b-past", scheduledDate: "2026-09-01" }],
          [{ id: "b-next", scheduledDate: "2026-09-12" }],
        ),
      ],
      TODAY,
    );

    expect(ids(split.upcoming)).toEqual(["a-next", "b-next"]);
    expect(ids(split.past)).toEqual(["a-past", "b-past"]);
  });

  it("porte sur chaque séance le titre de son cycle", () => {
    const split = splitSessionsByDate(
      [
        plan("Force", [{ id: "f", scheduledDate: "2026-09-10" }]),
        plan("Endurance", [{ id: "e", scheduledDate: "2026-09-11" }]),
      ],
      TODAY,
    );

    expect(split.upcoming.map(({ planTitle }) => planTitle)).toEqual(["Force", "Endurance"]);
  });

  it("rend deux segments vides sans cycle", () => {
    expect(splitSessionsByDate([], TODAY)).toEqual({ upcoming: [], past: [] });
  });

  it("marque chaque séance de la fin du suivi de son cycle (#910), et d'elle seule", () => {
    const ended = {
      ...plan("Archivé", [{ id: "a", scheduledDate: "2026-09-10" }]),
      followEndedAt: "2026-09-01T09:00:00.000Z",
    };
    const split = splitSessionsByDate(
      [ended, plan("En cours", [{ id: "b", scheduledDate: "2026-09-11" }])],
      TODAY,
    );

    expect(split.upcoming.map(({ followEndedAt }) => followEndedAt)).toEqual([
      "2026-09-01T09:00:00.000Z",
      null,
    ]);
  });
});
