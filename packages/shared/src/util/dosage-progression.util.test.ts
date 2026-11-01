import { describe, expect, it } from "vitest";
import { custom, effort, load } from "../../test/block-fixtures";
import {
  type CustomMetric,
  FRENCH_CLIMBING_SCALE,
  MetricKey,
  MetricUnit,
  type MetricValue,
  MetricValueType,
} from "../dto/exercise-metric.schema";
import { MetricSource } from "../dto/metric-reference.schema";
import {
  STRUCTURE_MAX_DURATION_SECONDS,
  STRUCTURE_MAX_ROUNDS,
  STRUCTURE_MIN_DURATION_SECONDS,
} from "../dto/structure.schema";
import {
  dosageProgression,
  dosageRowReset,
  isUsableStep,
  metricProgressionMeasure,
  type ProgressionCell,
  ProgressionCellKind,
  ProgressionDirection,
  type ProgressionMeasure,
  ProgressionMeasureKind,
  type ProgressionSlot,
  type ProgressionStep,
  progressionStart,
  settingProgressionMeasure,
  steppedValue,
} from "./dosage-progression.util";
import {
  type DosageCell,
  DosageCellKind,
  DosageColumnKind,
  DosageOff,
} from "./planned-dosage.util";
import { SettingValue } from "./structure-settings.util";

const KG: ProgressionMeasure = {
  kind: ProgressionMeasureKind.NUMBER,
  integer: false,
  min: null,
  max: null,
};
const SECONDS: ProgressionMeasure = { kind: ProgressionMeasureKind.DURATION, min: 0, max: null };
const GRADES: ProgressionMeasure = {
  kind: ProgressionMeasureKind.SCALE,
  scale: [...FRENCH_CLIMBING_SCALE],
};

const add = (amount: number): ProgressionStep => ({
  direction: ProgressionDirection.ADD,
  amount,
});
const remove = (amount: number): ProgressionStep => ({
  direction: ProgressionDirection.REMOVE,
  amount,
});

type Week = { deload?: boolean; locked?: boolean };

/** Une semaine où la ligne a une valeur ; `reference` vaut la séance-type reçue. */
const valued = (
  values: MetricValue[],
  {
    deload = false,
    locked = false,
    reference = values,
  }: Week & { reference?: MetricValue[] | null } = {},
): ProgressionSlot => ({
  column: {
    kind: DosageColumnKind.COPY,
    copyId: `copy-${Math.random()}`,
    weekNumber: 1,
    deload,
    date: "2026-11-02",
    showDay: false,
    locked,
  },
  cell: {
    kind: DosageCellKind.VALUE,
    values,
    reference,
    adjusted: reference !== null && values.some((value, index) => value !== reference[index]),
  },
});

const absent = (): ProgressionSlot => ({
  column: { kind: DosageColumnKind.ABSENT, weekNumber: 1, deload: false, date: "2026-11-02" },
  cell: { kind: DosageCellKind.ABSENT },
});

const hatched = (reason: DosageOff = DosageOff.REPLACED): ProgressionSlot => ({
  column: valued([null]).column,
  cell: { kind: DosageCellKind.OFF, reason } satisfies DosageCell,
});

const valuesOf = (cell: ProgressionCell | undefined) =>
  cell === undefined || cell.kind === ProgressionCellKind.SKIPPED ? null : cell.values;

