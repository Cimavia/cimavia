import { describe, expect, it } from "vitest";
import {
  beep,
  gridOf,
  load,
  oneByBeep,
  presets,
  reps,
  rounds,
  settingsOf,
} from "../../test/block-fixtures";
import {
  BlockSlotKind,
  blockExerciseFrom,
  blockFrom,
  blockGridSlots,
  blockRowLimits,
  blockStructureInput,
  blocksFromDto,
  ColumnFillMode,
  compositionIssues,
  creationPlaceOf,
  detachedExercise,
  duplicatedBlock,
  duplicatedExercise,
  exerciseKeyAt,
  filledGridRows,
  fittedBlock,
  MetricKey,
  MetricSource,
  MetricUnit,
  movedExercise,
  movedItem,
  presetSource,
  replacedExercise,
  revertedBlock,
  rowsBeyond,
  type SessionBlock,
  type SessionBlockExercise,
  StructurePresetKey,
  sessionBlocksSchema,
  structureSource,
  withAddedExercise,
  withExerciseChange,
  withGridMetrics,
  withoutExercise,
  withStructure,
} from "../index";

const series = presetSource(StructurePresetKey.SERIES, "Séries");

function exerciseOf(key: string, grid = gridOf([reps], [8])): SessionBlockExercise {
  return { key, exerciseId: `exercise_${key}`, note: null, grid };
}

function blockOf(id: string, ...keys: string[]): SessionBlock {
  return { ...blockFrom(series, id), exercises: keys.map((key) => exerciseOf(key)) };
}

const keysOf = (blocks: readonly SessionBlock[]) =>
  blocks.map((block) => `${block.id}:${block.exercises.map((exercise) => exercise.key).join(",")}`);

const counter = (prefix: string) => {
  let next = 0;
  return () => `${prefix}${next++}`;
};

describe("la structure d'un bloc", () => {
  it("un bloc neuf copie la structure prête, sans libellé ni exercice", () => {
    expect(blockFrom(series, "b1")).toEqual({
      id: "b1",
      label: null,
      name: "Séries",
      instructions: null,
      settings: presets.SERIES,
      copiedSettings: presets.SERIES,
      sourceStructureId: null,
      sourcePreset: StructurePresetKey.SERIES,
      exercises: [],
    });
  });

  it("une structure du Coach donne son nom, sa consigne et son origine", () => {
    const source = structureSource({
      id: "s1",
      name: "Pyramide",
      instructions: "Monte doucement",
      settings: settingsOf({ repeat: rounds(5) }),
    });
    expect(blockFrom(source, "b1")).toMatchObject({
      name: "Pyramide",
      instructions: "Monte doucement",
      sourceStructureId: "s1",
      sourcePreset: null,
      copiedSettings: settingsOf({ repeat: rounds(5) }),
    });
  });

  it("changer de structure garde le libellé, les exercices et la consigne écrite", () => {
    const block = { ...blockOf("b1", "k1"), label: "Force", instructions: "Gainé" };
    const changed = withStructure(block, presetSource(StructurePresetKey.EMOM, "EMOM"));
    expect(changed).toMatchObject({
      label: "Force",
      name: "EMOM",
      instructions: "Gainé",
      settings: presets.EMOM,
      copiedSettings: presets.EMOM,
      sourcePreset: StructurePresetKey.EMOM,
      sourceStructureId: null,
    });
    expect(changed.exercises).toBe(block.exercises);
  });

  it("sans consigne écrite, le bloc prend celle de la nouvelle structure", () => {
    const source = structureSource({
      id: "s1",
      name: "Tempo",
      instructions: "3 s en descente",
      settings: presets.SERIES,
    });
    expect(withStructure(blockOf("b1", "k1"), source).instructions).toBe("3 s en descente");
  });

  it("la consigne tenue de la structure quittée part avec elle, une consigne retouchée reste", () => {
    const explosive = structureSource({
      id: "s2",
      name: "Explosif",
      instructions: "Pousse vite",
      settings: presets.SERIES,
    });
    const block = { ...blockOf("b1", "k1"), instructions: "3 s en descente" };

    expect(withStructure(block, explosive, "3 s en descente").instructions).toBe("Pousse vite");
    expect(withStructure(block, explosive, "2 s en descente").instructions).toBe("3 s en descente");
  });

  it("« Revenir à » remet les réglages copiés", () => {
    const block = { ...blockOf("b1", "k1"), settings: settingsOf({ advance: beep(60) }) };
    expect(revertedBlock(block).settings).toEqual(presets.SERIES);
  });

  it("« Enregistrer comme structure » reprend réglages et consigne, sans tags ni note", () => {
    const block = { ...blockOf("b1", "k1"), instructions: "Gainé", settings: presets.TABATA };
    expect(blockStructureInput(block, "Mon tabata")).toEqual({
      name: "Mon tabata",
      tags: [],
      note: null,
      instructions: "Gainé",
      settings: presets.TABATA,
    });
  });
});

