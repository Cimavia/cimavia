import { describe, expect, it } from "vitest";
import { effort, gridOf, load, oneByBeep, reps, settingsOf } from "../../test/block-fixtures";
import type { BlockGrid } from "../dto/block-grid.schema";
import { MetricSource } from "../dto/exercise-block.schema";
import { MetricKey, MetricUnit } from "../dto/exercise-metric.schema";
import { ScheduledSessionStatus } from "../dto/plan.schema";
import {
  type CompositionEdit,
  CompositionEditKind,
  scheduledCompositionInputSchema,
} from "../dto/scheduled-composition.schema";
import {
  BLOCK_MAX_EXERCISES,
  CompositionOrigin,
  type ScheduledBlockExercise,
} from "../dto/session-block.schema";
import type { BlockReference } from "../dto/session-block-dto.schema";
import { SESSION_MAX_EXERCISES } from "../dto/session-limits.schema";
import type { StructureSettings } from "../dto/structure.schema";
import {
  appliedEdit,
  type CompositionLibrary,
  CompositionOutcomeKind,
  CompositionRefusal,
  compositionChangeCount,
  compositionTargets,
  copyChoices,
  editInPlace,
  editOfExercise,
  type PlannedCompositionBlock,
  type PlannedExercise,
  removedReferences,
  resetComposition,
  revertedEdit,
} from "./scheduled-composition.util";

type Origin = ScheduledBlockExercise["origin"];

const RECEIVED: Origin = { kind: CompositionOrigin.RECEIVED };
const ADDED: Origin = { kind: CompositionOrigin.ADDED };
const replacing = (replacesKey: string): Origin => ({
  kind: CompositionOrigin.REPLACEMENT,
  replacesKey,
});

const GRID = gridOf([reps, load], [8, 60], [6, 70]);

const planned = (key: string, origin: Origin = RECEIVED, grid: BlockGrid = GRID) => ({
  key,
  origin,
  note: `note ${key}`,
  grid,
});

/** Le bloc de la séance-type reçu : `a` puis `b`, chacun de son exercice de bibliothèque. */
const reference = (keys: string[] = ["a", "b"]) => ({
  settings: settingsOf(),
  exercises: keys.map((key) => ({ key, exerciseId: `ex_${key}`, note: `note ${key}`, grid: GRID })),
});

const blockOf = (
  exercises: PlannedExercise[],
  baseline: BlockReference = reference(),
  settings: StructureSettings = settingsOf(),
): PlannedCompositionBlock => ({ settings, baseline, exercises });

/** Un exercice de bibliothèque qui suggère l'effort, puis la charge. */
const library: CompositionLibrary = (exerciseId) =>
  exerciseId.startsWith("ex_")
    ? {
        id: exerciseId,
        suggestedMetrics: [
          {
            source: MetricSource.CATALOG,
            key: MetricKey.EFFORT_DURATION,
            unit: MetricUnit.NONE,
          },
          { source: MetricSource.CATALOG, key: MetricKey.LOAD, unit: MetricUnit.KILOGRAMS },
        ],
        customMetrics: [],
      }
    : null;

const ADD: CompositionEdit = {
  kind: CompositionEditKind.ADD,
  blockIndex: 0,
  key: "new",
  exerciseId: "ex_rower",
};
const REPLACE_A: CompositionEdit = {
  kind: CompositionEditKind.REPLACE,
  blockIndex: 0,
  replacesKey: "a",
  key: "new",
  exerciseId: "ex_rower",
};
const REMOVE_A: CompositionEdit = { kind: CompositionEditKind.REMOVE, blockIndex: 0, key: "a" };

/** Les clés du premier bloc, et leur origine, après un changement accepté. */
function exercisesAfter(outcome: ReturnType<typeof appliedEdit>) {
  if (outcome.kind !== CompositionOutcomeKind.CHANGED) throw new Error(outcome.kind);
  return outcome.blocks[0]?.exercises ?? [];
}

