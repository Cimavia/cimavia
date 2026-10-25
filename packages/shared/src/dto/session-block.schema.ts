import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import { gridRowLimit, roundsError } from "../util/structure-settings.util";
import { blockGridSchema } from "./block-grid.schema";
import {
  SESSION_MAX_EXERCISES,
  SESSION_NOTE_MAX_LENGTH,
  SESSION_TOO_MANY_EXERCISES_MESSAGE,
} from "./session.schema";
import {
  STRUCTURE_INSTRUCTIONS_MAX_LENGTH,
  STRUCTURE_NAME_MAX_LENGTH,
  type StructureSettings,
  structurePresetKeySchema,
  structureSettingsSchema,
} from "./structure.schema";

// Le bloc de séance (#714, #715) : une structure copiée et 1 à N exercices, chacun avec sa grille.
//
// Le bloc COPIE les réglages, le nom et la consigne de sa structure, sans lien vivant : modifier ou
// supprimer la structure ne touche aucune séance. Il garde son origine, nullable, pour le compteur
// « Séances » de la structure.

/** Garde-fous (#297), pas règles métier : une séance compte quelques blocs, un bloc quelques exercices. */
export const SESSION_MAX_BLOCKS = 30;
export const BLOCK_MAX_EXERCISES = 20;
export const SESSION_BLOCK_LABEL_MAX_LENGTH = 60;

// ── L'exercice de bloc ──────────────────────────────────────────────────────────────────────

/**
 * `key` est STABLE : la séance planifiée la recopie de la séance-type, et c'est par elle que les
 * deux niveaux se comparent (`plannedChanges`). Un même exercice peut figurer deux fois dans un
 * bloc, son `exerciseId` ne suffit donc pas.
 *
 * Pas de code « A1 » : il se déduit de la lettre du bloc et du rang (`exerciseCodes`).
 */
export const sessionBlockExerciseSchema = z
  .object({
    key: z.string().min(1),
    exerciseId: z.string().min(1),
    note: z.string().max(SESSION_NOTE_MAX_LENGTH).nullable(),
    grid: blockGridSchema,
  })
  .strict();
export type SessionBlockExercise = z.infer<typeof sessionBlockExerciseSchema>;

/**
 * D'où vient un exercice de séance planifiée. Portée par la DONNÉE, jamais déduite d'une
 * comparaison (#716) : un exercice reçu et un exercice ajouté qui lui ressemble ne se confondent
 * pas.
 */
export const CompositionOrigin = {
  RECEIVED: "RECEIVED",
  ADDED: "ADDED",
  REPLACEMENT: "REPLACEMENT",
} as const;
export type CompositionOrigin = TypesValuesOf<typeof CompositionOrigin>;

export const compositionOriginSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(CompositionOrigin.RECEIVED) }).strict(),
  z.object({ kind: z.literal(CompositionOrigin.ADDED) }).strict(),
  z
    .object({ kind: z.literal(CompositionOrigin.REPLACEMENT), replacesKey: z.string().min(1) })
    .strict(),
]);

export const scheduledBlockExerciseSchema = sessionBlockExerciseSchema
  .extend({ origin: compositionOriginSchema })
  .strict();
export type ScheduledBlockExercise = z.infer<typeof scheduledBlockExerciseSchema>;

/**
 * La place qu'un exercice planifié occupe dans la référence : la sienne s'il a été reçu, celle
 * qu'il remplace pour un remplaçant. Un ajout n'en a pas, même si sa clé en rappelle une.
 */
export function referencePlaceOf(exercise: Pick<ScheduledBlockExercise, "key" | "origin">) {
  switch (exercise.origin.kind) {
    case CompositionOrigin.RECEIVED:
      return exercise.key;
    case CompositionOrigin.REPLACEMENT:
      return exercise.origin.replacesKey;
    case CompositionOrigin.ADDED:
      return null;
  }
}

// ── Le bloc ─────────────────────────────────────────────────────────────────────────────────

/**
 * - `settings` : les réglages du bloc ; `copiedSettings` : ceux copiés de la structure, que
 *   « Revenir à Séries » restaure et contre lesquels se lit « Personnalisé » (`isCustomized`) ;
 * - `name` : celui de la structure copiée ; `label` : le libellé facultatif du Coach. Sans libellé,
 *   le bloc prend la lettre suivante ;
 * - `instructions` : la consigne pour l'athlète ;
 * - l'origine : une structure prête OU une structure du Coach, ou rien quand elle a été supprimée.
 */
