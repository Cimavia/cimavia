import { describe, expect, it } from "vitest";
import { cycle, oneByBeep, presets, rounds, settingsOf } from "../../test/block-fixtures";
import { say } from "../../test/french";
import {
  BLOCK_MAX_CHECKS,
  sessionBlockTrackingInputSchema,
  sessionBlockTrackingSchema,
} from "../dto/block-tracking.schema";
import { StructureOrder } from "../dto/structure.schema";
import {
  type BlockChecks,
  BlockTallyState,
  blockCheckCount,
  blockChecks,
  blockTally,
  CheckBoxKind,
  CheckUnit,
  tickedRows,
  trackingFitsBlock,
  trackingNote,
} from "./block-tracking.util";

const tracked = (...checked: number[]) => ({ checked });

/** Chaque rangée lue comme à l'écran : son nom, puis les rangs des exercices de ses cases. */
function rowsOf(checks: BlockChecks) {
  return checks.rows.map((row) => ({
    label: row.label == null ? null : say(row.label),
    boxes: row.boxes.map((box) => (box.kind === CheckBoxKind.BLOCK ? "bloc" : box.exerciseIndex)),
  }));
}

function tallyOf(checks: BlockChecks, ...checked: number[]) {
  const tally = blockTally(checks, tracked(...checked));
  return tally == null ? null : { state: tally.state, label: say(tally.label) };
}

describe("blockChecks", () => {
  it("donne une case par exercice et par tour, rangée par tour, à partir de deux exercices", () => {
    const checks = blockChecks(settingsOf({ repeat: rounds(2) }), 3);
    expect(checks).toMatchObject({ unit: CheckUnit.ROUND, byRound: true });
    expect(rowsOf(checks)).toEqual([
      { label: "Tour 1", boxes: [0, 1, 2] },
      { label: "Tour 2", boxes: [0, 1, 2] },
    ]);
  });

  it("donne une case par série avec un seul exercice", () => {
    const checks = blockChecks(settingsOf({ repeat: rounds(2) }), 1);
    expect(checks).toMatchObject({ unit: CheckUnit.SET, byRound: false });
    expect(rowsOf(checks)).toEqual([
      { label: "Série 1", boxes: [0] },
      { label: "Série 2", boxes: [0] },
    ]);
  });

  it("donne une case par bip, à l'exercice de ce bip, avec un seul par bip", () => {
    const checks = blockChecks(oneByBeep(60, 3), 2);
    expect(checks.unit).toBe(CheckUnit.BEEP);
    expect(rowsOf(checks)).toEqual([
      { label: "Bip 1", boxes: [0] },
      { label: "Bip 2", boxes: [1] },
      { label: "Bip 3", boxes: [0] },
    ]);
  });

  it("donne une case par intervalle avec un seul par intervalle", () => {
    const settings = settingsOf({
      advance: cycle(20, 10),
      repeat: rounds(2),
      order: StructureOrder.ONE,
    });
    const checks = blockChecks(settings, 2);
    expect(checks.unit).toBe(CheckUnit.INTERVAL);
    expect(rowsOf(checks)[1]).toEqual({ label: "Intervalle 2", boxes: [1] });
  });

  it("donne une case par exercice pour un bloc fait une seule fois", () => {
    const checks = blockChecks(presets.FREE, 3);
    expect(checks).toMatchObject({ unit: CheckUnit.EXERCISE, byRound: false });
    expect(rowsOf(checks)).toEqual([{ label: null, boxes: [0, 1, 2] }]);
  });

  it("ne donne que « Bloc fait » pour un bloc autant que possible : ses tours ne se notent pas", () => {
    const checks = blockChecks(presets.AMRAP, 3);
    expect(checks).toMatchObject({ unit: null, byRound: false });
    expect(rowsOf(checks)).toEqual([{ label: null, boxes: ["bloc"] }]);
  });
});

