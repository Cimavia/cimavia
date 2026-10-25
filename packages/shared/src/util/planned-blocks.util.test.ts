import { describe, expect, it } from "vitest";
import { gridOf, load, presets, reps, settingsOf } from "../../test/block-fixtures";
import type { MetricValue } from "../dto/exercise-metric.schema";
import { CompositionOrigin, type ScheduledBlockExercise } from "../dto/session-block.schema";
import type { StructureSettings } from "../dto/structure.schema";
import { CompositionChangeKind, plannedChanges, ValueChangeKind } from "./planned-blocks.util";
import { SettingValue } from "./structure-settings.util";

type Origin = ScheduledBlockExercise["origin"];

const RECEIVED: Origin = { kind: CompositionOrigin.RECEIVED };
const ADDED: Origin = { kind: CompositionOrigin.ADDED };
const replacing = (replacesKey: string): Origin => ({
  kind: CompositionOrigin.REPLACEMENT,
  replacesKey,
});

/** Un exercice à 2 colonnes, répétitions et charge, une ligne par tour. */
const exercise = (key: string, ...rows: MetricValue[][]) => ({
  key,
  grid: gridOf([reps, load], ...(rows.length > 0 ? rows : [[6, 60]])),
});
const planned = (origin: Origin, key: string, ...rows: MetricValue[][]) => ({
  ...exercise(key, ...rows),
  origin,
});

const blockOf = <E>(exercises: E[], settings: StructureSettings = presets.SERIES) => ({
  settings,
  exercises,
});

