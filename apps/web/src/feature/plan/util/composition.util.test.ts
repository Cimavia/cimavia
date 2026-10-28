import {
  CompositionEditKind,
  CompositionRefusal,
  type CopyChoice,
  type ExerciseDto,
  type PlanWeekDto,
  type ScheduledSessionCopyDto,
} from "@cmv/shared";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import {
  changeSentence,
  compositionLibrary,
  dialogFoot,
  initiallyChecked,
  weekNumberOf,
  weeksInPlace,
  weeksText,
} from "./composition.util";

// Les clés, avec leurs paramètres : la phrase se lit sans dictionnaire.
const t = ((key: string, params?: Record<string, unknown>) =>
  params === undefined ? key : `${key}(${Object.values(params).join("|")})`) as TFunction;

const weeks = [1, 2, 3].map((weekNumber) => ({
  id: `w${weekNumber}`,
  weekNumber,
})) as PlanWeekDto[];
// Un bloc dont la place `a` a été remplacée par `n` dans les semaines `replacedIn`.
const copy = (week: number, replaced = false) =>
  ({
    id: `s${week}`,
    planWeekId: `w${week}`,
    blocks: [
      {
        baseline: { exercises: [{ key: "a" }] },
        exercises: [
          replaced
            ? { key: "n", origin: { kind: "REPLACEMENT", replacesKey: "a" } }
            : { key: "a", origin: { kind: "RECEIVED" } },
        ],
      },
    ],
  }) as unknown as ScheduledSessionCopyDto;
const copies = [copy(1), copy(2), copy(3)];
const choice = (id: string, inPlace: boolean, refusal: CopyChoice["refusal"] = null) => ({
  id,
  inPlace,
  refusal,
});

describe("compositionLibrary", () => {
  it("rend l'exercice de la bibliothèque, ou null", () => {
    const exercise = {
      id: "ex_1",
      suggestedMetrics: [],
      customMetrics: [],
    } as unknown as ExerciseDto;
    const library = compositionLibrary([exercise]);
    expect(library("ex_1")).toBe(exercise);
    expect(library("ex_2")).toBeNull();
  });
});

describe("semaines", () => {
  it("numérote la semaine d'une copie, null hors du cycle", () => {
    expect(weekNumberOf(copy(2), weeks)).toBe(2);
    expect(weekNumberOf(copy(9), weeks)).toBeNull();
  });

  it("dit où le changement est, toutes les semaines quand chaque copie l'a", () => {
    expect(weeksText([], 3, t)).toBe("");
    expect(weeksText([2], 1, t)).toBe("plan.composition.inWeeks(plan.composition.week(2))");
    expect(weeksText([1, 2, 3], 3, t)).toBe("plan.composition.allWeeks");
    const edit = {
      kind: CompositionEditKind.REPLACE,
      blockIndex: 0,
      replacesKey: "a",
      key: "n",
      exerciseId: null,
    };
    expect(weeksInPlace([copy(1, true), copy(2), copy(3, true)], edit, weeks)).toEqual([1, 3]);
  });
});

describe("initiallyChecked", () => {
  it("coche la semaine du panneau pour un changement nouveau, si elle le prend", () => {
    expect(initiallyChecked([choice("s1", false), choice("s2", false)], "s2", false)).toEqual(
      new Set(["s2"]),
    );
    const refused = [choice("s2", false, CompositionRefusal.BLOCK_FULL)];
    expect(initiallyChecked(refused, "s2", false)).toEqual(new Set());
  });

  it("coche, rouverte, les semaines qui ont le changement", () => {
    const choices = [choice("s1", true), choice("s2", false), choice("s3", true)];
    expect(initiallyChecked(choices, "s2", true)).toEqual(new Set(["s1", "s3"]));
  });
});

describe("dialogFoot", () => {
  const replaced = {
    kind: CompositionEditKind.REPLACE,
    athlete: "Léa",
    exercise: "Rameur",
    was: "Corde",
    block: "2",
  };
  const choices = [choice("s1", true), choice("s2", false), choice("s3", true)];

  it("ne dit rien quand rien n'est coché ni rien perdu", () => {
    const fresh = [choice("s1", false), choice("s2", false), choice("s3", false)];
    expect(dialogFoot(copies, fresh, new Set(), weeks, replaced, t)).toBe("");
  });

  it("dit où le changement sera, puis ce que deviennent les semaines décochées", () => {
    expect(dialogFoot(copies, choices, new Set(["s1", "s2"]), weeks, replaced, t)).toBe(
      "plan.composition.change.REPLACE(Léa) plan.composition.inWeeks(plan.composition.week(1) common.and plan.composition.week(2)) · plan.composition.dialog.comesBack(Corde|plan.composition.week(3))",
    );
  });

  it("dit seulement le retour, avec un point, quand tout est décoché", () => {
    const added = { ...replaced, kind: CompositionEditKind.ADD, was: null };
    expect(dialogFoot(copies, choices, new Set(), weeks, added, t)).toBe(
      "plan.composition.dialog.noLonger(Rameur|plan.composition.week(1) common.and plan.composition.week(3)).",
    );
  });

  it("garde l'état d'une semaine qui refuse, quoi que dise sa case", () => {
    const refusing = [choice("s1", true, CompositionRefusal.NOT_IN_LIBRARY)];
    expect(dialogFoot([copy(1)], refusing, new Set(), weeks, replaced, t)).toBe(
      "plan.composition.change.REPLACE(Léa) plan.composition.inWeeks(plan.composition.week(1))",
    );
  });
});

describe("changeSentence", () => {
  const words = { athlete: "Léa", exercise: "Rameur", was: "Corde", block: "2" };

  it("dit le changement que la fenêtre propose", () => {
    expect(changeSentence({ ...words, kind: CompositionEditKind.ADD }, t)).toBe(
      "plan.composition.dialog.what.ADD(Rameur|2)",
    );
    expect(changeSentence({ ...words, kind: CompositionEditKind.REPLACE }, t)).toBe(
      "plan.composition.dialog.what.REPLACE(Corde|Rameur)",
    );
    expect(changeSentence({ ...words, kind: CompositionEditKind.REMOVE }, t)).toBe(
      "plan.composition.dialog.what.REMOVE(Corde)",
    );
  });
});
