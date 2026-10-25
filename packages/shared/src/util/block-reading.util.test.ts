import { describe, expect, it } from "vitest";
import {
  custom,
  cycle,
  effort,
  gridOf,
  load,
  once,
  oneByBeep,
  presets,
  reps,
  rounds,
  settingsOf,
} from "../../test/block-fixtures";
import { say } from "../../test/french";
import type { GridMetric } from "../dto/block-grid.schema";
import { MetricSource } from "../dto/exercise-block.schema";
import { METRIC_CATALOG, MetricKey, MetricUnit } from "../dto/exercise-metric.schema";
import { StructureOrder } from "../dto/structure-answer.schema";
import {
  blockClock,
  blockLetters,
  ClockKind,
  clockCounter,
  exerciseCodes,
  flowPhrase,
  type GridCell,
  GridLayout,
  type GridReading,
  gridLinePhrases,
  gridReading,
  letterAt,
} from "./block-reading.util";

const perSide: GridMetric = {
  id: "col_side",
  label: null,
  source: MetricSource.CATALOG,
  key: MetricKey.REPETITIONS,
  unit: MetricUnit.REPS_PER_SIDE,
};

const LABELS = new Map<GridMetric, string>([
  [reps, "répétitions"],
  [perSide, "répétitions"],
  [load, "charge"],
  [effort, "durée d'effort"],
  [custom, "cotation"],
]);

const UNITS = new Map<GridMetric, string>([
  [reps, "répétitions"],
  [perSide, "répétitions par côté"],
  [load, "kg"],
]);

/** Ce que l'app fournirait : le nom de la colonne, la valeur écrite, son unité. */
function describeCell(cell: GridCell) {
  const value = cell.metric === effort ? "1'30" : String(cell.value).replace(".", ",");
  return { label: LABELS.get(cell.metric) ?? "?", value, unit: UNITS.get(cell.metric) ?? null };
}

const line = (cells: readonly GridCell[]) => say(gridLinePhrases(cells, describeCell));

function lineOf(reading: GridReading) {
  if (reading.layout !== GridLayout.LINE) throw new Error(`attendu LINE, reçu ${reading.layout}`);
  return { each: say(reading.each), line: line(reading.cells) };
}

function rowsOf(reading: GridReading) {
  if (reading.layout !== GridLayout.TABLE && reading.layout !== GridLayout.CARDS) {
    throw new Error(`attendu une grille, reçu ${reading.layout}`);
  }
  return reading.rows.map((row) => `${say(row.label)} : ${line(row.cells)}`);
}

