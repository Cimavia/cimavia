import { describe, expect, it } from "vitest";
import {
  asMuchAsPossible,
  beep,
  cycle,
  gridOf,
  once,
  oneByBeep,
  presets,
  reps,
  rounds,
  settingsOf,
} from "../../test/block-fixtures";
import { StructureOrder } from "../dto/structure-answer.schema";
import { blockRun, gridCellsAt, RunStepKind } from "./block-run.util";

const DO = RunStepKind.DO;
const REST = RunStepKind.REST;

describe("blockRun", () => {
  it("est vide quand le bloc n'a rien à chronométrer", () => {
    expect(blockRun(presets.FREE, 3)).toEqual([]);
    expect(blockRun(settingsOf(), 2)).toEqual([]);
  });

  it("joue un compte à rebours pour un autant que possible, un chrono qui monte pour une limite", () => {
    expect(blockRun(presets.AMRAP, 3)).toEqual([
      { kind: RunStepKind.CAP, seconds: 720, index: 1, exerciseIndex: null, row: null },
    ]);
    expect(blockRun(presets.FOR_TIME, 2)).toEqual([
      { kind: RunStepKind.UP, seconds: 900, index: 1, exerciseIndex: null, row: null },
    ]);
  });

  it("attend la fin de chaque série, avec le repos entre séries sauf après la dernière", () => {
    const steps = blockRun(settingsOf({ repeat: rounds(3), restBetweenRoundsSeconds: 90 }), 1);
    expect(steps).toEqual([
      { kind: DO, seconds: 0, index: 1, exerciseIndex: 0, row: 0 },
      { kind: REST, seconds: 90, index: 2, exerciseIndex: 0, row: 1 },
      { kind: DO, seconds: 0, index: 2, exerciseIndex: 0, row: 1 },
      { kind: REST, seconds: 90, index: 3, exerciseIndex: 0, row: 2 },
      { kind: DO, seconds: 0, index: 3, exerciseIndex: 0, row: 2 },
    ]);
  });

  it("place le repos entre exercices dans le tour, celui entre tours entre deux tours", () => {
    const settings = settingsOf({
      repeat: rounds(2),
      restBetweenExercisesSeconds: 30,
      restBetweenRoundsSeconds: 120,
    });
    expect(blockRun(settings, 2).map((step) => [step.kind, step.seconds, step.index])).toEqual([
      [DO, 0, 1],
      [REST, 30, 1],
      [DO, 0, 1],
      [REST, 120, 2],
      [DO, 0, 2],
      [REST, 30, 2],
      [DO, 0, 2],
    ]);
  });

  it("annonce pendant un repos l'exercice qui vient", () => {
    const steps = blockRun(settingsOf({ repeat: rounds(1), restBetweenExercisesSeconds: 20 }), 3);
    expect(steps.filter((step) => step.kind === REST).map((step) => step.exerciseIndex)).toEqual([
      1, 2,
    ]);
  });

  it("enchaîne une seule fois les exercices, sans repos entre tours", () => {
    const settings = settingsOf({ repeat: once, restBetweenExercisesSeconds: 15 });
    expect(blockRun(settings, 2).map((step) => step.kind)).toEqual([DO, REST, DO]);
  });

  it("donne un compte à rebours par bip, sans exercice désigné quand tout s'enchaîne", () => {
    const steps = blockRun(settingsOf({ advance: beep(60), repeat: rounds(3) }), 2);
    expect(steps).toEqual(
      [1, 2, 3].map((index) => ({
        kind: RunStepKind.BEEP,
        seconds: 60,
        index,
        exerciseIndex: null,
        row: null,
      })),
    );
  });

  it("avec un seul par bip, passe d'un exercice à l'autre et avance leur ligne à chaque passage", () => {
    const steps = blockRun(oneByBeep(40, 5), 2);
    expect(steps.map((step) => [step.index, step.exerciseIndex, step.row])).toEqual([
      [1, 0, 0],
      [2, 1, 0],
      [3, 0, 1],
      [4, 1, 1],
      [5, 0, 2],
    ]);
  });

  it("alterne effort et repos, sans repos après le dernier effort", () => {
    const steps = blockRun(settingsOf({ advance: cycle(20, 10), repeat: rounds(3) }), 1);
    expect(steps.map((step) => [step.kind, step.seconds, step.index])).toEqual([
      [RunStepKind.EFFORT, 20, 1],
      [REST, 10, 2],
      [RunStepKind.EFFORT, 20, 2],
      [REST, 10, 3],
      [RunStepKind.EFFORT, 20, 3],
    ]);
  });

  it("avec un seul par intervalle, le repos annonce l'exercice suivant", () => {
    const settings = settingsOf({
      advance: cycle(30, 15),
      repeat: rounds(2),
      order: StructureOrder.ONE,
    });
    expect(blockRun(settings, 2).map((step) => [step.kind, step.exerciseIndex])).toEqual([
      [RunStepKind.EFFORT, 0],
      [REST, 1],
      [RunStepKind.EFFORT, 1],
    ]);
  });

  it("ne lance pas les repos sous un compte à rebours", () => {
    const settings = settingsOf({
      repeat: asMuchAsPossible(600),
      restBetweenExercisesSeconds: 30,
    });
    expect(blockRun(settings, 2).map((step) => step.kind)).toEqual([RunStepKind.CAP]);
  });
});

describe("gridCellsAt", () => {
  it("rend les valeurs du tour, la dernière ligne au-delà", () => {
    const grid = gridOf([reps], [8], [6]);
    expect(gridCellsAt(grid, 0)?.map((cell) => cell.value)).toEqual([8]);
    expect(gridCellsAt(grid, 5)?.map((cell) => cell.value)).toEqual([6]);
  });

  it("rend `null` sans ligne, ou sur une ligne sans valeur", () => {
    expect(gridCellsAt(gridOf([reps]), 0)).toBeNull();
    expect(gridCellsAt(gridOf([reps], []), 0)).toBeNull();
  });
});