const keysAfter = (outcome: ReturnType<typeof appliedEdit>) =>
  exercisesAfter(outcome).map((exercise) => exercise.key);

describe("editInPlace", () => {
  it("lit un ajout ou un remplaçant à sa clé, dans son bloc", () => {
    const blocks = [blockOf([planned("a"), planned("new", ADDED)])];
    expect(editInPlace(blocks, ADD)).toBe(true);
    expect(editInPlace(blocks, { ...ADD, blockIndex: 1 })).toBe(false);
    expect(editInPlace([blockOf([planned("a")])], ADD)).toBe(false);
  });

  it("lit un retrait quand la séance-type a l'exercice et que personne n'occupe sa place", () => {
    expect(editInPlace([blockOf([planned("b")])], REMOVE_A)).toBe(true);
    expect(editInPlace([blockOf([planned("a"), planned("b")])], REMOVE_A)).toBe(false);
    // Remplacé, l'exercice a encore un occupant : ce n'est pas un retrait.
    expect(editInPlace([blockOf([planned("x", replacing("a"))])], REMOVE_A)).toBe(false);
    // Un exercice que la séance-type n'a pas ne se retire pas.
    expect(editInPlace([blockOf([planned("b")], reference(["b"]))], REMOVE_A)).toBe(false);
  });
});

describe("appliedEdit", () => {
  const blocks = [blockOf([planned("a"), planned("b")])];

  it("ajoute en fin de bloc les colonnes suggérées, sans ligne, sous des identifiants partagés", () => {
    const [, , added] = exercisesAfter(appliedEdit(blocks, ADD, library));
    expect(added).toEqual({
      key: "new",
      origin: ADDED,
      note: null,
      grid: {
        metrics: [
          { ...effort, id: "new-0" },
          { ...load, id: "new-1" },
        ],
        rows: [],
      },
      exerciseId: "ex_rower",
    });
  });

  it("remplace à la même place : la charge et ses valeurs restent, la note aussi", () => {
    const [replacement, kept] = exercisesAfter(appliedEdit(blocks, REPLACE_A, library));
    expect(kept?.key).toBe("b");
    expect(replacement).toEqual({
      key: "new",
      origin: replacing("a"),
      note: "note a",
      grid: {
        metrics: [{ ...effort, id: "new-0" }, load],
        rows: [
          { id: "row_0", values: { col_load: 60 } },
          { id: "row_1", values: { col_load: 70 } },
        ],
      },
      exerciseId: "ex_rower",
    });
  });

  it("remplace aussi le remplaçant d'un autre changement, qui occupe la place", () => {
    const outcome = appliedEdit(
      [blockOf([planned("old", replacing("a")), planned("b")])],
      REPLACE_A,
      library,
    );
    expect(keysAfter(outcome)).toEqual(["new", "b"]);
  });

  it("retire l'occupant de la place, reçu ou remplaçant", () => {
    expect(keysAfter(appliedEdit(blocks, REMOVE_A, library))).toEqual(["b"]);
    const replaced = [blockOf([planned("x", replacing("a")), planned("b")])];
    expect(keysAfter(appliedEdit(replaced, REMOVE_A, library))).toEqual(["b"]);
  });

  it("ne change rien là où le changement est déjà en place", () => {
    const done = [blockOf([planned("a"), planned("b"), planned("new", ADDED)])];
    expect(appliedEdit(done, ADD, library).kind).toBe(CompositionOutcomeKind.UNCHANGED);
    const removed = [blockOf([planned("b")])];
    expect(appliedEdit(removed, REMOVE_A, library).kind).toBe(CompositionOutcomeKind.UNCHANGED);
  });

  it.each([
    ["un bloc que la copie n'a pas", blocks, { ...ADD, blockIndex: 3 }, "NO_BLOCK"],
    [
      "un exercice à remplacer que la copie n'a pas",
      [blockOf([planned("b")], reference(["b"]))],
      REPLACE_A,
      "ABSENT",
    ],
    [
      "un exercice à retirer que la séance-type n'a pas",
      [blockOf([planned("b")], reference(["b"]))],
      REMOVE_A,
      "ABSENT",
    ],
    [
      "un exercice déjà remplacé, à remplacer de nouveau ailleurs",
      [blockOf([planned("b")])],
      REPLACE_A,
      "ABSENT",
    ],
    ["le dernier exercice du bloc", [blockOf([planned("a")])], REMOVE_A, "LAST_EXERCISE"],
    ["une clé déjà prise dans la copie", blocks, { ...ADD, key: "b" }, "KEY_TAKEN"],
    [
      "une clé que la séance-type a reçue, même retirée",
      [blockOf([planned("b")])],
      { ...ADD, key: "a" },
      "KEY_TAKEN",
    ],
    ["un exercice hors de la bibliothèque", blocks, { ...ADD, exerciseId: "x" }, "NOT_IN_LIBRARY"],
    ["un exercice sans source", blocks, { ...ADD, exerciseId: null }, "NOT_IN_LIBRARY"],
    [
      "un bloc plein",
      [
        blockOf(
          Array.from({ length: BLOCK_MAX_EXERCISES }, (_unused, index) => planned(`k${index}`)),
        ),
      ],
      ADD,
      "BLOCK_FULL",
    ],
    [
      "« un seul par bip » sans assez de bips",
      [blockOf([planned("a", RECEIVED, gridOf([reps]))], reference(), oneByBeep(60, 1))],
      ADD,
      "ROUNDS",
    ],
    [
      "une grille qui dépasse ses passages une fois l'exercice ajouté",
      [blockOf([planned("a", RECEIVED, gridOf([reps], [1], [2]))], reference(), oneByBeep(60, 2))],
      ADD,
      "ROUNDS",
    ],
  ] as const)("refuse %s", (_case, input, edit, refusal) => {
    expect(appliedEdit(input, edit, library)).toEqual({
      kind: CompositionOutcomeKind.REFUSED,
      refusal,
    });
  });

  it("refuse un exercice de plus dans une séance pleine", () => {
    const keys = (prefix: string, count: number) =>
      Array.from({ length: count }, (_unused, index) => planned(`${prefix}${index}`));
    const full = [blockOf(keys("a", 20)), blockOf(keys("b", 20)), blockOf(keys("c", 10))];
    expect(full.flatMap((block) => block.exercises)).toHaveLength(SESSION_MAX_EXERCISES);
    expect(appliedEdit(full, { ...ADD, blockIndex: 2 }, library)).toEqual({
      kind: CompositionOutcomeKind.REFUSED,
      refusal: CompositionRefusal.SESSION_FULL,
    });
  });
});

