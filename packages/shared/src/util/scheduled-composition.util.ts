import type { BlockGrid } from "../dto/block-grid.schema";
import {
  type CompositionEdit,
  CompositionEditKind,
  type ScheduledSessionCopyDto,
  type SessionVersion,
} from "../dto/scheduled-composition.schema";
import {
  BLOCK_MAX_EXERCISES,
  CompositionOrigin,
  referencePlaceOf,
  type ScheduledBlockExercise,
} from "../dto/session-block.schema";
import type { BlockReference } from "../dto/session-block-dto.schema";
import { SESSION_MAX_EXERCISES } from "../dto/session-limits.schema";
import type { StructureSettings } from "../dto/structure.schema";
import type { TypesValuesOf } from "../type/generics.type";
import {
  blockExerciseFrom,
  replacementGrid,
  type SuggestingExercise,
} from "./session-composition.util";
import { gridRowLimit, roundsError } from "./structure-settings.util";

// Ce qu'un changement de composition fait à UNE copie (#720) : l'appliquer, le défaire, ou rendre
// la composition de la séance-type. Le panneau s'en sert pour griser une semaine et dire pourquoi,
// le serveur pour écrire chaque copie. Les blocs ne bougent pas : seuls leurs exercices changent.

/** Un exercice de bloc planifié, tel que la copie le porte. */
export type PlannedExercise = Pick<ScheduledBlockExercise, "key" | "origin" | "note"> & {
  grid: BlockGrid;
};

/**
 * Un exercice après le changement. `exerciseId` n'est porté que par ceux que le changement PLACE —
 * ajout, remplaçant, exercice de la séance-type rendu : leur contenu se copie de la bibliothèque.
 */
export type ComposedExercise = PlannedExercise & { exerciseId?: string };

export type PlannedCompositionBlock<E extends PlannedExercise = PlannedExercise> = {
  settings: StructureSettings;
  baseline: BlockReference;
  exercises: readonly E[];
};

/** Les exercices de la bibliothèque que l'acteur peut placer, par identifiant ; `null` sinon. */
export type CompositionLibrary = (exerciseId: string) => SuggestingExercise | null;

export const CompositionRefusal = {
  /** La copie n'a pas ce bloc : elle a été posée avant une retouche de la séance-type. */
  NO_BLOCK: "NO_BLOCK",
  /** La copie n'a pas l'exercice de la séance-type que le changement vise. */
  ABSENT: "ABSENT",
  /**
   * L'exercice à placer — nouveau, ou celui de la séance-type à rendre — n'est plus dans la
   * bibliothèque de l'acteur : son contenu s'y copie.
   */
  NOT_IN_LIBRARY: "NOT_IN_LIBRARY",
  /** Le bloc n'aurait plus d'exercice. */
  LAST_EXERCISE: "LAST_EXERCISE",
  BLOCK_FULL: "BLOCK_FULL",
  SESSION_FULL: "SESSION_FULL",
  /** Les tours du bloc ne se répartissent plus sur ses exercices (« un seul par… »). */
  ROUNDS: "ROUNDS",
  /** La clé du nouvel exercice est déjà prise dans la copie, par un autre. */
  KEY_TAKEN: "KEY_TAKEN",
} as const;
export type CompositionRefusal = TypesValuesOf<typeof CompositionRefusal>;

export const CompositionOutcomeKind = {
  CHANGED: "CHANGED",
  /** Le changement y est déjà en place — ou déjà défait. */
  UNCHANGED: "UNCHANGED",
  REFUSED: "REFUSED",
} as const;

export type CompositionOutcome<E extends PlannedExercise> =
  | {
      kind: typeof CompositionOutcomeKind.CHANGED;
      blocks: PlannedCompositionBlock<E | ComposedExercise>[];
    }
  | { kind: typeof CompositionOutcomeKind.UNCHANGED }
  | { kind: typeof CompositionOutcomeKind.REFUSED; refusal: CompositionRefusal };

