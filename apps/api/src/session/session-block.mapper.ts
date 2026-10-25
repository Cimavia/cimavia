import {
  CompositionOrigin,
  required,
  type ScheduledSessionBlockDto,
  type SessionBlock,
  type SessionBlockDto,
} from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import {
  parseBlockReference,
  parseBlockTracking,
  parseGrid,
  parseSettings,
} from "../util/block-json.util";

/**
 * Les blocs d'une séance ordonnés, et leurs exercices dans l'ordre du bloc — la même lecture aux
 * deux niveaux. Inclus À TRAVERS la séance, comme ses exercices : la couche d'isolation ne scope
 * pas un `include` imbriqué, et la séance est déjà prouvée lisible.
 */
const BLOCKS_INCLUDE = {
  orderBy: { position: "asc" },
  include: { exercises: { orderBy: { blockPosition: "asc" } } },
} as const;

export const SESSION_BLOCKS_INCLUDE = BLOCKS_INCLUDE satisfies Prisma.Session$blocksArgs;

type BlockRow = Pick<
  Prisma.SessionBlockGetPayload<object>,
  | "id"
  | "name"
  | "label"
  | "instructions"
  | "settings"
  | "copiedSettings"
  | "sourceStructureId"
  | "sourcePreset"
>;

type BlockExerciseRow = {
  id: string;
  key: string | null;
  note: string | null;
  grid: Prisma.JsonValue;
};

/** Ce que le bloc d'une séance-type et celui d'une séance planifiée rendent de la même façon. */
export function toBlockFields(block: BlockRow) {
  return { id: block.id, ...toBlockContent(block) };
}

function toBlockContent(block: BlockRow) {
  return blockContentOf({
    ...block,
    settings: parseSettings(block.settings),
    copiedSettings: parseSettings(block.copiedSettings),
  });
}

/** Le contenu d'un bloc sans son identifiant ni ses exercices : ce qu'une copie reprend. */
export type BlockContent = Pick<
  SessionBlock,
  | "name"
  | "label"
  | "instructions"
  | "settings"
  | "copiedSettings"
  | "sourceStructureId"
  | "sourcePreset"
>;

/** Le seul endroit qui énumère le contenu d'un bloc : la lecture, l'écriture et la copie. */
export function blockContentOf(block: BlockContent): BlockContent {
  return {
    name: block.name,
    label: block.label,
    instructions: block.instructions,
    settings: block.settings,
    copiedSettings: block.copiedSettings,
    sourceStructureId: block.sourceStructureId,
    sourcePreset: block.sourcePreset,
  };
}

/**
 * Un exercice de bloc. Clé et grille sont nulles ensemble avec le bloc (CHECK de la migration) :
 * une ligne rangée dans un bloc les porte toujours.
 */
export function toBlockExerciseFields(row: BlockExerciseRow) {
  return {
    id: row.id,
    key: required(row.key, `[bloc] l'exercice ${row.id} rangé dans un bloc n'a pas de clé`),
    note: row.note,
    grid: parseGrid(required(row.grid, `[bloc] l'exercice ${row.id} n'a pas de grille`)),
  };
}

export function toSessionBlockDto(block: SessionBlockWithExercises): SessionBlockDto {
  return {
    ...toBlockFields(block),
    exercises: block.exercises.map((row) => ({
      ...toBlockExerciseFields(row),
      exerciseId: row.exerciseId,
    })),
  };
}

type SessionBlockWithExercises = Prisma.SessionBlockGetPayload<{
  include: typeof SESSION_BLOCKS_INCLUDE.include;
}>;

/**
 * Ce que la séance planifiée REÇOIT d'un bloc de séance-type à la diffusion (#716) : son contenu,
 * et la référence contre laquelle sa composition et ses valeurs se compteront (`plannedChanges`).
 */
export function receivedBlockOf(block: SessionBlockWithExercises) {
  // Lu une seule fois : le contenu et la référence partagent les mêmes réglages parsés.
  const read = toSessionBlockDto(block);
  return {
    ...blockContentOf(read),
    baseline: {
      settings: read.settings,
      exercises: read.exercises.map(({ key, exerciseId, note, grid }) => ({
        key,
        exerciseId,
        note,
        grid,
      })),
    },
  };
}

export const SCHEDULED_SESSION_BLOCKS_INCLUDE =
  BLOCKS_INCLUDE satisfies Prisma.ScheduledSession$blocksArgs;

type ScheduledBlockExerciseRow = BlockExerciseRow & {
  origin: CompositionOrigin | null;
  replacesKey: string | null;
};

/** L'origine portée par la donnée : la clé remplacée n'existe que pour un remplaçant (CHECK). */
function toOrigin(row: ScheduledBlockExerciseRow) {
  const origin = required(
    row.origin,
    `[bloc] l'exercice ${row.id} rangé dans un bloc sans origine`,
  );
  return origin === CompositionOrigin.REPLACEMENT
    ? {
        kind: origin,
        replacesKey: required(row.replacesKey, `[bloc] le remplaçant ${row.id} sans clé remplacée`),
      }
    : { kind: origin };
}

export function toScheduledSessionBlockDto(
  block: Prisma.ScheduledSessionBlockGetPayload<{
    include: typeof SCHEDULED_SESSION_BLOCKS_INCLUDE.include;
  }>,
): ScheduledSessionBlockDto {
  return {
    ...toBlockFields(block),
    baseline: parseBlockReference(block.baseline),
    tracking: parseBlockTracking(block.tracking),
    exercises: block.exercises.map((row) => ({
      ...toBlockExerciseFields(row),
      origin: toOrigin(row),
    })),
  };
}