describe("dosageProgression", () => {
  it("fait avancer chaque semaine active depuis la précédente, et saute l'absente et la décharge", () => {
    // La planche, frame 3 bis : S1 départ, S3 non posée, S4 décharge, +2,5 kg.
    const slots = [
      valued([60]),
      valued([60, 60, 60, 62.5], { reference: [60, 60, 60, 60] }),
      absent(),
      valued([50], { deload: true }),
      valued([60]),
    ];

    const progression = dosageProgression(slots, KG, add(2.5));

    expect(progression?.cells).toEqual([
      { kind: ProgressionCellKind.START, values: [60] },
      { kind: ProgressionCellKind.STEPPED, values: [62.5, 62.5, 62.5, 62.5] },
      { kind: ProgressionCellKind.SKIPPED },
      { kind: ProgressionCellKind.DELOAD, values: [50] },
      { kind: ProgressionCellKind.STEPPED, values: [65] },
    ]);
    expect(progression?.start).toEqual({ index: 0, values: [60] });
  });

  it("dit les semaines dont une valeur ajustée serait remplacée", () => {
    const slots = [
      valued([60]),
      valued([60, 60, 60, 62.5], { reference: [60, 60, 60, 60] }),
      // Ajustée, mais déjà à la valeur que le pas lui donne : rien n'est perdu.
      valued([65], { reference: [60] }),
    ];

    expect(dosageProgression(slots, KG, add(2.5))?.overwritten).toEqual([1]);
  });

  it("ajoute le pas à chaque série, l'écart entre elles reste le même", () => {
    const slots = [valued([60, 65, 70]), valued([60, 65, 70])];

    expect(valuesOf(dosageProgression(slots, KG, add(2.5))?.cells[1])).toEqual([62.5, 67.5, 72.5]);
  });

  it("tire une série de plus de la dernière, et en garde une de moins", () => {
    const slots = [valued([60, 65]), valued([0, 0, 0]), valued([0])];
    const cells = dosageProgression(slots, KG, add(5))?.cells;

    expect(valuesOf(cells?.[1])).toEqual([65, 70, 70]);
    expect(valuesOf(cells?.[2])).toEqual([70]);
  });

  it("laisse vide une série vide", () => {
    const slots = [valued([null, 60]), valued([null, 60])];

    expect(valuesOf(dosageProgression(slots, KG, add(2.5))?.cells[1])).toEqual([null, 62.5]);
  });

  it("garde la valeur d'une semaine dont la série précédente est vide, et en repart", () => {
    const slots = [valued([8, null]), valued([9, 9]), valued([0, 0])];
    const cells = dosageProgression(slots, KG, add(1))?.cells;

    expect(valuesOf(cells?.[1])).toEqual([9, 9]);
    expect(valuesOf(cells?.[2])).toEqual([10, 10]);
  });

  it("garde la valeur d'une semaine dont la précédente porte un palier hors échelle", () => {
    const slots = [valued(["6a", "10a"]), valued(["6a", "6b"])];

    expect(valuesOf(dosageProgression(slots, GRADES, add(1))?.cells[1])).toEqual(["6a+", "6b"]);
  });

  it("fait repartir la suite d'une semaine débriefée, sans la changer", () => {
    const slots = [valued([60]), valued([62.5], { locked: true }), valued([60])];
    const cells = dosageProgression(slots, KG, add(5))?.cells;

    expect(cells?.[1]).toEqual({ kind: ProgressionCellKind.DEBRIEFED, values: [62.5] });
    expect(valuesOf(cells?.[2])).toEqual([67.5]);
  });

  it("part d'une semaine débriefée quand c'est la première active", () => {
    const slots = [absent(), valued([60], { locked: true }), valued([60])];
    const progression = dosageProgression(slots, KG, add(5));

    expect(progression?.start.index).toBe(1);
    expect(valuesOf(progression?.cells[2])).toEqual([65]);
  });

  it("saute les cellules hachurées", () => {
    const slots = [valued([10]), hatched(), hatched(DosageOff.NOT_THIS_WEEK), valued([10])];
    const cells = dosageProgression(slots, KG, add(1))?.cells;

    expect(cells?.[1]).toEqual({ kind: ProgressionCellKind.SKIPPED });
    expect(cells?.[2]).toEqual({ kind: ProgressionCellKind.SKIPPED });
    expect(valuesOf(cells?.[3])).toEqual([11]);
  });

  it("retire le pas", () => {
    const slots = [valued([150]), valued([150]), valued([150])];
    const cells = dosageProgression(slots, SECONDS, remove(15))?.cells;

    expect(cells?.map(valuesOf)).toEqual([[150], [135], [120]]);
  });

  it("ne fait rien d'un pas inutilisable", () => {
    expect(dosageProgression([valued([60]), valued([60])], KG, add(0))).toBeNull();
  });

  it("ne fait rien sans départ", () => {
    expect(dosageProgression([absent(), valued([60], { deload: true })], KG, add(1))).toBeNull();
  });
});

describe("progressionStart", () => {
  it("part de la première semaine active", () => {
    const slots = [absent(), valued([50], { deload: true }), valued([60]), valued([60])];

    expect(progressionStart(slots)).toEqual({ index: 2, values: [60] });
  });

  it("n'a pas de départ sans valeur", () => {
    expect(progressionStart([valued([null, null]), valued([60])])).toBeNull();
  });

  it("n'a pas de départ sans semaine à écrire après lui", () => {
    const slots = [
      valued([60]),
      valued([60], { deload: true }),
      valued([60], { locked: true }),
      absent(),
    ];

    expect(progressionStart(slots)).toBeNull();
  });

  it("n'a pas de départ sur une ligne sans semaine active", () => {
    expect(progressionStart([absent(), hatched()])).toBeNull();
  });
});

