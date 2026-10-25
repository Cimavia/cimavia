import { describe, expect, it } from "vitest";
import { gridOf, load, presets, reps, rounds, settingsOf } from "../../test/block-fixtures";
import type { GridMetric } from "../dto/block-grid.schema";
import { CompositionOrigin, type ScheduledBlockExercise } from "../dto/session-block.schema";
import type { StructureSettings } from "../dto/structure.schema";
import { PlannedLock, plannedLockIssues, takenKeys } from "./planned-lock.util";

type Origin = ScheduledBlockExercise["origin"];

const RECEIVED: Origin = { kind: CompositionOrigin.RECEIVED };
const ADDED: Origin = { kind: CompositionOrigin.ADDED };
const replacing = (replacesKey: string): Origin => ({
  kind: CompositionOrigin.REPLACEMENT,
  replacesKey,
});

const exercise = (key: string, metrics: GridMetric[] = [reps, load]) => ({
  key,
  grid: gridOf(metrics, [6, 60]),
});
const planned = (origin: Origin, key: string, metrics?: GridMetric[]) => ({
  ...exercise(key, metrics),
  origin,
});

const blockOf = <E>(
  exercises: E[],
  settings: StructureSettings = presets.SERIES,
  name = "Séries",
) => ({ name, settings, exercises });

const reference = [blockOf([exercise("a"), exercise("b"), exercise("c")])];

describe("plannedLockIssues", () => {
  it("laisse passer la séance reçue telle quelle", () => {
    const same = [
      blockOf([planned(RECEIVED, "a"), planned(RECEIVED, "b"), planned(RECEIVED, "c")]),
    ];
    expect(plannedLockIssues(reference, same)).toEqual([]);
  });

  it("laisse libres les valeurs et la composition", () => {
    const tuned = [
      blockOf(
        [planned(ADDED, "z"), planned(RECEIVED, "a"), planned(replacing("b"), "b2", [reps])],
        // 5 tours et 3' de repos au lieu de 4 et 2' : des valeurs, pas des réglages.
        settingsOf({ repeat: rounds(5), restBetweenRoundsSeconds: 180 }),
      ),
    ];
    expect(plannedLockIssues(reference, tuned)).toEqual([]);
  });

  it("refuse un bloc en plus ou en moins", () => {
    expect(plannedLockIssues(reference, [])).toEqual([{ lock: PlannedLock.BLOCK_COUNT }]);
    expect(
      plannedLockIssues(reference, [...reference.map(() => blockOf([])), blockOf([])]),
    ).toEqual([{ lock: PlannedLock.BLOCK_COUNT }]);
  });

  it("refuse un autre nom et d'autres réglages", () => {
    const renamed = [blockOf([planned(RECEIVED, "a")], presets.EMOM, "EMOM")];
    expect(plannedLockIssues(reference, renamed)).toEqual([
      { lock: PlannedLock.NAME, blockIndex: 0 },
      { lock: PlannedLock.SETTINGS, blockIndex: 0 },
    ]);
  });

  it("refuse deux exercices reçus échangés, pas un ajout glissé entre eux", () => {
    const swapped = [blockOf([planned(RECEIVED, "b"), planned(RECEIVED, "a")])];
    expect(plannedLockIssues(reference, swapped)).toEqual([
      { lock: PlannedLock.ORDER, blockIndex: 0 },
    ]);

    const withGap = [
      blockOf([planned(RECEIVED, "a"), planned(ADDED, "z"), planned(RECEIVED, "c")]),
    ];
    expect(plannedLockIssues(reference, withGap)).toEqual([]);
  });

  it("refuse d'autres colonnes à un exercice reçu, pas à un remplaçant", () => {
    const columns = [
      blockOf([planned(RECEIVED, "a", [load, reps]), planned(replacing("b"), "b2", [])]),
    ];
    expect(plannedLockIssues(reference, columns)).toEqual([
      { lock: PlannedLock.COLUMNS, blockIndex: 0, key: "a" },
    ]);
  });

  it("ne verrouille pas un exercice reçu que la référence n'a plus", () => {
    const orphan = [blockOf([planned(RECEIVED, "x", []), planned(RECEIVED, "a")])];
    expect(plannedLockIssues(reference, orphan)).toEqual([]);
  });
});

describe("takenKeys", () => {
  const taken = ["a", "b", "c"];

  it("rend la clé d'un ajout ou d'un remplaçant que la séance-type a déjà", () => {
    const blocks = [
      blockOf([planned(ADDED, "a"), planned(replacing("b"), "b"), planned(ADDED, "z")]),
    ];
    expect(takenKeys(blocks, taken)).toEqual(["a", "b"]);
  });

  it("laisse un exercice reçu garder sa clé", () => {
    expect(takenKeys([blockOf([planned(RECEIVED, "a")])], taken)).toEqual([]);
  });
});
