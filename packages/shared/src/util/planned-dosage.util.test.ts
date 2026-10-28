import { describe, expect, it } from "vitest";
import {
  asMuchAsPossible,
  gridOf,
  load,
  oneByBeep,
  reps,
  rounds,
  settingsOf,
} from "../../test/block-fixtures";
import type { BlockGrid } from "../dto/block-grid.schema";
import { PlanWeekType, ScheduledSessionStatus } from "../dto/plan.schema";
import { CompositionOrigin, type ScheduledBlockExercise } from "../dto/session-block.schema";
import type { StructureSettings } from "../dto/structure.schema";
import { StructureAdvance, StructureOrder, StructureRepeat } from "../dto/structure-answer.schema";
import {
  type DosageBlock,
  DosageCellKind,
  DosageColumnKind,
  type DosageCopy,
  DosageOff,
  dosageAdjustedCount,
  dosageColumns,
  dosageGroups,
  dosageInput,
  dosageMetricCell,
  dosageRoundsIssues,
  dosageSessionTypes,
  dosageSettingCell,
  revertedDosage,
  shownSeries,
  withDosageCell,
  withDosageSetting,
} from "./planned-dosage.util";
import { SettingValue } from "./structure-settings.util";

type Origin = ScheduledBlockExercise["origin"];

const RECEIVED: Origin = { kind: CompositionOrigin.RECEIVED };
const ADDED: Origin = { kind: CompositionOrigin.ADDED };
const replacing = (replacesKey: string): Origin => ({
  kind: CompositionOrigin.REPLACEMENT,
  replacesKey,
});

/** Des Séries de 4 tours, 2 min de repos entre les tours. */
const SERIES = settingsOf({ restBetweenRoundsSeconds: 120 });

/** Répétitions et charge ; une seule ligne par défaut, qui vaut pour les 4 tours. */
const grid = (...rows: (number | null)[][]): BlockGrid =>
  gridOf([reps, load], ...(rows.length > 0 ? rows : [[6, 60]]));

const planned = (key: string, origin: Origin = RECEIVED, exerciseGrid = grid()) => ({
  id: `row-${key}`,
  key,
  origin,
  grid: exerciseGrid,
});
const reference = (key: string, exerciseGrid = grid()) => ({
  key,
  exerciseId: `lib-${key}`,
  note: null,
  grid: exerciseGrid,
});

function blockOf(
  exercises: DosageBlock["exercises"],
  baseline: DosageBlock["baseline"]["exercises"] = exercises.map((each) =>
    reference(each.key, each.grid),
  ),
  settings: StructureSettings = SERIES,
  baselineSettings: StructureSettings = settings,
): DosageBlock {
  return {
    id: `block-${exercises.map((each) => each.key).join("")}`,
    settings,
    baseline: { settings: baselineSettings, exercises: baseline },
    exercises,
  };
}

const copyOf = (
  id: string,
  blocks: DosageBlock[],
  overrides: Partial<DosageCopy> = {},
): DosageCopy => ({
  id,
  planWeekId: "w1",
  scheduledDate: "2026-11-02",
  status: ScheduledSessionStatus.PLANNED,
  updatedAt: `2026-10-01T00:00:00.000Z`,
  blocks,
  ...overrides,
});

const week = (n: number, type: PlanWeekType = PlanWeekType.TRAINING) => ({
  id: `w${n}`,
  weekNumber: n,
  type,
});

describe("dosageSessionTypes", () => {
  const summary = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    sourceSessionId: "tpl-force",
    title: "Force",
    scheduledDate: "2026-11-02",
    position: 0,
    blockCount: 2,
    ...over,
  });
  const weekOf = (weekNumber: number, sessions: ReturnType<typeof summary>[]) =>
    ({ weekNumber, sessions }) as never;

  it("donne chaque séance-type une fois, lue depuis sa première copie du calendrier", () => {
    const types = dosageSessionTypes([
      weekOf(2, [summary("s2-force", { scheduledDate: "2026-11-09" })]),
      weekOf(1, [
        summary("s1-mob", {
          sourceSessionId: "tpl-mob",
          title: "Mobilité",
          scheduledDate: "2026-11-05",
        }),
        summary("s1-force-bis", { position: 1 }),
        summary("s1-force"),
      ]),
    ]);

    expect(types).toEqual([
      { key: "tpl-force", anchorId: "s1-force", title: "Force", sourceSessionId: "tpl-force" },
      { key: "tpl-mob", anchorId: "s1-mob", title: "Mobilité", sourceSessionId: "tpl-mob" },
    ]);
  });

  it("laisse les séances sans bloc à leur panneau, et range une séance sans modèle à part", () => {
    const types = dosageSessionTypes([
      weekOf(1, [
        summary("old", { blockCount: 0 }),
        summary("lone", { sourceSessionId: null, title: "Libre" }),
      ]),
    ]);

    expect(types).toEqual([
      { key: "lone", anchorId: "lone", title: "Libre", sourceSessionId: null },
    ]);
  });
});

