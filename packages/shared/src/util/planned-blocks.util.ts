import type { BlockGrid } from "../dto/block-grid.schema";
import type { MetricValue } from "../dto/exercise-metric.schema";
import {
  CompositionOrigin,
  referencePlaceOf,
  type ScheduledBlockExercise,
} from "../dto/session-block.schema";
import type { StructureSettings } from "../dto/structure.schema";
import type { TypesValuesOf } from "../type/generics.type";
import { required } from "./invariant.util";
import { type SettingValue, settingValues } from "./structure-settings.util";

// Les comptes du niveau planifié (#715), repris d'`adjusted()` dans `structure_model.js`. Chaque
// chose se compte d'un seul côté : le panneau de séance planifiée compte la COMPOSITION, Dosage
// compte les VALEURS (#714).

type ReferenceExercise = { key: string; grid: BlockGrid };
type ReferenceBlock = { settings: StructureSettings; exercises: readonly ReferenceExercise[] };
type PlannedBlock = {
  settings: StructureSettings;
  exercises: readonly (ReferenceExercise & Pick<ScheduledBlockExercise, "origin">)[];
};

export const CompositionChangeKind = {
  ADDED: "ADDED",
  REPLACED: "REPLACED",
  REMOVED: "REMOVED",
} as const;
export type CompositionChangeKind = TypesValuesOf<typeof CompositionChangeKind>;

/** `key` désigne l'exercice planifié — ou, pour un retrait, celui de la référence qui manque. */
export type CompositionChange =
  | { kind: typeof CompositionChangeKind.ADDED; blockIndex: number; key: string }
  | {
      kind: typeof CompositionChangeKind.REPLACED;
      blockIndex: number;
      key: string;
      replacedKey: string;
    }
  | { kind: typeof CompositionChangeKind.REMOVED; blockIndex: number; key: string };

export const ValueChangeKind = {
  /** Une valeur du bloc : tours, repos, temps. */
  SETTING: "SETTING",
  /** Une cellule de la grille d'un exercice. */
  CELL: "CELL",
} as const;

/** `was` est la valeur de la référence : la bulle cite la séance-type, jamais la bibliothèque. */
export type ValueChange =
  | {
      kind: typeof ValueChangeKind.SETTING;
      blockIndex: number;
      field: SettingValue;
      was: number | null;
    }
  | {
      kind: typeof ValueChangeKind.CELL;
      blockIndex: number;
      exerciseKey: string;
      rowIndex: number;
      metricId: string;
      was: MetricValue;
    };

export type PlannedChanges = { composition: CompositionChange[]; values: ValueChange[] };

/**
 * Ce qui distingue une séance planifiée de sa référence — la séance-type reçue —, bloc par bloc.
 * Les blocs se répondent par leur rang : au niveau planifié, leur nombre, leur ordre et leurs
 * colonnes ne bougent pas (verrou de #518) ; seules leurs valeurs et leur composition changent.
 *
 * - La composition se lit sur l'ORIGINE de chaque exercice (#716) : ajouté, remplaçant d'un
 *   exercice de la référence ; un exercice de la référence ni gardé ni remplacé est retiré. Un
 *   exercice reçu que la référence n'a plus, ou le remplaçant d'un exercice qu'elle n'a plus, n'a
 *   rien à quoi revenir : il compte comme ajouté.
 * - Les valeurs ne se comparent que pour les exercices présents des deux côtés. Une ligne en plus —
 *   un tour de plus — se compare à la dernière ligne de la référence, qu'elle recopie : seules ses
 *   cellules modifiées comptent.
 */
export function plannedChanges(
  reference: readonly ReferenceBlock[],
  planned: readonly PlannedBlock[],
): PlannedChanges {
  const blockCount = Math.max(reference.length, planned.length);
  const changes = Array.from({ length: blockCount }, (_unused, blockIndex) => {
    const block = planned[blockIndex];
    const referenceBlock = reference[blockIndex];
    if (block == null) {
      // Un rang en deçà du plus long des deux existe d'au moins un côté.
      const removed = required(referenceBlock, "rang sans bloc");
      return wholeBlock(blockIndex, removed, CompositionChangeKind.REMOVED);
    }
    if (referenceBlock == null) return wholeBlock(blockIndex, block, CompositionChangeKind.ADDED);
    return blockChanges(blockIndex, referenceBlock, block);
  });
  return {
    composition: changes.flatMap((change) => change.composition),
    values: changes.flatMap((change) => change.values),
  };
}

/** Un bloc absent d'un côté n'a rien à comparer : tout y est ajouté, ou tout retiré. */
function wholeBlock(
  blockIndex: number,
  block: { exercises: readonly { key: string }[] },
  kind: typeof CompositionChangeKind.ADDED | typeof CompositionChangeKind.REMOVED,
): PlannedChanges {
  return {
    composition: block.exercises.map((exercise) => ({ kind, blockIndex, key: exercise.key })),
    values: [],
  };
}

function blockChanges(
  blockIndex: number,
  reference: ReferenceBlock,
  block: PlannedBlock,
): PlannedChanges {
  const byKey = new Map(reference.exercises.map((exercise) => [exercise.key, exercise]));
  const composition: CompositionChange[] = [];
  const values = settingChanges(blockIndex, reference.settings, block.settings);

  for (const exercise of block.exercises) {
    const place = referencePlaceOf(exercise);
    const match = place == null ? undefined : byKey.get(place);
    if (match == null) {
      composition.push({ kind: CompositionChangeKind.ADDED, blockIndex, key: exercise.key });
    } else if (exercise.origin.kind === CompositionOrigin.REPLACEMENT) {
      composition.push({
        kind: CompositionChangeKind.REPLACED,
        blockIndex,
        key: exercise.key,
        replacedKey: match.key,
      });
    } else {
      values.push(...cellChanges(blockIndex, match, exercise));
    }
  }

  const kept = new Set(block.exercises.map(referencePlaceOf));
  for (const exercise of reference.exercises) {
    if (!kept.has(exercise.key)) {
      composition.push({ kind: CompositionChangeKind.REMOVED, blockIndex, key: exercise.key });
    }
  }
  return { composition, values };
}

function settingChanges(
  blockIndex: number,
  reference: StructureSettings,
  planned: StructureSettings,
): ValueChange[] {
  const was = settingValues(reference);
  const now = settingValues(planned);
  return (Object.keys(now) as SettingValue[])
    .filter((field) => now[field] !== was[field])
    .map((field) => ({ kind: ValueChangeKind.SETTING, blockIndex, field, was: was[field] }));
}

/** Les colonnes ne bougent pas au niveau planifié : seules celles de la séance se comparent. */
function cellChanges(
  blockIndex: number,
  reference: ReferenceExercise,
  planned: ReferenceExercise,
): ValueChange[] {
  return planned.grid.rows.flatMap((row, rowIndex) => {
    const referenceRow = reference.grid.rows[rowIndex] ?? reference.grid.rows.at(-1);
    return planned.grid.metrics.flatMap((metric) => {
      const was = referenceRow?.values[metric.id] ?? null;
      const now = row.values[metric.id] ?? null;
      if (now === was) return [];
      return [
        {
          kind: ValueChangeKind.CELL,
          blockIndex,
          exerciseKey: planned.key,
          rowIndex,
          metricId: metric.id,
          was,
        },
      ];
    });
  });
}