describe("plannedChanges", () => {
  it("ne voit rien quand la séance planifiée est la séance-type reçue", () => {
    const reference = [blockOf([exercise("a"), exercise("b")])];
    const same = [blockOf([planned(RECEIVED, "a"), planned(RECEIVED, "b")])];
    expect(plannedChanges(reference, same)).toEqual({ composition: [], values: [] });
  });

  describe("la composition, lue sur l'origine de chaque exercice", () => {
    const reference = [blockOf([exercise("a"), exercise("b")])];

    it("compte un exercice ajouté, un remplaçant, et un exercice retiré", () => {
      const changes = plannedChanges(reference, [
        blockOf([planned(replacing("a"), "a2"), planned(ADDED, "c")]),
      ]);
      expect(changes.composition).toEqual([
        { kind: CompositionChangeKind.REPLACED, blockIndex: 0, key: "a2", replacedKey: "a" },
        { kind: CompositionChangeKind.ADDED, blockIndex: 0, key: "c" },
        { kind: CompositionChangeKind.REMOVED, blockIndex: 0, key: "b" },
      ]);
    });

    it("ne compte pas un remplaçant comme un retrait de l'exercice qu'il remplace", () => {
      const changes = plannedChanges(reference, [
        blockOf([planned(replacing("a"), "a2"), planned(RECEIVED, "b")]),
      ]);
      expect(changes.composition.map((change) => change.kind)).toEqual([
        CompositionChangeKind.REPLACED,
      ]);
    });

    it("compte comme ajouté ce qui n'a plus rien à quoi revenir dans la référence", () => {
      const changes = plannedChanges(reference, [
        blockOf([
          planned(RECEIVED, "a"),
          planned(RECEIVED, "b"),
          planned(RECEIVED, "gone"),
          planned(replacing("gone_too"), "x"),
        ]),
      ]);
      expect(changes.composition).toEqual([
        { kind: CompositionChangeKind.ADDED, blockIndex: 0, key: "gone" },
        { kind: CompositionChangeKind.ADDED, blockIndex: 0, key: "x" },
      ]);
    });

    it("compte un ajout comme ajouté, même si sa clé rappelle un exercice de la référence", () => {
      const changes = plannedChanges(reference, [
        blockOf([planned(ADDED, "a"), planned(RECEIVED, "b")]),
      ]);
      expect(changes.composition).toEqual([
        { kind: CompositionChangeKind.ADDED, blockIndex: 0, key: "a" },
        { kind: CompositionChangeKind.REMOVED, blockIndex: 0, key: "a" },
      ]);
      expect(changes.values).toEqual([]);
    });

    it("compte tout comme retiré dans un bloc de la référence que la séance n'a plus", () => {
      const changes = plannedChanges(
        [...reference, blockOf([exercise("c")])],
        [blockOf([planned(RECEIVED, "a"), planned(RECEIVED, "b")])],
      );
      expect(changes.composition).toEqual([
        { kind: CompositionChangeKind.REMOVED, blockIndex: 1, key: "c" },
      ]);
    });

    it("compte tout comme ajouté dans un bloc que la référence n'a pas", () => {
      const changes = plannedChanges(reference, [
        blockOf([planned(RECEIVED, "a"), planned(RECEIVED, "b")]),
        blockOf([planned(ADDED, "c")]),
      ]);
      expect(changes).toEqual({
        composition: [{ kind: CompositionChangeKind.ADDED, blockIndex: 1, key: "c" }],
        values: [],
      });
    });
  });

  describe("les valeurs, comptées à part de la composition", () => {
    it("compte une valeur du bloc changée, en citant celle de la référence", () => {
      const reference = [blockOf([exercise("a")], settingsOf({ restBetweenRoundsSeconds: 120 }))];
      const changes = plannedChanges(reference, [
        blockOf([planned(RECEIVED, "a")], settingsOf({ restBetweenRoundsSeconds: 90 })),
      ]);
      expect(changes).toEqual({
        composition: [],
        values: [
          {
            kind: ValueChangeKind.SETTING,
            blockIndex: 0,
            field: SettingValue.REST_BETWEEN_ROUNDS,
            was: 120,
          },
        ],
      });
    });

    it("compte une cellule changée, et une cellule vidée, qui ne vaut pas zéro", () => {
      const reference = [blockOf([exercise("a", [6, 60], [6, 60])])];
      const changes = plannedChanges(reference, [blockOf([planned(RECEIVED, "a", [6, 65], [6])])]);
      expect(changes.values).toEqual([
        {
          kind: ValueChangeKind.CELL,
          blockIndex: 0,
          exerciseKey: "a",
          rowIndex: 0,
          metricId: load.id,
          was: 60,
        },
        {
          kind: ValueChangeKind.CELL,
          blockIndex: 0,
          exerciseKey: "a",
          rowIndex: 1,
          metricId: load.id,
          was: 60,
        },
      ]);
    });

    it("compare une ligne en plus à la dernière de la référence : seules ses retouches comptent", () => {
      const reference = [blockOf([exercise("a", [6, 60], [8, 50])])];
      const changes = plannedChanges(reference, [
        blockOf([planned(RECEIVED, "a", [6, 60], [8, 50], [8, 50], [10, 50])]),
      ]);
      expect(changes.values).toEqual([
        {
          kind: ValueChangeKind.CELL,
          blockIndex: 0,
          exerciseKey: "a",
          rowIndex: 3,
          metricId: reps.id,
          was: 8,
        },
      ]);
    });

    it("compte une cellule remplie là où la référence n'a aucune ligne", () => {
      const reference = [blockOf([{ key: "a", grid: gridOf([reps, load]) }])];
      const changes = plannedChanges(reference, [blockOf([planned(RECEIVED, "a", [6])])]);
      expect(changes.values).toEqual([
        {
          kind: ValueChangeKind.CELL,
          blockIndex: 0,
          exerciseKey: "a",
          rowIndex: 0,
          metricId: reps.id,
          was: null,
        },
      ]);
    });

    it("ne compare pas les valeurs d'un remplaçant ni d'un ajout : c'est de la composition", () => {
      const reference = [blockOf([exercise("a", [6, 60])])];
      const changes = plannedChanges(reference, [
        blockOf([planned(replacing("a"), "a2", [12, 20]), planned(ADDED, "c", [1, 1])]),
      ]);
      expect(changes.values).toEqual([]);
    });
  });
});