describe("dosageColumns", () => {
  it("donne une colonne par copie, et garde hachurée une semaine sans la séance", () => {
    const columns = dosageColumns(
      [week(3), week(1), week(2, PlanWeekType.DELOAD)],
      [copyOf("s1", [], { planWeekId: "w1" }), copyOf("s3", [], { planWeekId: "w3" })],
    );
    expect(columns).toEqual([
      {
        kind: DosageColumnKind.COPY,
        copyId: "s1",
        weekNumber: 1,
        deload: false,
        date: "2026-11-02",
        showDay: false,
        locked: false,
      },
      { kind: DosageColumnKind.ABSENT, weekNumber: 2, deload: true },
      expect.objectContaining({ copyId: "s3", weekNumber: 3 }),
    ]);
  });

  it("nomme par leur jour deux séances posées la même semaine, dans l'ordre reçu", () => {
    const columns = dosageColumns(
      [week(2, PlanWeekType.DELOAD)],
      [
        copyOf("mon", [], { planWeekId: "w2", scheduledDate: "2026-11-09" }),
        copyOf("thu", [], { planWeekId: "w2", scheduledDate: "2026-11-12" }),
      ],
    );
    expect(columns).toEqual([
      expect.objectContaining({ copyId: "mon", showDay: true, deload: true }),
      expect.objectContaining({ copyId: "thu", showDay: true, deload: true }),
    ]);
  });

  it("verrouille une copie débriefée, et elle seule", () => {
    const columns = dosageColumns(
      [week(1)],
      [copyOf("done", [], { status: ScheduledSessionStatus.DONE }), copyOf("open", [])],
    );
    expect(columns.map((column) => "locked" in column && column.locked)).toEqual([true, false]);
  });
});

