import { describe, expect, it } from "vitest";
import { cycle, issuesOf, oneByBeep, presets, rounds, settingsOf } from "../../test/block-fixtures";
import { say } from "../../test/french";
import {
  BLOCK_MAX_CHECKS,
  sessionBlockTrackingInputSchema,
  sessionBlockTrackingSchema,
} from "../dto/block-tracking.schema";
import { StructureOrder } from "../dto/structure-answer.schema";
import {
  type BlockChecks,
  BlockTallyState,
  blockCheckCount,
  blockChecks,
  blockTally,
  CheckBoxKind,
  CheckUnit,
  checkOf,
  tickedRows,
  trackingFitsBlock,
  trackingNote,
} from "./block-tracking.util";

const keys = (count: number) => Array.from({ length: count }, (_unused, index) => `e${index}`);

/** Les coches des cases aux rangs donnés, comptés à plat rangée après rangée, comme à l'écran. */
function ticking(checks: BlockChecks, ...flat: number[]) {
  const all = checks.rows.flatMap((row, rowIndex) =>
    row.boxes.map((box) => checkOf(rowIndex, box)),
  );
  return { checked: flat.flatMap((index) => all[index] ?? []) };
}

/** Chaque rangée lue comme à l'écran : son nom, puis les rangs des exercices de ses cases. */
function rowsOf(checks: BlockChecks) {
  return checks.rows.map((row) => ({
    label: row.label == null ? null : say(row.label),
    boxes: row.boxes.map((box) => (box.kind === CheckBoxKind.BLOCK ? "bloc" : box.exerciseIndex)),
  }));
}

function tallyOf(checks: BlockChecks, ...checked: number[]) {
  const tally = blockTally(checks, ticking(checks, ...checked));
  return tally == null ? null : { state: tally.state, label: say(tally.label) };
}

describe("blockChecks", () => {
  it("donne une case par exercice et par tour, rangée par tour, à partir de deux exercices", () => {
    const checks = blockChecks(settingsOf({ repeat: rounds(2) }), keys(3));
    expect(checks).toMatchObject({ unit: CheckUnit.ROUND, byRound: true });
    expect(rowsOf(checks)).toEqual([
      { label: "Tour 1", boxes: [0, 1, 2] },
      { label: "Tour 2", boxes: [0, 1, 2] },
    ]);
  });

  it("donne une case par série avec un seul exercice", () => {
    const checks = blockChecks(settingsOf({ repeat: rounds(2) }), keys(1));
    expect(checks).toMatchObject({ unit: CheckUnit.SET, byRound: false });
    expect(rowsOf(checks)).toEqual([
      { label: "Série 1", boxes: [0] },
      { label: "Série 2", boxes: [0] },
    ]);
  });

  it("donne une case par bip, à l'exercice de ce bip, avec un seul par bip", () => {
    const checks = blockChecks(oneByBeep(60, 3), keys(2));
    expect(checks.unit).toBe(CheckUnit.BEEP);
    expect(rowsOf(checks)).toEqual([
      { label: "Bip 1", boxes: [0] },
      { label: "Bip 2", boxes: [1] },
      { label: "Bip 3", boxes: [0] },
    ]);
    const boxes = rowsOf(blockChecks(oneByBeep(60, 4), keys(3))).map((row) => row.boxes);
    expect(boxes).toEqual([[0], [1], [2], [0]]);
  });

  it("donne une case par intervalle avec un seul par intervalle", () => {
    const settings = settingsOf({
      advance: cycle(20, 10),
      repeat: rounds(2),
      order: StructureOrder.ONE,
    });
    const checks = blockChecks(settings, keys(2));
    expect(checks.unit).toBe(CheckUnit.INTERVAL);
    expect(rowsOf(checks)[1]).toEqual({ label: "Intervalle 2", boxes: [1] });
  });

  it("donne une case par exercice pour un bloc fait une seule fois", () => {
    const checks = blockChecks(presets.FREE, keys(3));
    expect(checks).toMatchObject({ unit: CheckUnit.EXERCISE, byRound: false });
    expect(rowsOf(checks)).toEqual([{ label: null, boxes: [0, 1, 2] }]);
  });

  it("ne donne que « Bloc fait » pour un bloc autant que possible : ses tours ne se notent pas", () => {
    const checks = blockChecks(presets.AMRAP, keys(3));
    expect(checks).toMatchObject({ unit: null, byRound: false });
    expect(rowsOf(checks)).toEqual([{ label: null, boxes: ["bloc"] }]);
  });
});

