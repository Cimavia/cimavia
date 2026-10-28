import type { BlockGrid, GridMetric, GridRow } from "../dto/block-grid.schema";
import { metricsFromSuggested } from "../dto/block-grid.schema";
import {
  type ColumnFillPlan,
  fillRows,
  MetricSource,
  withMaterializedSeries,
} from "../dto/exercise-block.schema";
import {
  BLOCK_MAX_EXERCISES,
  SESSION_MAX_BLOCKS,
  type SessionBlock,
  type SessionBlockExercise,
} from "../dto/session-block.schema";
import type { SessionBlockDto } from "../dto/session-block-dto.schema";
import { SESSION_MAX_EXERCISES } from "../dto/session-limits.schema";
import {
  STRUCTURE_PRESETS,
  type StructureDto,
  type StructureInput,
  StructurePresetKey,
} from "../dto/structure.schema";
import type { SuggestedMetric } from "../dto/suggested-metric.schema";
import type { TypesValuesOf } from "../type/generics.type";
import type { Phrase } from "./phrase.util";
import { gridRowLimit, roundsError } from "./structure-settings.util";

// La composition d'une séance-type par blocs (#719) : ce que le constructeur fait aux blocs, à
// leurs exercices et à leurs grilles. Chaque geste rend de NOUVEAUX blocs, sans toucher ceux qu'il
// reçoit : le brouillon se compare à la version enregistrée (`sameJson`).
//
// Les identifiants neufs viennent de l'app (`newId`) : le serveur régénère ceux des blocs, mais les
// clés d'exercice sont stables et la séance planifiée s'y adresse.

// ── La structure d'un bloc ──────────────────────────────────────────────────────────────────

/** Ce qu'un bloc copie de sa structure, prête ou du Coach. */
export type CopiedStructure = Pick<
  SessionBlock,
  "name" | "instructions" | "settings" | "sourceStructureId" | "sourcePreset"
>;

/** Une structure prête : son nom vient de l'app, qui le traduit. Elle n'a pas de consigne. */
export function presetSource(key: StructurePresetKey, name: string): CopiedStructure {
  return {
    name,
    instructions: null,
    settings: STRUCTURE_PRESETS[key],
    sourceStructureId: null,
    sourcePreset: key,
  };
}

export function structureSource(
  structure: Pick<StructureDto, "id" | "name" | "instructions" | "settings">,
): CopiedStructure {
  return {
    name: structure.name,
    instructions: structure.instructions,
    settings: structure.settings,
    sourceStructureId: structure.id,
    sourcePreset: null,
  };
}

/** Un bloc neuf, sans libellé ni exercice : le Coach y ajoute ensuite les siens. */
export function blockFrom(source: CopiedStructure, id: string): SessionBlock {
  return { id, label: null, ...source, copiedSettings: source.settings, exercises: [] };
}

/**
 * Le bloc passé sous une autre structure : réglages, nom et origine. La consigne que le Coach a
 * écrite reste — c'est la sienne. Celle qu'il tient de son origine (`inherited`, celle que porte
 * encore la structure quittée) part avec elle : le bloc prend celle de la nouvelle structure.
 * Une origine qu'on ne lit plus ne dit rien de la consigne, qui reste.
 */
export function withStructure(
  block: SessionBlock,
  source: CopiedStructure,
  inherited: string | null = null,
): SessionBlock {
  const own = block.instructions != null && block.instructions !== inherited;
  return {
    ...block,
    ...source,
    copiedSettings: source.settings,
    instructions: own ? block.instructions : source.instructions,
  };
}

/** « Revenir à Séries » : les réglages copiés de la structure, valeurs comprises. */
export function revertedBlock(block: SessionBlock): SessionBlock {
  return { ...block, settings: block.copiedSettings };
}

/**
 * La structure qu'« Enregistrer comme structure » propose : les réglages et la consigne du bloc,
 * sous le nom choisi. Ni tags ni note : ils sont au Coach, et le panneau les lui laisse écrire.
 */
export function blockStructureInput(block: SessionBlock, name: string): StructureInput {
  return { name, tags: [], note: null, instructions: block.instructions, settings: block.settings };
}

// ── Les exercices d'un bloc ─────────────────────────────────────────────────────────────────