describe("les exercices d'un bloc", () => {
  it("un exercice ajouté prend ses métriques suggérées, sans ligne", () => {
    const exercise = blockExerciseFrom(
      {
        id: "e1",
        suggestedMetrics: [
          { source: MetricSource.CATALOG, key: MetricKey.REPETITIONS, unit: MetricUnit.REPS },
        ],
        customMetrics: [],
      },
      "k1",
      (index) => `col_${index}`,
    );
    expect(exercise).toEqual({
      key: "k1",
      exerciseId: "e1",
      note: null,
      grid: {
        metrics: [
          {
            id: "col_0",
            label: null,
            source: MetricSource.CATALOG,
            key: MetricKey.REPETITIONS,
            unit: MetricUnit.REPS,
          },
        ],
        rows: [],
      },
    });
  });

  // Une métrique maison supprimée reste suggérée (EX-2) : sa colonne serait refusée à l'enregistrement.
  it("un exercice ajouté laisse de côté une métrique maison qui n'existe plus", () => {
    const exercise = blockExerciseFrom(
      {
        id: "e1",
        suggestedMetrics: [
          { source: MetricSource.CUSTOM, customMetricId: "gone" },
          { source: MetricSource.CUSTOM, customMetricId: "kept" },
        ],
        customMetrics: [{ id: "kept" }],
      },
      "k1",
      (index) => `col_${index}`,
    );
    expect(exercise.grid.metrics).toEqual([
      { id: "col_0", label: null, source: MetricSource.CUSTOM, customMetricId: "kept" },
    ]);
  });

  // L'enregistrement qui précède la création laisse les blocs vides de côté : l'API les refuse.
  it("place l'exercice créé parmi les blocs enregistrés, un bloc vide revenant par sa structure", () => {
    const empty = { ...blockOf("b2"), sourcePreset: null, sourceStructureId: "st-1" };
    const blocks = [blockOf("b0"), blockOf("b1", "k1"), empty, blockOf("b3", "k3")];
    expect(creationPlaceOf(blocks, 3)).toEqual({ rank: 1, source: null });
    expect(creationPlaceOf(blocks, 2)).toEqual({ rank: 1, source: "st-1" });
    expect(creationPlaceOf(blocks, 0)).toEqual({ rank: 0, source: StructurePresetKey.SERIES });
    expect(creationPlaceOf(blocks, 4)).toBeNull();
    const orphan = [{ ...blockOf("b9"), sourcePreset: null }];
    expect(creationPlaceOf(orphan, 0)).toEqual({ rank: 0, source: StructurePresetKey.SERIES });
  });

  it("retrouve l'exercice qu'un refus de l'API désigne, et seulement lui", () => {
    const blocks = [blockOf("b1", "k1"), blockOf("b2", "k2", "k3")];
    expect(exerciseKeyAt(blocks, "#/blocks/1/exercises/1/grid")).toBe("k3");
    expect(exerciseKeyAt(blocks, "#/blocks/0/exercises/0")).toBe("k1");
    expect(exerciseKeyAt(blocks, "#/blocks/0/exercises/10")).toBeNull();
    expect(exerciseKeyAt(blocks, "#/blocks/0/name")).toBeNull();
    expect(exerciseKeyAt(blocks, "#/blocks/0/exercises/01x")).toBeNull();
  });

  it("les blocs de l'API perdent l'identifiant de ligne de leurs exercices", () => {
    const dto = { ...blockOf("b1"), exercises: [{ ...exerciseOf("k1"), id: "line_1" }] };
    expect(blocksFromDto([dto])).toEqual([blockOf("b1", "k1")]);
  });

  it("ajouter, retirer et changer un exercice ne touche que lui", () => {
    const blocks = [blockOf("b1", "k1"), blockOf("b2", "k2")];
    expect(keysOf(withAddedExercise(blocks, "b2", exerciseOf("k3")))).toEqual([
      "b1:k1",
      "b2:k2,k3",
    ]);
    // Retirer le dernier exercice laisse le bloc vide, à compléter.
    expect(keysOf(withoutExercise(blocks, "k1"))).toEqual(["b1:", "b2:k2"]);
    const noted = withExerciseChange(blocks, "k2", (exercise) => ({ ...exercise, note: "Lent" }));
    expect(noted[1]?.exercises[0]?.note).toBe("Lent");
    expect(noted[0]).toEqual(blocks[0]);
  });

  it("déplacer un exercice le pose au rang voulu du bloc cible", () => {
    const blocks = [blockOf("b1", "k1", "k2"), blockOf("b2", "k3", "k4")];
    expect(keysOf(movedExercise(blocks, "k1", "b2", 1))).toEqual(["b1:k2", "b2:k3,k1,k4"]);
    expect(keysOf(movedExercise(blocks, "k1", "b1", 1))).toEqual(["b1:k2,k1", "b2:k3,k4"]);
  });

  it("déplacer le dernier exercice d'un bloc supprime ce bloc", () => {
    const blocks = [blockOf("b1", "k1"), blockOf("b2", "k2")];
    expect(keysOf(movedExercise(blocks, "k1", "b2", 0))).toEqual(["b2:k1,k2"]);
  });

  it("un déplacement vers un bloc ou depuis un exercice inconnu ne change rien", () => {
    const blocks = [blockOf("b1", "k1")];
    expect(movedExercise(blocks, "k1", "inconnu", 0)).toEqual(blocks);
    expect(movedExercise(blocks, "inconnu", "b1", 0)).toEqual(blocks);
  });

  it("monter le premier exercice d'un bloc ne change rien", () => {
    const blocks = [blockOf("b1", "k1", "k2", "k3")];
    expect(keysOf(movedExercise(blocks, "k1", "b1", -1))).toEqual(["b1:k1,k2,k3"]);
  });

  it("sortir un exercice le met seul dans un bloc juste après, même structure, sans libellé", () => {
    const blocks = [{ ...blockOf("b1", "k1", "k2"), label: "Force" }, blockOf("b2", "k3")];
    const detached = detachedExercise(blocks, "k1", "b9");
    expect(keysOf(detached)).toEqual(["b1:k2", "b9:k1", "b2:k3"]);
    expect(detached[1]).toMatchObject({ label: null, name: "Séries", settings: presets.SERIES });
  });

  it("un exercice seul dans son bloc, ou inconnu, n'en sort pas", () => {
    const blocks = [blockOf("b1", "k1")];
    expect(detachedExercise(blocks, "k1", "b9")).toEqual(blocks);
    expect(detachedExercise(blocks, "inconnu", "b9")).toEqual(blocks);
  });

  it("dupliquer un exercice pose sa copie juste après lui, sous une clé neuve", () => {
    const blocks = [blockOf("b0", "k0"), blockOf("b1", "k1", "k2")];
    const duplicated = duplicatedExercise(blocks, "k1", "k9");
    expect(keysOf(duplicated)).toEqual(["b0:k0", "b1:k1,k9,k2"]);
    expect(duplicated[0]).toBe(blocks[0]);
    expect(duplicated[1]?.exercises[1]?.grid).toEqual(blocks[1]?.exercises[0]?.grid);
  });

  it("remplacer un exercice garde sa place, ses lignes et sa note, sous une clé neuve", () => {
    const blocks = [blockOf("b1", "k1", "k2")];
    const same = { id: "e9", suggestedMetrics: [reps], customMetrics: [] };
    expect(replacedExercise(blocks, "k1", same, "k9", String)[0]?.exercises[0]).toEqual({
      ...exerciseOf("k1"),
      key: "k9",
      exerciseId: "e9",
    });
  });

  // Une colonne de même mesure garde la sienne — son unité, ses valeurs ; les autres partent.
  it("remplacer un exercice prend les métriques du nouveau, en gardant les mesures communes", () => {
    const kilos = load;
    const line = { ...exerciseOf("k1", gridOf([reps, kilos], [8, 60], [6, 70])), note: "Lent" };
    const blocks = [{ ...blockOf("b1"), exercises: [line] }];
    const next = {
      id: "e9",
      suggestedMetrics: [
        { source: MetricSource.CATALOG, key: MetricKey.LOAD, unit: MetricUnit.PERCENT_BODYWEIGHT },
        { source: MetricSource.CATALOG, key: MetricKey.EFFORT_DURATION, unit: MetricUnit.NONE },
      ],
      customMetrics: [],
    } as const;

    const [replaced] =
      replacedExercise(blocks, "k1", next, "k9", (index) => `new_${index}`)[0]?.exercises ?? [];

    expect(replaced?.note).toBe("Lent");
    expect(replaced?.grid.metrics).toEqual([
      kilos,
      { id: "new_1", label: null, ...next.suggestedMetrics[1] },
    ]);
    expect(replaced?.grid.rows.map((row) => row.values)).toEqual([
      { [kilos.id]: 60 },
      { [kilos.id]: 70 },
    ]);
  });

  it("remplacer par un exercice qui suggère deux fois la même mesure ne garde la colonne qu'une fois", () => {
    const blocks = [{ ...blockOf("b1"), exercises: [exerciseOf("k1", gridOf([reps], [8]))] }];
    const twice = {
      id: "e9",
      suggestedMetrics: [
        { source: MetricSource.CATALOG, key: MetricKey.REPETITIONS, unit: MetricUnit.REPS },
        { source: MetricSource.CATALOG, key: MetricKey.REPETITIONS, unit: MetricUnit.REPS },
      ],
      customMetrics: [],
    } as const;

    const [replaced] =
      replacedExercise(blocks, "k1", twice, "k9", (index) => `new_${index}`)[0]?.exercises ?? [];

    expect(replaced?.grid.metrics.map((metric) => metric.id)).toEqual([reps.id, "new_1"]);
  });

  it("dupliquer un bloc pose sa copie juste après lui, ses exercices sous des clés neuves", () => {
    const blocks = [blockOf("b1", "k1", "k2"), blockOf("b2", "k3")];
    const duplicated = duplicatedBlock(blocks, "b1", "b9", counter("n"));
    expect(keysOf(duplicated)).toEqual(["b1:k1,k2", "b9:n0,n1", "b2:k3"]);
    expect(duplicatedBlock(blocks, "inconnu", "b9", counter("n"))).toEqual(blocks);
    // La copie s'enregistre telle quelle : aucune clé n'est partagée.
    expect(sessionBlocksSchema.safeParse(duplicated).success).toBe(true);
  });

  it("déplacer un élément d'une liste, et rien quand le rang en sort", () => {
    expect(movedItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(movedItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(movedItem(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(movedItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("la grille d'un exercice de bloc", () => {
  it("les tours sans ligne se montrent en fantôme de la dernière", () => {
    const grid = gridOf([reps], [8], [10]);
    expect(blockGridSlots(grid.rows, 4)).toEqual([
      { kind: BlockSlotKind.ROW, index: 0, row: grid.rows[0] },
      { kind: BlockSlotKind.ROW, index: 1, row: grid.rows[1] },
      { kind: BlockSlotKind.GHOST, index: 2, source: grid.rows[1] },
      { kind: BlockSlotKind.GHOST, index: 3, source: grid.rows[1] },
    ]);
  });

  it("une grille vide n'a que des fantômes, sans rien à reprendre", () => {
    expect(blockGridSlots([], 2)).toEqual([
      { kind: BlockSlotKind.GHOST, index: 0, source: null },
      { kind: BlockSlotKind.GHOST, index: 1, source: null },
    ]);
  });

  it("les lignes au-delà des tours restent, marquées non jouées", () => {
    const grid = gridOf([reps], [8], [10]);
    expect(blockGridSlots(grid.rows, 1).map((slot) => slot.kind)).toEqual([
      BlockSlotKind.ROW,
      BlockSlotKind.BEYOND,
    ]);
  });

  it("la borne de chaque exercice suit les réglages du bloc", () => {
    const block = { ...blockOf("b1", "k1", "k2", "k3"), settings: oneByBeep(60, 5) };
    expect(blockRowLimits(block)).toEqual([2, 2, 1]);
  });

  it("l'enregistrement taille chaque grille à ses tours, et dit ce qu'il retire", () => {
    const block: SessionBlock = {
      ...blockOf("b1"),
      settings: settingsOf({ repeat: rounds(2) }),
      exercises: [exerciseOf("k1", gridOf([reps], [8], [10], [12])), exerciseOf("k2")],
    };
    expect(rowsBeyond(block)).toEqual([{ key: "k1", count: 1 }]);
    expect(fittedBlock(block).exercises[0]?.grid).toEqual(gridOf([reps], [8], [10]));
    expect(fittedBlock(block).exercises[1]).toEqual(block.exercises[1]);
  });

  it("un bloc qui manque de bips n'est pas taillé : il est à régler", () => {
    const block: SessionBlock = {
      ...blockOf("b1"),
      settings: oneByBeep(60, 1),
      exercises: [exerciseOf("k1", gridOf([reps], [8], [10])), exerciseOf("k2")],
    };
    expect(rowsBeyond(block)).toEqual([]);
    expect(fittedBlock(block)).toBe(block);
  });

  it("retirer une colonne emporte ses valeurs", () => {
    expect(withGridMetrics(gridOf([reps, load], [8, 40], [10, 50]), [load])).toEqual(
      gridOf([load], [40], [50]),
    );
  });

  it("remplir une colonne écrit tous les tours, fantômes compris", () => {
    const rows = gridOf([reps, load], [8, 40]).rows;
    const filled = filledGridRows(
      rows,
      3,
      reps.id,
      { mode: ColumnFillMode.STEP, start: 8, step: 2 },
      (index) => `new_${index}`,
    );
    expect(filled).toEqual([
      { id: "row_0", values: { [reps.id]: 8, [load.id]: 40 } },
      { id: "new_1", values: { [reps.id]: 10, [load.id]: 40 } },
      { id: "new_2", values: { [reps.id]: 12, [load.id]: 40 } },
    ]);
  });

  it("un remplissage laisse les lignes non jouées de côté", () => {
    const rows = gridOf([reps], [1], [2], [3]).rows;
    const filled = filledGridRows(rows, 2, reps.id, { mode: ColumnFillMode.MIRROR }, String);
    expect(filled.map((row) => row.values[reps.id])).toEqual([1, 1, 3]);
  });
});

describe("ce qui reste à régler", () => {
  it("un bloc vide, et un seul par bip sans assez de bips", () => {
    const blocks = [
      blockOf("b1"),
      { ...blockOf("b2", "k1", "k2"), settings: oneByBeep(60, 1) },
      blockOf("b3", "k3"),
    ];
    expect(compositionIssues(blocks)).toEqual([
      { blockId: "b1", phrase: { key: "block.issue.empty", params: {} } },
      { blockId: "b2", phrase: { key: "block.settings.tooFewBeeps", params: { count: 2 } } },
    ]);
  });

  // Les bornes de l'API, dites au bloc qui les dépasse plutôt que par un refus générique.
  it("un bloc trop garni, puis ceux qui dépassent les bornes de la séance", () => {
    const keys = (prefix: string, count: number) =>
      Array.from({ length: count }, (_unused, index) => `${prefix}${index}`);
    expect(compositionIssues([blockOf("b1", ...keys("a", 21))])).toEqual([
      { blockId: "b1", phrase: { key: "block.issue.tooManyExercises", params: { count: 20 } } },
    ]);

    const full = [blockOf("b1", ...keys("a", 20)), blockOf("b2", ...keys("b", 20))];
    expect(compositionIssues([...full, blockOf("b3", ...keys("c", 10))])).toEqual([]);
    expect(compositionIssues([...full, blockOf("b3", ...keys("c", 11))])).toEqual([
      { blockId: "b3", phrase: { key: "block.issue.sessionFull", params: { count: 50 } } },
    ]);

    const many = Array.from({ length: 31 }, (_unused, index) => blockOf(`b${index}`, `k${index}`));
    expect(compositionIssues(many)).toEqual([
      { blockId: "b30", phrase: { key: "block.issue.tooManyBlocks", params: { count: 30 } } },
    ]);
  });
});