const UNCHANGED = { kind: CompositionOutcomeKind.UNCHANGED } as const;
const refused = (refusal: CompositionRefusal) =>
  ({ kind: CompositionOutcomeKind.REFUSED, refusal }) as const;

/**
 * Les colonnes d'un exercice placé, au même identifiant dans chaque copie : Dosage (#721) aligne
 * les semaines colonne par colonne.
 */
const columnIdsOf = (key: string) => (index: number) => `${key}-${index}`;

/** `items`, `count` éléments retirés au rang `at` et `added` posés à leur place. */
function spliced<T>(items: readonly T[], at: number, count: number, ...added: T[]): T[] {
  return [...items.slice(0, at), ...added, ...items.slice(at + count)];
}

/** L'exercice qui occupe, dans le bloc, la place `key` de la séance-type — reçu ou remplaçant. */
function occupantIndex(exercises: readonly PlannedExercise[], key: string): number {
  return exercises.findIndex((exercise) => referencePlaceOf(exercise) === key);
}

function keysOf(blocks: readonly PlannedCompositionBlock[]): Set<string> {
  return new Set(blocks.flatMap((block) => block.exercises.map((exercise) => exercise.key)));
}

/**
 * Les exercices de la séance-type que le bloc a retirés : personne n'occupe plus leur place. Le
 * panneau les montre barrés, avec de quoi les rendre.
 */
export function removedReferences(block: PlannedCompositionBlock): BlockReference["exercises"] {
  return block.baseline.exercises.filter(
    (reference) => occupantIndex(block.exercises, reference.key) < 0,
  );
}

/**
 * « N changements pour Léa » : chaque ajout, chaque remplaçant et chaque retrait de la copie, par
 * rapport à la séance-type reçue. Les valeurs n'y comptent pas, elles sont l'affaire de Dosage.
 */
export function compositionChangeCount(blocks: readonly PlannedCompositionBlock[]): number {
  return blocks.reduce(
    (count, block) =>
      count +
      block.exercises.filter((exercise) => exercise.origin.kind !== CompositionOrigin.RECEIVED)
        .length +
      removedReferences(block).length,
    0,
  );
}

/**
 * Le changement est-il en place dans ces blocs ? Un ajout ou un remplaçant : sa clé est dans le
 * bloc. Un retrait : la séance-type a l'exercice, et personne n'occupe sa place.
 */
export function editInPlace(
  blocks: readonly PlannedCompositionBlock[],
  edit: CompositionEdit,
): boolean {
  const block = blocks[edit.blockIndex];
  if (block === undefined) return false;
  if (edit.kind === CompositionEditKind.ADD) {
    return block.exercises.some(
      (exercise) => exercise.key === edit.key && exercise.origin.kind === CompositionOrigin.ADDED,
    );
  }
  if (edit.kind === CompositionEditKind.REPLACE) {
    // Sa clé ET la place qu'il prend : une même clé qui désignerait autre chose n'est pas lui.
    return block.exercises.some(
      (exercise) => exercise.key === edit.key && referencePlaceOf(exercise) === edit.replacesKey,
    );
  }
  return (
    block.baseline.exercises.some((exercise) => exercise.key === edit.key) &&
    occupantIndex(block.exercises, edit.key) < 0
  );
}