describe("revertedEdit", () => {
  it("retire l'ajout", () => {
    const blocks = [blockOf([planned("a"), planned("new", ADDED)])];
    expect(keysAfter(revertedEdit(blocks, ADD, library))).toEqual(["a"]);
  });

  it("rend l'exercice remplacé tel que la séance-type l'a donné, à la place du remplaçant", () => {
    const blocks = [blockOf([planned("new", replacing("a")), planned("b")])];
    const [restored] = exercisesAfter(revertedEdit(blocks, REPLACE_A, library));
    expect(restored).toEqual({
      key: "a",
      origin: RECEIVED,
      note: "note a",
      grid: GRID,
      exerciseId: "ex_a",
    });
  });

  it("rend l'exercice retiré avant le premier venu après lui, sinon avant les ajouts", () => {
    const three = reference(["a", "b", "c"]);
    const withoutB = [blockOf([planned("a"), planned("x", replacing("c"))], three)];
    expect(keysAfter(revertedEdit(withoutB, { ...REMOVE_A, key: "b" }, library))).toEqual([
      "a",
      "b",
      "x",
    ]);
    const withoutC = [blockOf([planned("a"), planned("b"), planned("n", ADDED)], three)];
    expect(keysAfter(revertedEdit(withoutC, { ...REMOVE_A, key: "c" }, library))).toEqual([
      "a",
      "b",
      "c",
      "n",
    ]);
    const onlyA = [blockOf([planned("a")], three)];
    expect(keysAfter(revertedEdit(onlyA, { ...REMOVE_A, key: "c" }, library))).toEqual(["a", "c"]);
  });

  it("ne change rien là où le changement n'est pas", () => {
    const blocks = [blockOf([planned("a"), planned("b")])];
    for (const edit of [ADD, REPLACE_A, REMOVE_A, { ...ADD, blockIndex: 4 }]) {
      expect(revertedEdit(blocks, edit, library).kind).toBe(CompositionOutcomeKind.UNCHANGED);
    }
  });

  it("refuse de rendre un exercice qui n'est plus dans la bibliothèque", () => {
    const gone = {
      settings: settingsOf(),
      exercises: [{ key: "a", exerciseId: null, note: null, grid: GRID }],
    };
    const blocks = [blockOf([planned("b")], gone)];
    expect(revertedEdit(blocks, REMOVE_A, library)).toEqual({
      kind: CompositionOutcomeKind.REFUSED,
      refusal: CompositionRefusal.NOT_IN_LIBRARY,
    });
  });

  it("refuse de rendre un exercice que la séance-type n'a pas", () => {
    // Un remplaçant dont la place a quitté la référence : rien à rendre à sa place.
    const blocks = [blockOf([planned("new", replacing("a")), planned("b")], reference(["b"]))];
    expect(revertedEdit(blocks, REPLACE_A, library)).toEqual({
      kind: CompositionOutcomeKind.REFUSED,
      refusal: CompositionRefusal.ABSENT,
    });
  });

  it("refuse de retirer un ajout resté seul dans son bloc", () => {
    const blocks = [blockOf([planned("new", ADDED)])];
    expect(revertedEdit(blocks, ADD, library)).toEqual({
      kind: CompositionOutcomeKind.REFUSED,
      refusal: CompositionRefusal.LAST_EXERCISE,
    });
  });
});

