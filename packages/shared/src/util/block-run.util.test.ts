import { describe, expect, it } from "vitest";
import {
  asMuchAsPossible,
  beep,
  cycle,
  effort,
  gridOf,
  load,
  once,
  oneByBeep,
  presets,
  reps,
  roundRest,
  rounds,
  setRest,
  settingsOf,
} from "../../test/block-fixtures";
import { StructureOrder } from "../dto/structure-answer.schema";
import { blockRun, gridCellsAt, RunStepKind } from "./block-run.util";

const DO = RunStepKind.DO;
const REST = RunStepKind.REST;

describe("blockRun", () => {
  it("est vide quand le bloc n'a rien à chronométrer", () => {
    expect(blockRun(presets.FREE, 3, [])).toEqual([]);
    expect(blockRun(settingsOf(), 2, [])).toEqual([]);
  });

  it("joue un compte à rebours pour un autant que possible, un chrono qui monte pour une limite", () => {
    expect(blockRun(presets.AMRAP, 3, [])).toEqual([
      { kind: RunStepKind.CAP, seconds: 720, index: 1, exerciseIndex: null, row: null },
    ]);
    expect(blockRun(presets.FOR_TIME, 2, [])).toEqual([
      { kind: RunStepKind.UP, seconds: 900, index: 1, exerciseIndex: null, row: null },
    ]);
  });

  it("attend la fin de chaque série, avec le repos entre séries sauf après la dernière", () => {
    const steps = blockRun(settingsOf({ repeat: rounds(3), restBetweenRoundsSeconds: 90 }), 1, []);
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
    expect(blockRun(settings, 2, []).map((step) => [step.kind, step.seconds, step.index])).toEqual([
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
    const steps = blockRun(
      settingsOf({ repeat: rounds(1), restBetweenExercisesSeconds: 20 }),
      3,
      [],
    );
    expect(steps.filter((step) => step.kind === REST).map((step) => step.exerciseIndex)).toEqual([
      1, 2,
    ]);
  });

  describe("à son rythme, la grille a le dernier mot", () => {
    const series = settingsOf({ repeat: rounds(3) });

    it("joue le repos d'une colonne, ligne par ligne, sans repos dans la structure", () => {
      // Des tractions : 3 séries, 30 s puis 60 s de repos — la dernière ligne vaut pour la suite.
      const steps = blockRun(series, 1, [gridOf([reps, roundRest], [8, 30], [6, 60])]);
      expect(steps.map((step) => [step.kind, step.seconds, step.index])).toEqual([
        [DO, 0, 1],
        [REST, 30, 2],
        [DO, 0, 2],
        [REST, 60, 3],
        [DO, 0, 3],
      ]);
    });

    it("préfère la colonne au repos de la structure", () => {
      const settings = settingsOf({ repeat: rounds(2), restBetweenRoundsSeconds: 120 });
      const steps = blockRun(settings, 1, [gridOf([setRest], [45])]);
      expect(steps.filter((step) => step.kind === REST).map((step) => step.seconds)).toEqual([45]);
    });

    it("place « Repos entre séries » après son exercice, « Repos entre tours » en fin de tour", () => {
      const settings = settingsOf({ repeat: rounds(2), restBetweenExercisesSeconds: 15 });
      const grids = [gridOf([setRest], [40]), gridOf([roundRest], [90])];
      expect(blockRun(settings, 2, grids).map((step) => [step.kind, step.seconds])).toEqual([
        [DO, 0],
        [REST, 40],
        [DO, 0],
        [REST, 90],
        [DO, 0],
        [REST, 40],
        [DO, 0],
      ]);
    });

    it("fait d'un exercice à durée d'effort un compte à rebours", () => {
      const steps = blockRun(series, 1, [gridOf([effort, setRest], [30, 15])]);
      expect(steps.map((step) => [step.kind, step.seconds])).toEqual([
        [RunStepKind.EFFORT, 30],
        [REST, 15],
        [RunStepKind.EFFORT, 30],
        [REST, 15],
        [RunStepKind.EFFORT, 30],
      ]);
    });

    it("n'a rien à chronométrer sans aucune durée", () => {
      expect(blockRun(series, 1, [gridOf([reps, load], [8, 60])])).toEqual([]);
    });

    it("laisse au chrono de la structure le dernier mot hors de son rythme", () => {
      const steps = blockRun(settingsOf({ advance: cycle(20, 10), repeat: rounds(2) }), 1, [
        gridOf([effort], [30]),
      ]);
      expect(steps.map((step) => step.seconds)).toEqual([20, 10, 20]);
    });
  });

  it("enchaîne une seule fois les exercices, sans repos entre tours", () => {
    const settings = settingsOf({ repeat: once, restBetweenExercisesSeconds: 15 });
    expect(blockRun(settings, 2, []).map((step) => step.kind)).toEqual([DO, REST, DO]);
  });

  it("donne un compte à rebours par bip, sans exercice désigné quand tout s'enchaîne", () => {
    const steps = blockRun(settingsOf({ advance: beep(60), repeat: rounds(3) }), 2, []);
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
    const steps = blockRun(oneByBeep(40, 5), 2, []);
    expect(steps.map((step) => [step.index, step.exerciseIndex, step.row])).toEqual([
      [1, 0, 0],
      [2, 1, 0],
      [3, 0, 1],
      [4, 1, 1],
      [5, 0, 2],
    ]);
  });

  it("désigne l'exercice seul d'un bloc à chaque bip, sur la ligne de son tour", () => {
    const steps = blockRun(settingsOf({ advance: beep(60), repeat: rounds(3) }), 1, []);
    expect(steps.map((step) => [step.index, step.exerciseIndex, step.row])).toEqual([
      [1, 0, 0],
      [2, 0, 1],
      [3, 0, 2],
    ]);
  });

  it("alterne effort et repos, sans repos après le dernier effort", () => {
    const steps = blockRun(settingsOf({ advance: cycle(20, 10), repeat: rounds(3) }), 1, []);
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
    expect(blockRun(settings, 2, []).map((step) => [step.kind, step.exerciseIndex])).toEqual([
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
    expect(blockRun(settings, 2, []).map((step) => step.kind)).toEqual([RunStepKind.CAP]);
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