const sessionBlockFields = {
  id: z.string().min(1),
  name: z.string().trim().min(1).max(STRUCTURE_NAME_MAX_LENGTH),
  label: z.string().trim().min(1).max(SESSION_BLOCK_LABEL_MAX_LENGTH).nullable(),
  instructions: z.string().max(STRUCTURE_INSTRUCTIONS_MAX_LENGTH).nullable(),
  settings: structureSettingsSchema,
  copiedSettings: structureSettingsSchema,
  sourceStructureId: z.string().min(1).nullable(),
  sourcePreset: structurePresetKeySchema.nullable(),
};

type BlockLike = {
  settings: StructureSettings;
  sourceStructureId: string | null;
  sourcePreset: string | null;
  exercises: readonly SessionBlockExercise[];
};

function refineBlock(block: BlockLike, context: z.RefinementCtx): void {
  if (block.sourceStructureId != null && block.sourcePreset != null) {
    context.addIssue({
      code: "custom",
      path: ["sourcePreset"],
      message: "Un bloc vient d'une structure prête ou d'une structure du Coach, pas des deux.",
    });
  }
  const exerciseCount = block.exercises.length;
  if (roundsError(block.settings, exerciseCount) != null) {
    context.addIssue({
      code: "custom",
      path: ["settings"],
      message: "« Un seul par… » demande au moins autant de bips ou d'intervalles que d'exercices.",
    });
    // Un exercice qui ne passe jamais n'a pas de borne de lignes à tenir : le refus est déjà dit.
    return;
  }
  block.exercises.forEach((exercise, index) => {
    if (exercise.grid.rows.length > gridRowLimit(block.settings, exerciseCount, index)) {
      context.addIssue({
        code: "custom",
        path: ["exercises", index, "grid", "rows"],
        message: "La grille a plus de lignes que l'exercice n'a de tours ou de passages.",
      });
    }
  });
}

/** Le bloc d'une séance modèle, ou d'une séance planifiée : seul le schéma d'exercice change. */
function blockSchemaOf<E extends z.ZodType<SessionBlockExercise>>(exercise: E) {
  return z
    .object({
      ...sessionBlockFields,
      exercises: z.array(exercise).min(1).max(BLOCK_MAX_EXERCISES),
    })
    .strict()
    .superRefine(refineBlock);
}

export const sessionBlockSchema = blockSchemaOf(sessionBlockExerciseSchema);
export type SessionBlock = z.infer<typeof sessionBlockSchema>;

export const scheduledSessionBlockSchema = blockSchemaOf(scheduledBlockExerciseSchema);
export type ScheduledSessionBlock = z.infer<typeof scheduledSessionBlockSchema>;

// ── Les blocs d'une séance ──────────────────────────────────────────────────────────────────

/** Les clés d'exercice sont uniques dans TOUTE la séance, pas seulement dans leur bloc. */
function refineBlocks(
  blocks: readonly { id: string; exercises: readonly { key: string }[] }[],
  context: z.RefinementCtx,
): void {
  const keys = blocks.flatMap((block) => block.exercises.map((exercise) => exercise.key));
  if (keys.length > SESSION_MAX_EXERCISES) {
    context.addIssue({ code: "custom", message: SESSION_TOO_MANY_EXERCISES_MESSAGE });
  }
  if (new Set(keys).size !== keys.length) {
    context.addIssue({
      code: "custom",
      message: "Deux exercices d'une séance ne peuvent pas partager la même clé.",
    });
  }
  if (new Set(blocks.map((block) => block.id)).size !== blocks.length) {
    context.addIssue({
      code: "custom",
      message: "Deux blocs ne peuvent pas partager le même identifiant.",
    });
  }
}

/**
 * Une place de la référence n'est occupée qu'une fois : un exercice reçu et son remplaçant, ou
 * deux remplaçants du même exercice, se compteraient deux fois (`plannedChanges`).
 */
function refineReferencePlaces(
  blocks: readonly { exercises: readonly Pick<ScheduledBlockExercise, "key" | "origin">[] }[],
  context: z.RefinementCtx,
): void {
  const places = blocks.flatMap((block) =>
    block.exercises.flatMap((exercise) => referencePlaceOf(exercise) ?? []),
  );
  if (new Set(places).size !== places.length) {
    context.addIssue({
      code: "custom",
      message: "Un exercice de la séance-type ne peut être gardé ou remplacé qu'une fois.",
    });
  }
}

const TOO_MANY_BLOCKS = `Une séance ne peut pas dépasser ${SESSION_MAX_BLOCKS} blocs.`;

export const sessionBlocksSchema = z
  .array(sessionBlockSchema)
  .max(SESSION_MAX_BLOCKS, TOO_MANY_BLOCKS)
  .superRefine(refineBlocks);

export const scheduledSessionBlocksSchema = z
  .array(scheduledSessionBlockSchema)
  .max(SESSION_MAX_BLOCKS, TOO_MANY_BLOCKS)
  .superRefine(refineBlocks)
  .superRefine(refineReferencePlaces);