describe("resetComposition", () => {
  it("rend la composition reçue, en gardant les valeurs des exercices reçus", () => {
    const adjusted = planned("b", RECEIVED, gridOf([reps, load], [10, 80]));
    const blocks = [blockOf([adjusted, planned("x", replacing("a")), planned("n", ADDED)])];
    const reset = exercisesAfter(resetComposition(blocks, library));
    expect(reset.map((exercise) => exercise.key)).toEqual(["a", "b"]);
    expect(reset[0]).toMatchObject({ exerciseId: "ex_a", grid: GRID });
    expect(reset[1]).toBe(adjusted);
  });

  it("ne change rien à une copie qui a la composition reçue", () => {
    const blocks = [blockOf([planned("a"), planned("b")])];
    expect(resetComposition(blocks, library).kind).toBe(CompositionOutcomeKind.UNCHANGED);
  });

  it("refuse quand un exercice à rendre n'est plus dans la bibliothèque", () => {
    const blocks = [blockOf([planned("b")])];
    expect(resetComposition(blocks, () => null)).toEqual({
      kind: CompositionOutcomeKind.REFUSED,
      refusal: CompositionRefusal.NOT_IN_LIBRARY,
    });
  });

  it("refuse quand les tours du bloc ne se répartissent plus sur la composition reçue", () => {
    const blocks = [blockOf([planned("a")], reference(), oneByBeep(60, 1))];
    expect(resetComposition(blocks, library)).toEqual({
      kind: CompositionOutcomeKind.REFUSED,
      refusal: CompositionRefusal.ROUNDS,
    });
  });
});