/** Le changement appliqué à la copie. */
export function appliedEdit<E extends PlannedExercise>(
  blocks: readonly PlannedCompositionBlock<E>[],
  edit: CompositionEdit,
  library: CompositionLibrary,
): CompositionOutcome<E> {
  const block = blocks[edit.blockIndex];
  if (block === undefined) return refused(CompositionRefusal.NO_BLOCK);
  if (editInPlace(blocks, edit)) return UNCHANGED;

  if (edit.kind === CompositionEditKind.REMOVE) {
    const index = occupantIndex(block.exercises, edit.key);
    // En place juste au-dessus si la séance-type l'a et que personne ne l'occupe.
    if (index < 0) return refused(CompositionRefusal.ABSENT);
    return withExercises(blocks, edit.blockIndex, spliced(block.exercises, index, 1), false);
  }

  // Une clé que la copie porte ailleurs, ou que la séance-type a reçue, désignerait deux exercices.
  const baselineKeys = blocks.flatMap((each) => each.baseline.exercises.map(({ key }) => key));
  if (keysOf(blocks).has(edit.key) || baselineKeys.includes(edit.key)) {
    return refused(CompositionRefusal.KEY_TAKEN);
  }
  // Sans source, un ajout ou un remplaçant se défait encore, mais ne s'étend plus.
  const exercise = edit.exerciseId === null ? null : library(edit.exerciseId);
  if (exercise === null) return refused(CompositionRefusal.NOT_IN_LIBRARY);

  if (edit.kind === CompositionEditKind.ADD) {
    const { grid } = blockExerciseFrom(exercise, edit.key, columnIdsOf(edit.key));
    const added: ComposedExercise = {
      key: edit.key,
      origin: { kind: CompositionOrigin.ADDED },
      note: null,
      grid,
      exerciseId: exercise.id,
    };
    return withExercises(blocks, edit.blockIndex, [...block.exercises, added], true);
  }

  const index = occupantIndex(block.exercises, edit.replacesKey);
  const occupant = block.exercises[index];
  if (occupant === undefined) return refused(CompositionRefusal.ABSENT);
  const replacement: ComposedExercise = {
    key: edit.key,
    origin: { kind: CompositionOrigin.REPLACEMENT, replacesKey: edit.replacesKey },
    note: occupant.note,
    grid: replacementGrid(occupant.grid, exercise, columnIdsOf(edit.key)),
    exerciseId: exercise.id,
  };
  return withExercises(
    blocks,
    edit.blockIndex,
    spliced<E | ComposedExercise>(block.exercises, index, 1, replacement),
    false,
  );
}

/**
 * Le changement défait dans la copie : l'ajout part, l'exercice remplacé ou retiré revient tel que
 * la séance-type l'a donné — sa note et ses valeurs reçues.
 */
export function revertedEdit<E extends PlannedExercise>(
  blocks: readonly PlannedCompositionBlock<E>[],
  edit: CompositionEdit,
  library: CompositionLibrary,
): CompositionOutcome<E> {
  const block = blocks[edit.blockIndex];
  if (block === undefined || !editInPlace(blocks, edit)) return UNCHANGED;

  if (edit.kind === CompositionEditKind.ADD) {
    const exercises = block.exercises.filter((exercise) => exercise.key !== edit.key);
    return withExercises(blocks, edit.blockIndex, exercises, false);
  }

  const placeKey = edit.kind === CompositionEditKind.REPLACE ? edit.replacesKey : edit.key;
  const restored = restoredExercise(block.baseline, placeKey, library);
  if (typeof restored === "string") return refused(restored);

  if (edit.kind === CompositionEditKind.REPLACE) {
    const exercises = block.exercises.map((exercise) =>
      exercise.key === edit.key ? restored : exercise,
    );
    return withExercises(blocks, edit.blockIndex, exercises, false);
  }
  const at = restoredRank(block, edit.key);
  return withExercises(
    blocks,
    edit.blockIndex,
    spliced<E | ComposedExercise>(block.exercises, at, 0, restored),
    true,
  );
}

/**
 * « Tout réinitialiser » : chaque bloc reprend la composition de la séance-type reçue. Un exercice
 * reçu et gardé garde ses valeurs — ce sont celles de Dosage ; un exercice remplacé ou retiré
 * revient avec les valeurs reçues, et les ajouts partent.
 */