describe("le nombre de cases et l'appartenance au bloc", () => {
  const checks = blockChecks(settingsOf({ repeat: rounds(2) }), 3);

  it("compte toutes les cases du bloc", () => {
    expect(blockCheckCount(checks)).toBe(6);
    expect(blockCheckCount(blockChecks(presets.AMRAP, 3))).toBe(1);
  });

  it("refuse un suivi qui coche une case que le bloc n'a pas", () => {
    expect(trackingFitsBlock(checks, tracked(0, 5))).toBe(true);
    expect(trackingFitsBlock(checks, tracked(6))).toBe(false);
  });

  it("range les cases cochées par rangée, et ignore celles au-delà du bloc", () => {
    expect(tickedRows(checks, tracked(1, 3, 9))).toEqual([
      [false, true, false],
      [true, false, false],
    ]);
    expect(tickedRows(checks, null)).toEqual([
      [false, false, false],
      [false, false, false],
    ]);
  });
});

describe("blockTally", () => {
  const byRound = blockChecks(settingsOf({ repeat: rounds(4) }), 2);

  it("est NON SUIVI, `null`, quand rien n'est coché : jamais « 0 sur 4 »", () => {
    expect(blockTally(byRound, null)).toBeNull();
    expect(tallyOf(byRound)).toBeNull();
  });

  it("dit « Terminé » quand tout est coché", () => {
    expect(tallyOf(byRound, 0, 1, 2, 3, 4, 5, 6, 7)).toEqual({
      state: BlockTallyState.DONE,
      label: "Terminé",
    });
    expect(tallyOf(blockChecks(presets.AMRAP, 2), 0)?.label).toBe("Terminé");
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
    expect(tallyOf(blockChecks(settingsOf(), 1), 0, 1, 2)?.label).toBe("3 séries sur 4");
    expect(tallyOf(blockChecks(oneByBeep(60, 10), 2), 0)?.label).toBe("1 bip sur 10");
    expect(tallyOf(blockChecks(presets.TABATA, 1), 0)?.label).toBe("1 série sur 8");
    expect(tallyOf(blockChecks(presets.FREE, 3), 0, 2)?.label).toBe("2 exercices sur 3");
    const intervals = settingsOf({
      advance: cycle(20, 10),
      repeat: rounds(8),
      order: StructureOrder.ONE,
    });
    expect(tallyOf(blockChecks(intervals, 2), 0, 1)?.label).toBe("2 intervalles sur 8");
  });
});

describe("trackingNote", () => {
  it("explique ce qui compte, selon le bloc", () => {
    expect(say(trackingNote(blockChecks(settingsOf(), 3)))).toBe(
      "Un tour compte quand ses 3 cases sont cochées. Décocher est toujours possible.",
    );
    expect(say(trackingNote(blockChecks(presets.AMRAP, 3)))).toBe(
      "Le nombre de tours n'est pas noté. Décocher est toujours possible.",
    );
    expect(say(trackingNote(blockChecks(presets.FREE, 3)))).toBe("Décocher est toujours possible.");
  });
});

describe("le suivi d'un bloc", () => {
  it("se relit sans borne, mais pas avec des cases négatives", () => {
    expect(sessionBlockTrackingSchema.safeParse(tracked(BLOCK_MAX_CHECKS + 5)).success).toBe(true);
    expect(sessionBlockTrackingSchema.safeParse(tracked(-1)).success).toBe(false);
  });

  it("s'envoie dans la borne de tout bloc, chaque case une seule fois", () => {
    expect(
      sessionBlockTrackingInputSchema.safeParse(tracked(0, BLOCK_MAX_CHECKS - 1)).success,
    ).toBe(true);
    expect(sessionBlockTrackingInputSchema.safeParse(tracked(BLOCK_MAX_CHECKS)).success).toBe(
      false,
    );
    expect(sessionBlockTrackingInputSchema.safeParse(tracked(2, 2)).success).toBe(false);
  });

  it("borne tout bloc à 99 tours de 20 exercices", () => {
    expect(BLOCK_MAX_CHECKS).toBe(1980);
  });
});