describe("le nombre de cases et l'appartenance au bloc", () => {
  const checks = blockChecks(settingsOf({ repeat: rounds(2) }), keys(3));

  it("compte toutes les cases du bloc", () => {
    expect(blockCheckCount(checks)).toBe(6);
    expect(blockCheckCount(blockChecks(presets.AMRAP, keys(3)))).toBe(1);
  });

  it("refuse un suivi qui coche une case que le bloc n'a pas", () => {
    expect(trackingFitsBlock(checks, ticking(checks, 0, 5))).toBe(true);
    expect(trackingFitsBlock(checks, { checked: [{ row: 2, key: "e0" }] })).toBe(false);
    expect(trackingFitsBlock(checks, { checked: [{ row: 0, key: "gone" }] })).toBe(false);
    const oneStray = {
      checked: [
        { row: 0, key: "e0" },
        { row: 0, key: null },
      ],
    };
    expect(trackingFitsBlock(checks, oneStray)).toBe(false);
    const amrap = blockChecks(presets.AMRAP, keys(3));
    expect(trackingFitsBlock(amrap, { checked: [{ row: 0, key: null }] })).toBe(true);
    expect(trackingFitsBlock(amrap, { checked: [{ row: 0, key: "e0" }] })).toBe(false);
  });

  it("range les cases cochées par rangée, et ignore celles que le bloc n'a pas", () => {
    const stray = { row: 2, key: "e0" };
    expect(tickedRows(checks, { checked: [...ticking(checks, 1, 3).checked, stray] })).toEqual([
      [false, true, false],
      [true, false, false],
    ]);
    expect(tickedRows(checks, null)).toEqual([
      [false, false, false],
      [false, false, false],
    ]);
  });
});

describe("une coche suit son exercice", () => {
  const tracking = {
    checked: [
      { row: 0, key: "a" },
      { row: 0, key: "b" },
      { row: 1, key: "a" },
    ],
  };
  const twoRounds = settingsOf({ repeat: rounds(2) });

  it("ne glisse pas quand le Coach ajoute un exercice devant", () => {
    const checks = blockChecks(twoRounds, ["c", "a", "b"]);
    expect(tickedRows(checks, tracking)).toEqual([
      [false, true, true],
      [false, true, false],
    ]);
    expect(say(blockTally(checks, tracking)?.label ?? null)).toBe("Tour 1 en cours");
  });

  it("tombe avec l'exercice que le Coach retire ou remplace", () => {
    expect(tickedRows(blockChecks(twoRounds, ["a2", "b"]), tracking)).toEqual([
      [false, true],
      [false, false],
    ]);
  });

  it("tombe quand le bip passe à un autre exercice", () => {
    const beeps = { checked: [{ row: 2, key: "a" }] };
    expect(tickedRows(blockChecks(oneByBeep(60, 4), ["a", "b"]), beeps)[2]).toEqual([true]);
    expect(tickedRows(blockChecks(oneByBeep(60, 4), ["a", "b", "c"]), beeps)[2]).toEqual([false]);
  });

  it("se coche et se décoche par la case qu'elle désigne", () => {
    const checks = blockChecks(twoRounds, ["a", "b"]);
    const [, second] = checks.rows;
    expect(second?.boxes.map((box) => checkOf(1, box))).toEqual([
      { row: 1, key: "a" },
      { row: 1, key: "b" },
    ]);
    const [done] = blockChecks(presets.AMRAP, ["a"]).rows;
    expect(done?.boxes.map((box) => checkOf(0, box))).toEqual([{ row: 0, key: null }]);
  });
});