/**
 * Un exercice de la bibliothèque, tel qu'un bloc le reçoit : ses métriques suggérées, et celles du
 * Coach qu'il cite et qui existent ENCORE (`ExerciseDto.customMetrics`).
 */
export type SuggestingExercise = {
  id: string;
  suggestedMetrics: readonly SuggestedMetric[];
  customMetrics: readonly { id: string }[];
};

/**
 * Les colonnes que l'exercice préremplit. Une métrique maison supprimée depuis reste suggérée
 * (dette EX-2) : la reprendre poserait une colonne que l'enregistrement refuse, faute de métrique.
 */
function suggestedColumns(
  exercise: SuggestingExercise,
  newId: (index: number) => string,
): GridMetric[] {
  const known = new Set(exercise.customMetrics.map((metric) => metric.id));
  const usable = exercise.suggestedMetrics.filter(
    (metric) => metric.source !== MetricSource.CUSTOM || known.has(metric.customMetricId),
  );
  return metricsFromSuggested(usable, newId);
}

/**
 * Un exercice ajouté à un bloc : une colonne par métrique suggérée, et aucune ligne — toutes ses
 * lignes s'affichent en fantôme (`blockGridSlots`) jusqu'à ce que le Coach en remplisse une.
 */
export function blockExerciseFrom(
  exercise: SuggestingExercise,
  key: string,
  newId: (index: number) => string,
): SessionBlockExercise {
  return {
    key,
    exerciseId: exercise.id,
    note: null,
    grid: { metrics: suggestedColumns(exercise, newId), rows: [] },
  };
}

const EXERCISE_POINTER = /^#\/blocks\/(\d+)\/exercises\/(\d+)(\/|$)/;

/**
 * La clé de l'exercice qu'un refus de l'API désigne (`#/blocks/1/exercises/0/grid`, RFC 9457), dans
 * les blocs ENVOYÉS — `null` quand le refus vise autre chose qu'un exercice.
 */
export function exerciseKeyAt(blocks: readonly SessionBlock[], pointer: string): string | null {
  const match = EXERCISE_POINTER.exec(pointer);
  if (match == null) return null;
  return blocks[Number(match[1])]?.exercises[Number(match[2])]?.key ?? null;
}

/**
 * Où revient l'exercice créé depuis le bloc de rang `rank` (#303), une fois la séance enregistrée
 * SANS ses blocs vides — l'API les refuse. `rank` : son rang parmi les blocs enregistrés. Un bloc
 * vide n'y est pas : il revient comme un bloc neuf, à sa place, copié de la même structure
 * (`source` : la clé de la structure prête, ou l'id de celle du Coach). Son libellé et ses
 * réglages ajustés, eux, ne survivent pas à l'aller-retour.
 */
export function creationPlaceOf(
  blocks: readonly SessionBlock[],
  rank: number,
): { rank: number; source: string | null } | null {
  const target = blocks[rank];
  if (target === undefined) return null;
  const kept = blocks.slice(0, rank).filter((block) => block.exercises.length > 0).length;
  if (target.exercises.length > 0) return { rank: kept, source: null };
  // Une structure supprimée depuis ne laisse aucune origine : le bloc revient en Séries.
  const source = target.sourceStructureId ?? target.sourcePreset ?? StructurePresetKey.SERIES;
  return { rank: kept, source };
}

/** Les blocs que rend l'API, sans l'`id` de ligne que leurs exercices portent en plus. */
export function blocksFromDto(blocks: readonly SessionBlockDto[]): SessionBlock[] {
  return blocks.map((block) => ({
    ...block,
    exercises: block.exercises.map(({ key, exerciseId, note, grid }) => ({
      key,
      exerciseId,
      note,
      grid,
    })),
  }));
}

type Place = { blockIndex: number; index: number };

/** Où se trouve l'exercice de clé `key`, ou `null` s'il n'est dans aucun bloc. */
function placeOf(blocks: readonly SessionBlock[], key: string): Place | null {
  for (const [blockIndex, block] of blocks.entries()) {
    const index = block.exercises.findIndex((exercise) => exercise.key === key);
    if (index >= 0) return { blockIndex, index };
  }
  return null;
}