describe("dosageGroups", () => {
  it("range la séance-type dans son ordre, puis ajouts et remplaçants en fin de bloc", () => {
    const base = [reference("a"), reference("b"), reference("c")];
    const groups = dosageGroups([
      copyOf("s1", [blockOf([planned("x", ADDED), planned("b"), planned("c")], base)]),
      copyOf("s2", [blockOf([planned("a"), planned("y", replacing("b")), planned("c")], base)]),
    ]);
    expect(groups[0]?.exercises.map((line) => [line.key, line.origin.kind, line.rowId])).toEqual([
      ["a", CompositionOrigin.RECEIVED, "row-a"],
      ["b", CompositionOrigin.RECEIVED, "row-b"],
      ["c", CompositionOrigin.RECEIVED, "row-c"],
      ["x", CompositionOrigin.ADDED, "row-x"],
      ["y", CompositionOrigin.REPLACEMENT, "row-y"],
    ]);
  });

  it("réunit les exercices reçus sur toutes les copies, dans l'ordre de la séance-type", () => {
    // S1 a reçu une séance-type plus courte : ce qu'elle n'a pas eu ne lui retire pas son code.
    const groups = dosageGroups([
      copyOf("s1", [blockOf([planned("a")], [reference("a")])]),
      copyOf("s2", [blockOf([planned("a"), planned("b")], [reference("a"), reference("b")])]),
    ]);
    expect(groups[0]?.received).toEqual(["a", "b"]);
    expect(groups[0]?.reference.exercises.map(({ key }) => key)).toEqual(["a", "b"]);
  });

  it("n'a pas de ligne pour un exercice que toutes les copies ont retiré", () => {
    const base = [reference("a"), reference("b")];
    const groups = dosageGroups([copyOf("s1", [blockOf([planned("a")], base)])]);
    expect(groups[0]?.exercises.map((line) => line.key)).toEqual(["a"]);
  });

  it("lit la colonne des métriques sur la première copie qui porte l'exercice", () => {
    const [group] = dosageGroups([copyOf("s1", [blockOf([planned("a")])])]);
    expect(group?.exercises[0]?.metrics).toEqual([reps, load]);
  });

  it("réunit les colonnes d'un exercice sur toutes les copies qui le portent", () => {
    const older = planned("a", RECEIVED, gridOf([reps], [6]));
    const [group] = dosageGroups([
      copyOf("s1", [blockOf([older])]),
      copyOf("s2", [blockOf([planned("a")])]),
    ]);
    expect(group?.exercises[0]?.metrics).toEqual([reps, load]);
  });

  it("montre les valeurs que le bloc porte, dans l'ordre de Dosage", () => {
    const settings = settingsOf({ limitSeconds: 900, restBetweenExercisesSeconds: 30 });
    const [group] = dosageGroups([copyOf("s1", [blockOf([planned("a")], undefined, settings)])]);
    expect(group?.settings).toEqual([
      SettingValue.ROUNDS,
      SettingValue.REST_BETWEEN_EXERCISES,
      SettingValue.LIMIT,
    ]);
  });

  it("saute un bloc sans valeur ni métrique, comme un échauffement libre", () => {
    const warmUp = blockOf(
      [planned("w", RECEIVED, gridOf([]))],
      undefined,
      settingsOf({ repeat: { kind: "ONCE" } }),
    );
    const groups = dosageGroups([copyOf("s1", [warmUp, blockOf([planned("a")])])]);
    expect(groups.map((group) => group.blockIndex)).toEqual([1]);
  });

  it("garde un bloc qui n'a que des valeurs de bloc", () => {
    const noMetric = blockOf([planned("w", RECEIVED, gridOf([]))]);
    expect(dosageGroups([copyOf("s1", [noMetric])])).toHaveLength(1);
  });

  it("garde le rang d'un bloc que seule une copie porte", () => {
    const groups = dosageGroups([
      copyOf("s1", [blockOf([planned("a")])]),
      copyOf("s2", [blockOf([planned("a")]), blockOf([planned("b")])]),
    ]);
    expect(groups.map((group) => [group.blockIndex, group.block.id])).toEqual([
      [0, "block-a"],
      [1, "block-b"],
    ]);
  });

  it("n'a aucun groupe sans copie", () => {
    expect(dosageGroups([])).toEqual([]);
  });
});

describe("dosageSettingCell", () => {
  const copy = copyOf("s1", [
    blockOf([planned("a")], undefined, settingsOf({ repeat: rounds(5) }), SERIES),
  ]);

  it("compare une valeur du bloc à celle reçue", () => {
    expect(dosageSettingCell(copy, 0, SettingValue.ROUNDS)).toEqual({
      kind: DosageCellKind.VALUE,
      values: [5],
      reference: [4],
      adjusted: true,
    });
  });

  it("ne marque pas une valeur restée celle de la séance-type", () => {
    const same = copyOf("s1", [blockOf([planned("a")])]);
    expect(dosageSettingCell(same, 0, SettingValue.REST_BETWEEN_ROUNDS)).toMatchObject({
      values: [120],
      adjusted: false,
    });
  });

  it("n'a rien à régler pour une valeur que le bloc ne porte pas, ou un bloc absent", () => {
    const none = { kind: DosageCellKind.OFF, reason: DosageOff.NONE };
    expect(dosageSettingCell(copy, 0, SettingValue.CAP)).toEqual(none);
    expect(dosageSettingCell(copy, 3, SettingValue.ROUNDS)).toEqual(none);
  });

  it("hachure la semaine où la séance n'est pas posée", () => {
    expect(dosageSettingCell(null, 0, SettingValue.ROUNDS)).toEqual({
      kind: DosageCellKind.ABSENT,
    });
  });
});