describe("blockTally", () => {
  const byRound = blockChecks(settingsOf({ repeat: rounds(4) }), keys(2));

  it("est NON SUIVI, `null`, quand rien n'est coché : jamais « 0 sur 4 »", () => {
    expect(blockTally(byRound, null)).toBeNull();
    expect(tallyOf(byRound)).toBeNull();
  });

  it("dit « Terminé » quand tout est coché", () => {
    expect(tallyOf(byRound, 0, 1, 2, 3, 4, 5, 6, 7)).toEqual({
      state: BlockTallyState.DONE,
      label: "Terminé",
    });
    expect(tallyOf(blockChecks(presets.AMRAP, keys(2)), 0)?.label).toBe("Terminé");
  });

  it("compte les tours complets, et dit « Tour 1 en cours » avant le premier", () => {
    expect(tallyOf(byRound, 0)).toEqual({
      state: BlockTallyState.PARTIAL,
      label: "Tour 1 en cours",
    });
    expect(tallyOf(byRound, 0, 1, 2)?.label).toBe("1 tour sur 4");
    expect(tallyOf(byRound, 0, 1, 2, 3, 5)?.label).toBe("2 tours sur 4");
  });

  it("nomme le partiel par son unité, accordé au nombre", () => {
    expect(tallyOf(blockChecks(settingsOf(), keys(1)), 0, 1, 2)?.label).toBe("3 séries sur 4");
    expect(tallyOf(blockChecks(oneByBeep(60, 10), keys(2)), 0)?.label).toBe("1 bip sur 10");
    expect(tallyOf(blockChecks(presets.TABATA, keys(1)), 0)?.label).toBe("1 série sur 8");
    expect(tallyOf(blockChecks(presets.FREE, keys(3)), 0, 2)?.label).toBe("2 exercices sur 3");
    const intervals = settingsOf({
      advance: cycle(20, 10),
      repeat: rounds(8),
      order: StructureOrder.ONE,
    });
    expect(tallyOf(blockChecks(intervals, keys(2)), 0, 1)?.label).toBe("2 intervalles sur 8");
  });
});

describe("trackingNote", () => {
  it("explique ce qui compte, selon le bloc", () => {
    expect(say(trackingNote(blockChecks(settingsOf(), keys(3))))).toBe(
      "Un tour compte quand ses 3 cases sont cochées. Décocher est toujours possible.",
    );
    expect(say(trackingNote(blockChecks(presets.AMRAP, keys(3))))).toBe(
      "Le nombre de tours n'est pas noté. Décocher est toujours possible.",
    );
    expect(say(trackingNote(blockChecks(presets.FREE, keys(3))))).toBe(
      "Décocher est toujours possible.",
    );
  });
});

describe("le suivi d'un bloc", () => {
  const check = (row: number, key: string | null = "a") => ({ row, key });

  it("se relit sans borne, mais pas avec une rangée négative ni une clé vide", () => {
    expect(sessionBlockTrackingSchema.safeParse({ checked: [check(5000)] }).success).toBe(true);
    expect(sessionBlockTrackingSchema.safeParse({ checked: [check(-1)] }).success).toBe(false);
    expect(sessionBlockTrackingSchema.safeParse({ checked: [check(0, "")] }).success).toBe(false);
  });

  it("se relit en ignorant un champ ajouté après coup, que l'envoi refuse", () => {
    const later = { checked: [{ ...check(0), at: "2026-10-25" }], updatedAt: "2026-10-25" };
    expect(sessionBlockTrackingSchema.parse(later)).toEqual({ checked: [check(0)] });
    expect(sessionBlockTrackingInputSchema.safeParse(later).success).toBe(false);
    const extraOnCheck = { checked: [{ ...check(0), at: "2026-10-25" }] };
    expect(sessionBlockTrackingInputSchema.safeParse(extraOnCheck).success).toBe(false);
  });

  it("s'envoie dans la borne de tout bloc, chaque case une seule fois", () => {
    const send = (checked: object[]) => sessionBlockTrackingInputSchema.safeParse({ checked });
    expect(send([check(0), check(98), check(98, null)]).success).toBe(true);
    expect(send([check(99)]).success).toBe(false);
    const distinct = Array.from({ length: BLOCK_MAX_CHECKS + 1 }, (_unused, index) =>
      check(index % 99, `e${Math.floor(index / 99)}`),
    );
    expect(send(distinct.slice(0, BLOCK_MAX_CHECKS)).success).toBe(true);
    expect(send(distinct).success).toBe(false);
    expect(issuesOf(sessionBlockTrackingInputSchema, { checked: [check(2), check(2)] })).toEqual([
      "checked: Une case ne peut être cochée qu'une fois.",
    ]);
  });

  it("borne tout bloc à 99 tours de 20 exercices", () => {
    expect(BLOCK_MAX_CHECKS).toBe(1980);
  });
});