describe("pour quelles semaines", () => {
  const PLANNED = ScheduledSessionStatus.PLANNED;
  const copies = [
    {
      id: "s1",
      status: PLANNED,
      updatedAt: "2026-10-01T00:00:00.000Z",
      blocks: [blockOf([planned("a")])],
    },
    {
      id: "s2",
      status: PLANNED,
      updatedAt: "2026-10-02T00:00:00.000Z",
      blocks: [blockOf([planned("new", replacing("a"))])],
    },
    { id: "s3", status: PLANNED, updatedAt: "2026-10-03T00:00:00.000Z", blocks: [] },
  ];

  it("dit où le changement est en place, et pourquoi une copie ne le prend pas", () => {
    expect(copyChoices(copies, REPLACE_A, library)).toEqual([
      { id: "s1", inPlace: false, refusal: null },
      { id: "s2", inPlace: true, refusal: null },
      { id: "s3", inPlace: false, refusal: CompositionRefusal.NO_BLOCK },
    ]);
  });

  // Le statut passe avant tout : même une copie qui prendrait le changement se grise.
  it("refuse une copie débriefée, qu'elle ait le changement ou non", () => {
    const debriefed = copies.map((copy) => ({ ...copy, status: ScheduledSessionStatus.DONE }));
    expect(copyChoices(debriefed, REPLACE_A, library).map((choice) => choice.refusal)).toEqual([
      CompositionRefusal.DEBRIEFED,
      CompositionRefusal.DEBRIEFED,
      CompositionRefusal.DEBRIEFED,
    ]);
    expect(copyChoices(debriefed, REPLACE_A, library)[1]?.inPlace).toBe(true);
  });

  it("applique aux cochées sans le changement, défait aux décochées qui l'ont", () => {
    const choices = copyChoices(copies, REPLACE_A, library);
    expect(compositionTargets(copies, choices, new Set(["s1", "s3"]))).toEqual({
      apply: [{ id: "s1", expectedUpdatedAt: "2026-10-01T00:00:00.000Z" }],
      revert: [{ id: "s2", expectedUpdatedAt: "2026-10-02T00:00:00.000Z" }],
    });
    expect(compositionTargets(copies, [], new Set(["s1"]))).toEqual({ apply: [], revert: [] });
  });
});

describe("compter les changements", () => {
  it("compte les ajouts, les remplaçants et les retraits, rien pour une copie reçue", () => {
    expect(compositionChangeCount([blockOf([planned("a"), planned("b")])])).toBe(0);
    const changed = blockOf([planned("r", replacing("a")), planned("x", ADDED)]);
    expect(removedReferences(changed).map((reference) => reference.key)).toEqual(["b"]);
    expect(compositionChangeCount([changed, blockOf([planned("a")])])).toBe(4);
  });
});

describe("editOfExercise", () => {
  it("rend le changement d'un ajout ou d'un remplaçant, aucun pour un exercice reçu", () => {
    expect(editOfExercise(0, planned("a"), "ex_a")).toBeNull();
    expect(editOfExercise(0, planned("new", ADDED), "ex_rower")).toEqual(ADD);
    expect(editOfExercise(0, planned("new", replacing("a")), null)).toEqual({
      ...REPLACE_A,
      exerciseId: null,
    });
  });
});

describe("scheduledCompositionInputSchema", () => {
  const version = { id: "s1", expectedUpdatedAt: "2026-10-01T00:00:00.000Z" };

  it("accepte un changement à appliquer, ou à défaire sans source", () => {
    expect(
      scheduledCompositionInputSchema.safeParse({ edit: ADD, apply: [version], revert: [] }),
    ).toMatchObject({ success: true });
    const sourceless = { ...ADD, exerciseId: null };
    expect(
      scheduledCompositionInputSchema.safeParse({ edit: sourceless, apply: [], revert: [version] }),
    ).toMatchObject({ success: true });
  });

  it.each([
    ["aucune séance", { edit: ADD, apply: [], revert: [] }],
    ["une séance citée deux fois", { edit: ADD, apply: [version], revert: [version] }],
    [
      "un exercice sans source à appliquer",
      { edit: { ...ADD, exerciseId: null }, apply: [version], revert: [] },
    ],
    [
      "un remplaçant sous la clé qu'il remplace",
      { edit: { ...REPLACE_A, key: "a" }, apply: [version], revert: [] },
    ],
  ])("refuse %s", (_case, input) => {
    expect(scheduledCompositionInputSchema.safeParse(input).success).toBe(false);
  });
});