describe("dosageMetricCell", () => {
  it("lit une série par tour, la dernière ligne valant pour les suivants", () => {
    const copy = copyOf("s1", [blockOf([planned("a", RECEIVED, grid([6, 60], [6, 65]))])]);
    expect(dosageMetricCell(copy, 0, "a", load.id)).toEqual({
      kind: DosageCellKind.VALUE,
      values: [60, 65, 65, 65],
      reference: [60, 65, 65, 65],
      adjusted: false,
    });
  });

  it("marque une série qui diffère de la séance-type reçue cette semaine-là", () => {
    const copy = copyOf("s1", [
      blockOf([planned("a", RECEIVED, grid([6, 60], [6, 62.5]))], [reference("a")]),
    ]);
    expect(dosageMetricCell(copy, 0, "a", load.id)).toMatchObject({
      values: [60, 62.5, 62.5, 62.5],
      reference: [60, 60, 60, 60],
      adjusted: true,
    });
  });

  it("lit autant de séries que de tours, un tour de plus reprenant la dernière ligne", () => {
    const copy = copyOf("s1", [
      blockOf([planned("a")], undefined, settingsOf({ repeat: rounds(5) }), SERIES),
    ]);
    expect(dosageMetricCell(copy, 0, "a", load.id)).toMatchObject({
      values: [60, 60, 60, 60, 60],
      adjusted: false,
    });
  });

  it("n'a qu'une valeur pour un bloc sans tours, comme un AMRAP", () => {
    const amrap = settingsOf({ repeat: asMuchAsPossible(600) });
    const copy = copyOf("s1", [blockOf([planned("a")], undefined, amrap)]);
    expect(dosageMetricCell(copy, 0, "a", reps.id)).toMatchObject({ values: [6] });
  });

  it("n'a qu'une valeur pour un bloc à régler, qui manque de bips", () => {
    const copy = copyOf("s1", [blockOf([planned("a"), planned("b")], undefined, oneByBeep(60, 1))]);
    expect(dosageMetricCell(copy, 0, "b", reps.id)).toMatchObject({ values: [6] });
  });

  it("ne marque jamais un ajout ni un remplaçant, qui n'ont rien à quoi revenir", () => {
    const copy = copyOf("s1", [
      blockOf(
        [planned("y", replacing("a"), grid([10, 20])), planned("x", ADDED)],
        [reference("a")],
      ),
    ]);
    expect(dosageMetricCell(copy, 0, "y", load.id)).toMatchObject({
      reference: null,
      adjusted: false,
    });
    expect(dosageMetricCell(copy, 0, "x", load.id)).toMatchObject({ reference: null });
  });

  it("dit pourquoi un exercice manque cette semaine", () => {
    const copy = copyOf("s1", [
      blockOf([planned("y", replacing("a"))], [reference("a"), reference("b")]),
    ]);
    const offFor = (key: string) => dosageMetricCell(copy, 0, key, load.id);
    expect(offFor("a")).toEqual({ kind: DosageCellKind.OFF, reason: DosageOff.REPLACED });
    expect(offFor("b")).toEqual({ kind: DosageCellKind.OFF, reason: DosageOff.REMOVED });
    expect(offFor("x")).toEqual({ kind: DosageCellKind.OFF, reason: DosageOff.NOT_THIS_WEEK });
  });

  it("n'a rien à régler pour une colonne que l'exercice n'a pas, ou un bloc absent", () => {
    const copy = copyOf("s1", [blockOf([planned("a")])]);
    const none = { kind: DosageCellKind.OFF, reason: DosageOff.NONE };
    expect(dosageMetricCell(copy, 0, "a", "col_other")).toEqual(none);
    expect(dosageMetricCell(copy, 2, "a", load.id)).toEqual(none);
  });

  it("hachure la semaine où la séance n'est pas posée", () => {
    expect(dosageMetricCell(null, 0, "a", load.id)).toEqual({ kind: DosageCellKind.ABSENT });
  });
});

describe("dosageRoundsIssues", () => {
  it("désigne le bloc dont les bips ne suffisent plus à ses exercices", () => {
    const emom = settingsOf({
      advance: { kind: StructureAdvance.BEEP, everySeconds: 60 },
      repeat: { kind: StructureRepeat.ROUNDS, rounds: 1 },
      order: StructureOrder.ONE,
    });
    const copy = copyOf("c", [
      blockOf([planned("a")]),
      blockOf([planned("b"), planned("c")], undefined, emom),
    ]);

    expect(dosageRoundsIssues(copy)).toEqual([
      { blockIndex: 1, phrase: { key: "block.settings.tooFewBeeps", params: { count: 2 } } },
    ]);
    expect(dosageRoundsIssues(copyOf("ok", [blockOf([planned("a")])]))).toEqual([]);
  });
});