export function resetComposition<E extends PlannedExercise>(
  blocks: readonly PlannedCompositionBlock<E>[],
  library: CompositionLibrary,
): CompositionOutcome<E> {
  const reset: PlannedCompositionBlock<E | ComposedExercise>[] = [];
  for (const block of blocks) {
    const exercises: (E | ComposedExercise)[] = [];
    for (const reference of block.baseline.exercises) {
      const kept = block.exercises.find(
        (exercise) =>
          exercise.origin.kind === CompositionOrigin.RECEIVED && exercise.key === reference.key,
      );
      const exercise = kept ?? restoredExercise(block.baseline, reference.key, library);
      if (typeof exercise === "string") return refused(exercise);
      exercises.push(exercise);
    }
    const refusal = blockRefusal(block.settings, exercises);
    if (refusal != null) return refused(refusal);
    reset.push({ ...block, exercises });
  }
  const same = reset.every((block, index) => {
    const before = blocks[index]?.exercises ?? [];
    return (
      block.exercises.length === before.length &&
      block.exercises.every((exercise, rank) => exercise === before[rank])
    );
  });
  return same ? UNCHANGED : { kind: CompositionOutcomeKind.CHANGED, blocks: reset };
}

function restoredExercise(
  baseline: BlockReference,
  key: string,
  library: CompositionLibrary,
): ComposedExercise | CompositionRefusal {
  const reference = baseline.exercises.find((exercise) => exercise.key === key);
  // Un retrait ou un remplacement en place vise un exercice que la séance-type a (`editInPlace`).
  if (reference === undefined) return CompositionRefusal.ABSENT;
  if (reference.exerciseId === null || library(reference.exerciseId) === null) {
    return CompositionRefusal.NOT_IN_LIBRARY;
  }
  return {
    key: reference.key,
    origin: { kind: CompositionOrigin.RECEIVED },
    note: reference.note,
    grid: reference.grid,
    exerciseId: reference.exerciseId,
  };
}

/**
 * Le rang où revient un exercice retiré : avant le premier exercice venu APRÈS lui dans la
 * séance-type — un remplaçant compte au rang de l'exercice qu'il remplace —, sinon avant le premier
 * ajout : les ajouts restent en fin de bloc. Sans quoi deux exercices reçus s'échangeraient, ce que
 * le verrou refuse (`plannedLockIssues`).
 */
function restoredRank(block: PlannedCompositionBlock, key: string): number {
  const rankOf = new Map(block.baseline.exercises.map((exercise, rank) => [exercise.key, rank]));
  const own = rankOf.get(key) ?? -1;
  const ranks = block.exercises.map((exercise) => {
    const place = referencePlaceOf(exercise);
    return place === null ? -1 : (rankOf.get(place) ?? -1);
  });
  const after = ranks.findIndex((rank) => rank > own);
  if (after >= 0) return after;
  const added = ranks.findIndex((rank) => rank < 0);
  return added >= 0 ? added : block.exercises.length;
}

function withExercises<E extends PlannedExercise>(
  blocks: readonly PlannedCompositionBlock<E>[],
  blockIndex: number,
  exercises: readonly (E | ComposedExercise)[],
  grows: boolean,
): CompositionOutcome<E> {
  // Le bloc existe : chaque appelant l'a lu à ce rang.
  const block = blocks[blockIndex] as PlannedCompositionBlock<E>;
  const refusal =
    blockRefusal(block.settings, exercises) ?? (grows ? sessionRefusal(blocks) : null);
  if (refusal != null) return refused(refusal);
  return {
    kind: CompositionOutcomeKind.CHANGED,
    blocks: blocks.map((each, index) => (index === blockIndex ? { ...each, exercises } : each)),
  };
}