describe("la lettre du bloc et les codes", () => {
  it("compte A… Z, puis AA, AB…", () => {
    expect([0, 25, 26, 27, 51, 52].map(letterAt)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA"]);
  });

  it("ne donne une lettre qu'aux blocs sans libellé, et les fait se suivre", () => {
    const blocks = [
      { label: "Échauffement" },
      { label: null },
      { label: null },
      { label: "Finisher" },
      { label: null },
    ];
    expect(blockLetters(blocks)).toEqual([null, "A", "B", null, "C"]);
  });

  it("code les exercices d'un bloc à lettre, pas ceux d'un bloc à libellé", () => {
    expect(exerciseCodes("B", 3)).toEqual(["B1", "B2", "B3"]);
    expect(exerciseCodes(null, 2)).toEqual([null, null]);
  });
});

describe("gridReading", () => {
  it("n'a pas de grille sans colonne, ni quand aucune cellule n'est remplie", () => {
    expect(gridReading(gridOf([]), presets.SERIES, 1)).toEqual({ layout: GridLayout.NONE });
    expect(gridReading(gridOf([reps, load], [null, null], [null]), presets.SERIES, 1)).toEqual({
      layout: GridLayout.NONE,
    });
  });

  it("lit des lignes identiques en une phrase, « à chaque » tour ou série", () => {
    const grid = gridOf([reps, load], [6, 60], [6, 60], [6, 60], [6, 60]);
    expect(lineOf(gridReading(grid, presets.SERIES, 2))).toEqual({
      each: "À chaque tour : ",
      line: "6 répétitions à 60 kg",
    });
    expect(lineOf(gridReading(grid, presets.SERIES, 1)).each).toBe("À chaque série : ");
  });

  it("dit « à chaque bip » ou « à chaque intervalle » avec un seul exercice par…", () => {
    const grid = gridOf([reps], [3]);
    expect(lineOf(gridReading(grid, oneByBeep(60, 10), 2)).each).toBe("À chaque bip : ");
    const intervals = settingsOf({
      advance: cycle(20, 10),
      repeat: rounds(8),
      order: StructureOrder.ONE,
    });
    expect(lineOf(gridReading(grid, intervals, 2)).each).toBe("À chaque intervalle : ");
  });

  it("ne dit pas « à chaque » pour un bloc fait une seule fois", () => {
    expect(lineOf(gridReading(gridOf([reps], [10]), presets.FREE, 1))).toEqual({
      each: null,
      line: "10 répétitions",
    });
  });

  it("aligne des lignes différentes en tableau, nommées comme la phrase du bloc", () => {
    const grid = gridOf([reps, load], [6, 60], [6, 62.5]);
    const reading = gridReading(grid, presets.SERIES, 2);
    expect(reading.layout).toBe(GridLayout.TABLE);
    expect(rowsOf(reading)).toEqual([
      "Tour 1 : 6 répétitions à 60 kg",
      "Tour 2 : 6 répétitions à 62,5 kg",
    ]);
    expect(rowsOf(gridReading(grid, presets.SERIES, 1))[0]).toBe("Série 1 : 6 répétitions à 60 kg");
    expect(rowsOf(gridReading(grid, oneByBeep(60, 10), 2))[1]).toBe(
      "Passage 2 : 6 répétitions à 62,5 kg",
    );
  });

  it("passe en cartes au-delà de trois colonnes : jamais de défilement horizontal", () => {
    const grid = gridOf([reps, load, effort, custom], [6, 60, 90, "6a"], [5]);
    expect(gridReading(grid, presets.SERIES, 1).layout).toBe(GridLayout.CARDS);
    const three = gridOf([reps, load, effort], [6, 60, 90], [5]);
    expect(gridReading(three, presets.SERIES, 1).layout).toBe(GridLayout.TABLE);
  });

  it("garde la grille dès qu'une cellule est remplie, une cellule vide y valant `null`", () => {
    const reading = gridReading(gridOf([reps, load], [6, null], [8]), presets.SERIES, 1);
    expect(rowsOf(reading)).toEqual([
      "Série 1 : 6 répétitions, charge —",
      "Série 2 : 8 répétitions, charge —",
    ]);
  });
});

describe("gridLinePhrases", () => {
  const cell = (metric: GridMetric, value: GridCell["value"]): GridCell => ({ metric, value });

  it("écrit une cellule vide « charge — », sans « à »", () => {
    expect(line([cell(reps, 5), cell(load, null)])).toBe("5 répétitions, charge —");
    expect(line([cell(reps, null), cell(load, 60)])).toBe("répétitions —, 60 kg");
  });

  it("accorde au nombre, écrit la valeur comme l'app, et lit une durée d'effort", () => {
    expect(line([cell(reps, 1)])).toBe("1 répétition");
    expect(line([cell(reps, 2.5)])).toBe("2,5 répétitions");
    expect(line([cell(reps, 1.5)])).toBe("1,5 répétition");
    expect(line([cell(effort, 90)])).toBe("1'30 d'effort");
  });

  it("écrit telle quelle une valeur sans tournure propre, suivie de son unité s'il y en a une", () => {
    expect(line([cell(reps, "8-10"), cell(custom, "6a")])).toBe("8-10 répétitions, 6a");
    expect(line([cell(perSide, 6), cell(load, 20)])).toBe("6 répétitions par côté à 20 kg");
    expect(line([cell(custom, 12)])).toBe("12");
  });

  it("accorde aussi les répétitions par côté", () => {
    expect(line([cell(perSide, 1)])).toBe("1 répétition par côté");
    expect(line([cell(perSide, "8-10")])).toBe("8-10 répétitions par côté");
  });

  it("s'appuie sur des unités que seules les répétitions admettent", () => {
    for (const unit of [MetricUnit.REPS, MetricUnit.REPS_PER_SIDE]) {
      const counted = Object.entries(METRIC_CATALOG).filter(([, entry]) =>
        (entry.units as readonly MetricUnit[]).includes(unit),
      );
      expect(counted.map(([key]) => key)).toEqual([MetricKey.REPETITIONS]);
    }
  });
});

describe("flowPhrase", () => {
  it("enchaîne au moins deux exercices tour après tour", () => {
    expect(say(flowPhrase(presets.SERIES, ["A1", "A2", "A3"]))).toBe(
      "A1, A2 et A3 à la suite, puis on recommence.",
    );
    expect(say(flowPhrase(presets.SERIES, ["A1", "A2"]))).toBe(
      "A1 et A2 à la suite, puis on recommence.",
    );
  });

  it("se tait avec un seul exercice, un seul par bip, ou un seul passage", () => {
    expect(flowPhrase(presets.SERIES, ["A1"])).toBeNull();
    expect(flowPhrase(oneByBeep(60, 10), ["A1", "A2"])).toBeNull();
    expect(flowPhrase(presets.FREE, ["A1", "A2"])).toBeNull();
  });
});

describe("blockClock", () => {
  it("déduit le chrono des réglages", () => {
    expect(blockClock(presets.AMRAP, 3)).toEqual({ kind: ClockKind.CAP, capSeconds: 720 });
    expect(blockClock(presets.EMOM, 2)).toEqual({ kind: ClockKind.BEEP, everySeconds: 60 });
    expect(blockClock(presets.TABATA, 1)).toEqual({
      kind: ClockKind.CYCLE,
      workSeconds: 20,
      restSeconds: 10,
    });
    expect(blockClock(presets.FOR_TIME, 2)).toEqual({ kind: ClockKind.UP, limitSeconds: 900 });
  });

  it("lance un repos entre tours, ou entre exercices à partir de deux", () => {
    expect(blockClock(presets.SERIES, 1)).toEqual({
      kind: ClockKind.REST,
      restBetweenRoundsSeconds: 120,
      restBetweenExercisesSeconds: null,
    });
    const betweenExercises = settingsOf({ restBetweenExercisesSeconds: 30 });
    expect(blockClock(betweenExercises, 2)).toEqual({
      kind: ClockKind.REST,
      restBetweenRoundsSeconds: null,
      restBetweenExercisesSeconds: 30,
    });
    expect(blockClock(betweenExercises, 1)).toBeNull();
    const onceWithRest = settingsOf({ repeat: once, restBetweenRoundsSeconds: 60 });
    expect(blockClock(onceWithRest, 1)).toBeNull();
  });

  it("est `null` quand il n'y a rien à chronométrer", () => {
    expect(blockClock(presets.FREE, 3)).toBeNull();
    expect(blockClock(settingsOf(), 2)).toBeNull();
  });
});

describe("clockCounter", () => {
  it("parle comme la phrase : séries avec un exercice, tours à partir de deux", () => {
    expect(say(clockCounter(presets.SERIES, 1, 3))).toBe("Série 3 / 4");
    expect(say(clockCounter(presets.SERIES, 2, 3))).toBe("Tour 3 / 4");
    expect(say(clockCounter(presets.EMOM, 2, 3))).toBe("Tour 3 / 10");
  });

  it("nomme l'exercice du bip ou de l'intervalle avec un seul exercice par…", () => {
    const names = ["KB swing", "Burpees"];
    expect(say(clockCounter(oneByBeep(60, 10), 2, 4, names))).toBe("Bip 4 / 10 · Burpees");
    expect(say(clockCounter(oneByBeep(60, 10), 2, 4))).toBe("Bip 4 / 10");
    const intervals = settingsOf({
      advance: cycle(20, 10),
      repeat: rounds(8),
      order: StructureOrder.ONE,
    });
    expect(say(clockCounter(intervals, 2, 5, names))).toBe("Intervalle 5 / 8 · KB swing");
    expect(say(clockCounter(intervals, 2, 5))).toBe("Intervalle 5 / 8");
    const three = ["A", "B", "C"];
    expect([1, 3, 4].map((index) => say(clockCounter(oneByBeep(60, 10), 3, index, three)))).toEqual(
      ["Bip 1 / 10 · A", "Bip 3 / 10 · C", "Bip 4 / 10 · A"],
    );
  });

  it("est `null` sans nombre de tours, avec un chrono qui monte, ou sans chrono", () => {
    expect(clockCounter(presets.AMRAP, 2, 1)).toBeNull();
    expect(clockCounter(presets.FOR_TIME, 2, 1)).toBeNull();
    expect(clockCounter(presets.FREE, 2, 1)).toBeNull();
  });
});
