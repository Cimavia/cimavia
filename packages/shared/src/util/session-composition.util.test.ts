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
  detachedExercise,
  duplicatedBlock,
  duplicatedExercise,
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
    const blocks = [blockOf("b1", "k1", "k2")];
    const duplicated = duplicatedExercise(blocks, "k1", "k9");
    expect(keysOf(duplicated)).toEqual(["b1:k1,k9,k2"]);
    expect(duplicated[0]?.exercises[1]?.grid).toEqual(blocks[0]?.exercises[0]?.grid);
  });

  it("remplacer un exercice garde sa place et son dosage, sous une clé neuve", () => {
    const blocks = [blockOf("b1", "k1", "k2")];
    expect(replacedExercise(blocks, "k1", "e9", "k9")[0]?.exercises[0]).toEqual({
      ...exerciseOf("k1"),
      key: "k9",
      exerciseId: "e9",
    });
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
});