describe("steppedValue", () => {
  it("calcule une durée en secondes : 2 min 30 + 15 s = 2 min 45", () => {
    expect(steppedValue(150, SECONDS, add(15))).toBe(165);
  });

  it("arrondit aux décimales tapées", () => {
    expect(steppedValue(0.1, KG, add(0.2))).toBe(0.3);
  });

  it("s'arrête aux bornes de la mesure", () => {
    const rounds = settingProgressionMeasure(SettingValue.ROUNDS);
    const rest = settingProgressionMeasure(SettingValue.REST);

    expect(steppedValue(98, rounds, add(3))).toBe(STRUCTURE_MAX_ROUNDS);
    expect(steppedValue(2, rounds, remove(3))).toBe(1);
    expect(steppedValue(10, rest, remove(30))).toBe(STRUCTURE_MIN_DURATION_SECONDS);
    expect(steppedValue(STRUCTURE_MAX_DURATION_SECONDS, rest, add(1))).toBe(
      STRUCTURE_MAX_DURATION_SECONDS,
    );
    expect(steppedValue(10, SECONDS, remove(30))).toBe(0);
  });

  it("laisse passer sous zéro un nombre sans borne : un lest négatif est une assistance", () => {
    expect(steppedValue(5, KG, remove(10))).toBe(-5);
  });

  it("avance d'autant de paliers, et bute sur le premier ou le dernier", () => {
    expect(steppedValue("5a", GRADES, add(2))).toBe("5c");
    expect(steppedValue("9b+", GRADES, add(3))).toBe("9c");
    expect(steppedValue("4b", GRADES, remove(3))).toBe("4a");
  });

  it("laisse une valeur vide, d'un autre type, ou hors échelle", () => {
    expect(steppedValue(null, KG, add(1))).toBeNull();
    expect(steppedValue("lourd", KG, add(1))).toBe("lourd");
    expect(steppedValue("10a", GRADES, add(1))).toBe("10a");
    expect(steppedValue(5, GRADES, add(1))).toBe(5);
  });
});

describe("isUsableStep", () => {
  it.each([
    [add(2.5), KG, true],
    [remove(2.5), KG, true],
    [add(0), KG, false],
    [add(-1), KG, false],
    [add(Number.NaN), KG, false],
    [add(1.5), settingProgressionMeasure(SettingValue.ROUNDS), false],
    [add(1.5), GRADES, false],
    [add(1.5), SECONDS, false],
    [add(15), SECONDS, true],
  ])("%o sur %o : %s", (step, measure, usable) => {
    expect(isUsableStep(step, measure)).toBe(usable);
  });
});

describe("metricProgressionMeasure", () => {
  const grade = {
    id: "g",
    label: null,
    source: MetricSource.CATALOG,
    key: MetricKey.GRADE,
  } as const;
  const houseScale: CustomMetric = {
    id: "metric_1",
    label: "Cotation bloc",
    unit: null,
    valueType: MetricValueType.SCALE,
    scale: ["V0", "V1", "V2"],
  };

  it("mesure un nombre, une durée, ou une échelle", () => {
    expect(metricProgressionMeasure(load, [])).toEqual(KG);
    expect(metricProgressionMeasure(effort, [])).toEqual(SECONDS);
    expect(metricProgressionMeasure({ ...grade, unit: MetricUnit.NONE }, [])).toEqual(GRADES);
    expect(metricProgressionMeasure(custom, [houseScale])).toEqual({
      kind: ProgressionMeasureKind.SCALE,
      scale: ["V0", "V1", "V2"],
    });
  });

  it("ne fait pas progresser du texte, ni une colonne maison sans définition", () => {
    const note = {
      id: "n",
      label: null,
      source: MetricSource.CATALOG,
      key: MetricKey.NOTE,
    } as const;

    expect(metricProgressionMeasure({ ...note, unit: MetricUnit.NONE }, [])).toBeNull();
    expect(metricProgressionMeasure(custom, [])).toBeNull();
  });
});

describe("dosageRowReset", () => {
  it("rend les valeurs reçues aux semaines ajustées qu'on peut encore écrire", () => {
    const slots = [
      valued([60]),
      valued([65], { reference: [60] }),
      absent(),
      valued([70], { reference: [60], locked: true }),
      valued([55], { reference: [50], deload: true }),
      // Un ajout : aucune référence où revenir.
      valued([20], { reference: null }),
    ];

    expect(dosageRowReset(slots)).toEqual([
      { index: 1, values: [60] },
      { index: 4, values: [50] },
    ]);
  });
});