/** Les blocs, celui d'identifiant `blockId` passé par `change`. */
export function withBlock(
  blocks: readonly SessionBlock[],
  blockId: string,
  change: (block: SessionBlock) => SessionBlock,
): SessionBlock[] {
  return blocks.map((block) => (block.id === blockId ? change(block) : block));
}

/** Un exercice changé (sa grille, sa note) ; les autres ne bougent pas. */
export function withExerciseChange(
  blocks: readonly SessionBlock[],
  key: string,
  change: (exercise: SessionBlockExercise) => SessionBlockExercise,
): SessionBlock[] {
  return blocks.map((block) => ({
    ...block,
    exercises: block.exercises.map((exercise) =>
      exercise.key === key ? change(exercise) : exercise,
    ),
  }));
}

function inserted<T>(items: readonly T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

/** `items`, l'élément de rang `from` déplacé au rang `to`. Un rang hors liste ne change rien. */
export function movedItem<T>(items: readonly T[], from: number, to: number): T[] {
  const item = items[from];
  if (item === undefined || to < 0 || to >= items.length) return [...items];
  return inserted(
    items.filter((_unused, index) => index !== from),
    to,
    item,
  );
}

export function withAddedExercise(
  blocks: readonly SessionBlock[],
  blockId: string,
  exercise: SessionBlockExercise,
): SessionBlock[] {
  return withBlock(blocks, blockId, (block) => ({
    ...block,
    exercises: [...block.exercises, exercise],
  }));
}

/** Retirer le dernier exercice laisse le bloc vide, à compléter : sa structure reste choisie. */
export function withoutExercise(blocks: readonly SessionBlock[], key: string): SessionBlock[] {
  return blocks.map((block) => ({
    ...block,
    exercises: block.exercises.filter((exercise) => exercise.key !== key),
  }));
}

/**
 * L'exercice `key` déplacé au rang `index` du bloc `blockId`, compté une fois l'exercice retiré
 * de sa place. Un bloc que le déplacement vide disparaît : il n'a plus rien à structurer.
 */
export function movedExercise(
  blocks: readonly SessionBlock[],
  key: string,
  blockId: string,
  index: number,
): SessionBlock[] {
  const from = placeOf(blocks, key);
  const exercise = from == null ? undefined : blocks[from.blockIndex]?.exercises[from.index];
  if (
    from == null ||
    exercise === undefined ||
    index < 0 ||
    !blocks.some((block) => block.id === blockId)
  ) {
    return [...blocks];
  }
  const sourceId = blocks[from.blockIndex]?.id;
  const moved = withBlock(withoutExercise(blocks, key), blockId, (block) => ({
    ...block,
    exercises: inserted(block.exercises, index, exercise),
  }));
  return moved.filter((block) => block.id !== sourceId || block.exercises.length > 0);
}

/**
 * « Sortir en bloc à part » : l'exercice part dans un bloc juste après le sien, sous la même
 * structure, sans libellé. Seul dans son bloc, il y est déjà.
 */
export function detachedExercise(
  blocks: readonly SessionBlock[],
  key: string,
  newBlockId: string,
): SessionBlock[] {
  const from = placeOf(blocks, key);
  const block = from == null ? undefined : blocks[from.blockIndex];
  const exercise = from == null ? undefined : block?.exercises[from.index];
  if (from == null || block === undefined || exercise === undefined) return [...blocks];
  if (block.exercises.length === 1) return [...blocks];
  const alone: SessionBlock = { ...block, id: newBlockId, label: null, exercises: [exercise] };
  return inserted(withoutExercise(blocks, key), from.blockIndex + 1, alone);
}

/** La copie de l'exercice, juste après lui, sous une clé neuve. */
export function duplicatedExercise(
  blocks: readonly SessionBlock[],
  key: string,
  newKey: string,
): SessionBlock[] {
  return blocks.map((block) => {
    const index = block.exercises.findIndex((exercise) => exercise.key === key);
    const exercise = block.exercises[index];
    if (exercise === undefined) return block;
    return {
      ...block,
      exercises: inserted(block.exercises, index + 1, { ...exercise, key: newKey }),
    };
  });
}

/** Ce qui fait d'une colonne la même mesure : sa clé du catalogue, ou la métrique du Coach. */
const measureOf = (metric: GridMetric): string =>
  metric.source === MetricSource.CATALOG
    ? `catalog:${metric.key}`
    : `custom:${metric.customMetricId}`;

/**
 * La grille d'un remplaçant : les colonnes qu'IL suggère. Une colonne de même mesure garde la
 * sienne, unité et valeurs comprises ; les autres partent avec leurs valeurs. Les lignes restent :
 * c'est le nombre de tours que le Coach a posé.
 */
export function replacementGrid(
  grid: BlockGrid,
  exercise: SuggestingExercise,
  newId: (index: number) => string,
): BlockGrid {
  // Chaque colonne gardée ne sert qu'une fois : une mesure en double, d'un côté ou de l'autre,
  // ne doit pas donner deux colonnes du même identifiant.
  const unused = [...grid.metrics];
  const metrics = suggestedColumns(exercise, newId).map((metric) => {
    const rank = unused.findIndex((column) => measureOf(column) === measureOf(metric));
    return rank < 0 ? metric : (unused.splice(rank, 1)[0] ?? metric);
  });
  return withGridMetrics(grid, metrics);
}

/**
 * Un autre exercice à la même place, sous une clé neuve — ce n'est plus le même exercice pour la
 * séance planifiée. Sa grille suit `replacementGrid` ; la note reste.
 */
export function replacedExercise(
  blocks: readonly SessionBlock[],
  key: string,
  exercise: SuggestingExercise,
  newKey: string,
  newId: (index: number) => string,
): SessionBlock[] {
  return withExerciseChange(blocks, key, (current) => ({
    ...current,
    key: newKey,
    exerciseId: exercise.id,
    grid: replacementGrid(current.grid, exercise, newId),
  }));
}

/** La copie du bloc, juste après lui : ses exercices prennent des clés neuves (`newKey()`). */
export function duplicatedBlock(
  blocks: readonly SessionBlock[],
  blockId: string,
  newBlockId: string,
  newKey: () => string,
): SessionBlock[] {
  const index = blocks.findIndex((block) => block.id === blockId);
  const block = blocks[index];
  if (block === undefined) return [...blocks];
  const copy: SessionBlock = {
    ...block,
    id: newBlockId,
    exercises: block.exercises.map((exercise) => ({ ...exercise, key: newKey() })),
  };
  return inserted(blocks, index + 1, copy);
}

// ── La grille d'un exercice de bloc ─────────────────────────────────────────────────────────

export const BlockSlotKind = {
  /** Une ligne propre. */
  ROW: "ROW",
  /** Un tour sans ligne propre : il reprend la dernière, et la grille le montre en fantôme. */
  GHOST: "GHOST",
  /** Une ligne au-delà des tours du bloc : personne ne la jouera, l'enregistrement la retire. */
  BEYOND: "BEYOND",
} as const;
export type BlockSlotKind = TypesValuesOf<typeof BlockSlotKind>;

export type BlockGridSlot =
  | { kind: typeof BlockSlotKind.ROW; index: number; row: GridRow }
  | { kind: typeof BlockSlotKind.GHOST; index: number; source: GridRow | null }
  | { kind: typeof BlockSlotKind.BEYOND; index: number; row: GridRow };

/**
 * Ce que la grille d'un exercice affiche, ligne à ligne : autant de lignes que `limit`
 * (`gridRowLimit`), celles qui n'existent pas en fantôme de la dernière — ce que l'athlète jouera.
 *
 * Le brouillon garde les lignes au-delà de la borne : baisser les tours de 4 à 1 en tapant « 10 »
 * ne doit pas effacer les séries 2 à 4. Elles se montrent comme non jouées, et `fittedBlock` les
 * retire à l'enregistrement.
 */
export function blockGridSlots(rows: readonly GridRow[], limit: number): BlockGridSlot[] {
  const stored: BlockGridSlot[] = rows.map((row, index) =>
    index < limit
      ? { kind: BlockSlotKind.ROW, index, row }
      : { kind: BlockSlotKind.BEYOND, index, row },
  );
  const source = rows.at(-1) ?? null;
  const ghosts: BlockGridSlot[] = Array.from(
    { length: Math.max(limit - rows.length, 0) },
    (_unused, offset) => ({ kind: BlockSlotKind.GHOST, index: rows.length + offset, source }),
  );
  return [...stored, ...ghosts];
}

/** La borne de lignes de chaque exercice du bloc, dans l'ordre. */
export function blockRowLimits(block: Pick<SessionBlock, "settings" | "exercises">): number[] {
  return block.exercises.map((_exercise, index) =>
    gridRowLimit(block.settings, block.exercises.length, index),
  );
}

/**
 * Les lignes qu'enregistrer retirerait : celles au-delà des tours, exercice par exercice. Rien
 * quand « un seul par bip » manque de bips — le bloc est à régler, pas à tailler.
 */
export function rowsBeyond(
  block: Pick<SessionBlock, "settings" | "exercises">,
): { key: string; count: number }[] {
  if (roundsError(block.settings, block.exercises.length) != null) return [];
  const limits = blockRowLimits(block);
  return block.exercises.flatMap((exercise, index) => {
    const count = exercise.grid.rows.length - (limits[index] ?? 0);
    return count > 0 ? [{ key: exercise.key, count }] : [];
  });
}

/** Le bloc tel qu'il s'enregistre : chaque grille taillée à ses tours. */
export function fittedBlock(block: SessionBlock): SessionBlock {
  if (roundsError(block.settings, block.exercises.length) != null) return block;
  const limits = blockRowLimits(block);
  return {
    ...block,
    exercises: block.exercises.map((exercise, index) => ({
      ...exercise,
      grid: { ...exercise.grid, rows: exercise.grid.rows.slice(0, limits[index]) },
    })),
  };
}

/**
 * La grille sous d'autres colonnes. Une colonne retirée emporte ses valeurs : la garder dans les
 * lignes en ferait une valeur orpheline, que le schéma refuse.
 */
export function withGridMetrics(grid: BlockGrid, metrics: readonly GridMetric[]): BlockGrid {
  const kept = new Set(metrics.map((metric) => metric.id));
  return {
    metrics: [...metrics],
    rows: grid.rows.map((row) => ({
      ...row,
      values: Object.fromEntries(
        Object.entries(row.values).filter(([metricId]) => kept.has(metricId)),
      ),
    })),
  };
}

/**
 * Une colonne remplie sur TOUS les tours, fantômes compris : « 8 · 10 · 12 · 14 » sur quatre tours
 * en écrit quatre, même si la grille n'en détaillait qu'un. Les lignes non jouées n'y prennent pas
 * part — un miroir les compterait.
 */
export function filledGridRows(
  rows: readonly GridRow[],
  limit: number,
  metricId: string,
  plan: ColumnFillPlan,
  newId: (index: number) => string,
): GridRow[] {
  const played = withMaterializedSeries(rows.slice(0, limit), limit - 1, newId);
  return [...fillRows(played, metricId, plan), ...rows.slice(limit)];
}

// ── Ce qui reste à régler ───────────────────────────────────────────────────────────────────

export type CompositionIssue = { blockId: string; phrase: Phrase };

/**
 * Ce qui empêche d'enregistrer, bloc par bloc : un bloc sans exercice, « un seul par bip » qui
 * manque de bips, et les bornes de l'API — un bloc trop garni, ou le bloc qui dépasse celles de la
 * séance. Le constructeur les montre au bloc et refuse d'enregistrer, comme l'API.
 */
export function compositionIssues(blocks: readonly SessionBlock[]): CompositionIssue[] {
  let before = 0;
  return blocks.flatMap((block, index) => {
    const phrase = blockIssue(block, index, before);
    before += block.exercises.length;
    return phrase == null ? [] : [{ blockId: block.id, phrase }];
  });
}

/** Ce qui retient le bloc de rang `index`, que précèdent `before` exercices — ou `null`. */
function blockIssue(block: SessionBlock, index: number, before: number): Phrase | null {
  const count = block.exercises.length;
  if (index >= SESSION_MAX_BLOCKS) {
    return { key: "block.issue.tooManyBlocks", params: { count: SESSION_MAX_BLOCKS } };
  }
  if (count === 0) return { key: "block.issue.empty", params: {} };
  if (count > BLOCK_MAX_EXERCISES) {
    return { key: "block.issue.tooManyExercises", params: { count: BLOCK_MAX_EXERCISES } };
  }
  if (before + count > SESSION_MAX_EXERCISES) {
    return { key: "block.issue.sessionFull", params: { count: SESSION_MAX_EXERCISES } };
  }
  return roundsError(block.settings, count);
}