describe("shownSeries", () => {
  it("ne montre qu'une valeur quand toutes les séries la portent", () => {
    expect(shownSeries([60, 60, 60])).toEqual([60]);
  });

  it("montre chaque série dans l'ordre sinon", () => {
    expect(shownSeries([60, 60, 62.5])).toEqual([60, 60, 62.5]);
  });
});

describe("dosageAdjustedCount", () => {
  it("compte les valeurs du bloc et chaque série ajustée", () => {
    const copy = copyOf("s1", [
      blockOf(
        [planned("a", RECEIVED, grid([6, 60], [6, 60], [6, 60], [6, 65]))],
        [reference("a")],
        settingsOf({ repeat: rounds(4), restBetweenRoundsSeconds: 90 }),
        SERIES,
      ),
    ]);
    expect(dosageAdjustedCount(copy)).toBe(2);
  });

  it("ne compte rien sur la séance-type reçue telle quelle", () => {
    expect(dosageAdjustedCount(copyOf("s1", [blockOf([planned("a")])]))).toBe(0);
  });
});

describe("withDosageSetting", () => {
  const blocks = [blockOf([planned("a")]), blockOf([planned("b")])];

  it("change la valeur du seul bloc visé", () => {
    const next = withDosageSetting(blocks, 1, SettingValue.ROUNDS, 6);
    expect(next[1]?.settings.repeat).toEqual(rounds(6));
    expect(next[0]).toBe(blocks[0]);
  });

  it("ignore une valeur que le bloc ne porte pas", () => {
    const next = withDosageSetting(blocks, 0, SettingValue.CAP, 600);
    expect(next[0]?.settings).toEqual(SERIES);
  });
});

describe("withDosageCell", () => {
  const newId = (index: number) => `new_${index}`;
  const blocks = [blockOf([planned("a"), planned("b")]), blockOf([planned("c")])];
  const gridOfKey = (next: DosageBlock[], blockIndex: number, key: string) =>
    next[blockIndex]?.exercises.find((exercise) => exercise.key === key)?.grid;

  it("change une seule série en créant juste les lignes qu'il faut, qui reprennent la précédente", () => {
    const next = withDosageCell(blocks, 0, "a", load.id, [60, 62.5, 62.5, 62.5], newId);
    expect(gridOfKey(next, 0, "a")?.rows).toEqual([
      { id: "row_0", values: { [reps.id]: 6, [load.id]: 60 } },
      { id: "new_1", values: { [reps.id]: 6, [load.id]: 62.5 } },
    ]);
  });

  it("change toutes les séries d'un coup sans allonger la grille", () => {
    const next = withDosageCell(blocks, 0, "a", load.id, [65, 65, 65, 65], newId);
    expect(gridOfKey(next, 0, "a")?.rows).toEqual([
      { id: "row_0", values: { [reps.id]: 6, [load.id]: 65 } },
    ]);
  });

  it("garde les lignes déjà là, même au-delà de ce qu'il faut", () => {
    const long = [blockOf([planned("a", RECEIVED, grid([6, 60], [6, 60], [8, 60]))])];
    const next = withDosageCell(long, 0, "a", load.id, [70, 70, 70, 70], newId);
    expect(gridOfKey(next, 0, "a")?.rows.map((row) => row.values)).toEqual([
      { [reps.id]: 6, [load.id]: 70 },
      { [reps.id]: 6, [load.id]: 70 },
      { [reps.id]: 8, [load.id]: 70 },
    ]);
  });

  it("ne touche pas aux lignes que les tours ne jouent plus", () => {
    const long = [blockOf([planned("a", RECEIVED, grid([6, 60], [6, 61], [6, 62]))])];
    const next = withDosageCell(long, 0, "a", load.id, [70, 70], newId);
    expect(gridOfKey(next, 0, "a")?.rows.map((row) => row.values[load.id])).toEqual([70, 70, 62]);
  });

  it("retire la clé d'une cellule vidée", () => {
    const next = withDosageCell(blocks, 0, "a", load.id, [null], newId);
    expect(gridOfKey(next, 0, "a")?.rows).toEqual([{ id: "row_0", values: { [reps.id]: 6 } }]);
  });

  it("laisse intacts les autres exercices et les autres blocs", () => {
    const next = withDosageCell(blocks, 0, "a", load.id, [70], newId);
    expect(next[0]?.exercises[1]).toBe(blocks[0]?.exercises[1]);
    expect(next[1]).toBe(blocks[1]);
  });
});