/** Ce qui retient le bloc après le changement, ou `null`. */
function blockRefusal(
  settings: StructureSettings,
  exercises: readonly PlannedExercise[],
): CompositionRefusal | null {
  const count = exercises.length;
  if (count === 0) return CompositionRefusal.LAST_EXERCISE;
  if (count > BLOCK_MAX_EXERCISES) return CompositionRefusal.BLOCK_FULL;
  if (roundsError(settings, count) != null) return CompositionRefusal.ROUNDS;
  const tooLong = exercises.some(
    (exercise, index) => exercise.grid.rows.length > gridRowLimit(settings, count, index),
  );
  return tooLong ? CompositionRefusal.ROUNDS : null;
}

/** Un exercice de plus dans la copie, comptée AVANT le changement. */
function sessionRefusal(blocks: readonly PlannedCompositionBlock[]): CompositionRefusal | null {
  const count = blocks.reduce((total, block) => total + block.exercises.length, 0);
  return count + 1 > SESSION_MAX_EXERCISES ? CompositionRefusal.SESSION_FULL : null;
}

// ── Pour quelles semaines ? ─────────────────────────────────────────────────────────────────

/**
 * Une copie dans la fenêtre : le changement y est-il en place, et sinon, pourquoi ne s'y
 * appliquerait-il pas ? En place, pourquoi ne se défait-il pas ? `null` : la case se coche, ou se
 * décoche.
 */
export type CopyChoice = {
  id: string;
  inPlace: boolean;
  refusal: CompositionRefusal | null;
};

export function copyChoices(
  copies: readonly { id: string; blocks: readonly PlannedCompositionBlock[] }[],
  edit: CompositionEdit,
  library: CompositionLibrary,
): CopyChoice[] {
  return copies.map((copy) => {
    const inPlace = editInPlace(copy.blocks, edit);
    const outcome = inPlace
      ? revertedEdit(copy.blocks, edit, library)
      : appliedEdit(copy.blocks, edit, library);
    return {
      id: copy.id,
      inPlace,
      refusal: outcome.kind === CompositionOutcomeKind.REFUSED ? outcome.refusal : null,
    };
  });
}

/**
 * Ce que « Valider » envoie : les copies cochées où le changement n'est pas encore, et les
 * décochées où il est. Une copie qui refuse garde son état, quoi qu'en dise la case.
 */
export function compositionTargets(
  copies: readonly Pick<ScheduledSessionCopyDto, "id" | "updatedAt">[],
  choices: readonly CopyChoice[],
  checked: ReadonlySet<string>,
): { apply: SessionVersion[]; revert: SessionVersion[] } {
  const choiceOf = new Map(choices.map((choice) => [choice.id, choice]));
  const apply: SessionVersion[] = [];
  const revert: SessionVersion[] = [];
  for (const copy of copies) {
    const choice = choiceOf.get(copy.id);
    if (choice?.refusal !== null) continue;
    const version = { id: copy.id, expectedUpdatedAt: copy.updatedAt };
    if (checked.has(copy.id) && !choice.inPlace) apply.push(version);
    if (!checked.has(copy.id) && choice.inPlace) revert.push(version);
  }
  return { apply, revert };
}

/**
 * Le changement que porte un exercice du panneau : un ajout ou un remplaçant. Un exercice reçu
 * n'en porte aucun. `exerciseId` : sa source dans la bibliothèque, `null` quand elle a disparu —
 * le changement se défait encore, mais ne s'étend plus à d'autres semaines.
 */
export function editOfExercise(
  blockIndex: number,
  exercise: Pick<PlannedExercise, "key" | "origin">,
  exerciseId: string | null,
): CompositionEdit | null {
  switch (exercise.origin.kind) {
    case CompositionOrigin.RECEIVED:
      return null;
    case CompositionOrigin.ADDED:
      return { kind: CompositionEditKind.ADD, blockIndex, key: exercise.key, exerciseId };
    case CompositionOrigin.REPLACEMENT:
      return {
        kind: CompositionEditKind.REPLACE,
        blockIndex,
        replacesKey: exercise.origin.replacesKey,
        key: exercise.key,
        exerciseId,
      };
  }
}