describe("revertedDosage", () => {
  it("rend les valeurs reçues, et laisse un ajout tel quel", () => {
    const added = planned("x", ADDED, grid([10, 20]));
    const [block] = revertedDosage([
      blockOf(
        [planned("a", RECEIVED, grid([8, 80])), added],
        [reference("a")],
        settingsOf({ repeat: rounds(6) }),
        SERIES,
      ),
    ]);
    expect(block?.settings).toEqual(SERIES);
    expect(block?.exercises[0]?.grid).toEqual(grid());
    expect(block?.exercises[1]).toBe(added);
  });

  it("garde un exercice reçu que la référence n'a plus", () => {
    const orphan = planned("a", RECEIVED, grid([8, 80]));
    const [block] = revertedDosage([blockOf([orphan], [])]);
    expect(block?.exercises[0]).toBe(orphan);
  });
});

describe("dosageInput", () => {
  const saved = [copyOf("s1", [blockOf([planned("a")])]), copyOf("s2", [blockOf([planned("a")])])];

  it("n'envoie que les copies changées, sous la version lue", () => {
    const drafts = saved.map((copy) =>
      copy.id === "s2"
        ? {
            ...copy,
            updatedAt: "2099-01-01T00:00:00.000Z",
            blocks: withDosageSetting(copy.blocks, 0, SettingValue.ROUNDS, 5),
          }
        : copy,
    );
    expect(dosageInput(drafts, saved)).toEqual([
      {
        id: "s2",
        expectedUpdatedAt: "2026-10-01T00:00:00.000Z",
        blocks: [
          {
            id: "block-a",
            settings: settingsOf({ repeat: rounds(5), restBetweenRoundsSeconds: 120 }),
            exercises: [{ key: "a", grid: grid() }],
          },
        ],
      },
    ]);
  });

  it("taille chaque grille à ses tours", () => {
    const long = copyOf("s1", [
      blockOf([planned("a", RECEIVED, grid([6, 60], [6, 61], [6, 62], [6, 63]))]),
    ]);
    const draft = { ...long, blocks: withDosageSetting(long.blocks, 0, SettingValue.ROUNDS, 2) };
    expect(dosageInput([draft], [long])[0]?.blocks[0]?.exercises[0]?.grid.rows).toHaveLength(2);
  });

  it("laisse entière la grille d'un bloc à régler, que le serveur refusera", () => {
    const base = copyOf("s1", [
      blockOf(
        [planned("a", RECEIVED, grid([6, 60], [6, 61])), planned("b")],
        undefined,
        oneByBeep(60, 4),
      ),
    ]);
    const draft = { ...base, blocks: withDosageSetting(base.blocks, 0, SettingValue.ROUNDS, 1) };
    expect(dosageInput([draft], [base])[0]?.blocks[0]?.exercises[0]?.grid.rows).toHaveLength(2);
  });

  it("n'envoie pas une valeur changée puis remise, même si la grille a gagné des lignes", () => {
    const [copy] = saved;
    if (copy === undefined) throw new Error("copie attendue");
    const newId = (index: number) => `new_${index}`;
    const changed = withDosageCell(copy.blocks, 0, "a", load.id, [60, 65, 65, 65], newId);
    const back = withDosageCell(changed, 0, "a", load.id, [60, 60, 60, 60], newId);
    expect(back[0]?.exercises[0]?.grid.rows).toHaveLength(2);
    expect(dosageInput([{ ...copy, blocks: back }], saved)).toEqual([]);
  });

  it("ignore une copie que la page n'a pas lue", () => {
    const stray = copyOf("other", [blockOf([planned("b")])]);
    expect(dosageInput([stray], saved)).toEqual([]);
  });
});
