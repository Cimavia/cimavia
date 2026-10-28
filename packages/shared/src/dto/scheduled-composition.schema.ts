import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import { expectedVersionSchema } from "./expected-version.schema";
import { PLAN_MAX_WEEKS, scheduledSessionStatusSchema } from "./plan.schema";
import { SESSION_MAX_BLOCKS } from "./session-block.schema";
import { scheduledSessionBlockDtoSchema } from "./session-block-dto.schema";

// La composition d'une séance planifiée, pour les semaines choisies (#720). Le panneau ne règle
// plus que la composition — ajouter, remplacer, retirer un exercice —, et chaque changement
// s'applique aux COPIES de la même séance-type dans le Plan que le Coach coche. Aucun lien n'est
// stocké entre les semaines : un ajout ou un remplaçant porte la même clé dans chacune, et c'est
// par elle qu'on le retrouve (`editInPlace`).

export const CompositionEditKind = {
  ADD: "ADD",
  REPLACE: "REPLACE",
  REMOVE: "REMOVE",
} as const;
export type CompositionEditKind = TypesValuesOf<typeof CompositionEditKind>;

const blockIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(SESSION_MAX_BLOCKS - 1);

/**
 * Un changement de composition, désigné par le bloc (son rang : au niveau planifié, les blocs ne
 * bougent pas) et par des clés, jamais par un identifiant de ligne — il vaut pour toutes les
 * copies, dont les lignes diffèrent.
 *
 * - `ADD` : `exerciseId` en fin de bloc, sous la clé `key` ;
 * - `REPLACE` : `exerciseId` sous la clé `key`, à la place de l'exercice `replacesKey` de la
 *   séance-type ;
 * - `REMOVE` : l'exercice `key` de la séance-type part.
 *
 * La clé d'un ajout ou d'un remplaçant est tirée par le client : neuve pour un nouveau changement,
 * celle qu'il porte déjà quand on l'étend à d'autres semaines. `exerciseId` est `null` quand la
 * source de l'exercice a disparu de la bibliothèque : le changement se défait encore, mais ne
 * s'applique plus nulle part.
 */
export const compositionEditSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal(CompositionEditKind.ADD),
      blockIndex: blockIndexSchema,
      key: z.string().min(1),
      exerciseId: z.string().min(1).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal(CompositionEditKind.REPLACE),
      blockIndex: blockIndexSchema,
      replacesKey: z.string().min(1),
      key: z.string().min(1),
      exerciseId: z.string().min(1).nullable(),
    })
    .strict()
    .refine((edit) => edit.key !== edit.replacesKey, {
      path: ["key"],
      message: "Un remplaçant prend une clé neuve.",
    }),
  z
    .object({
      kind: z.literal(CompositionEditKind.REMOVE),
      blockIndex: blockIndexSchema,
      key: z.string().min(1),
    })
    .strict(),
]);
export type CompositionEdit = z.infer<typeof compositionEditSchema>;

/** Une séance planifiée citée sous la version que le Coach a lue (#604). */
const sessionVersionSchema = z
  .object({ id: z.string().min(1), expectedUpdatedAt: expectedVersionSchema })
  .strict();
export type SessionVersion = z.infer<typeof sessionVersionSchema>;

/** Garde-fou (#297) : une séance-type posée chaque jour de chaque semaine du Plan. */
export const COMPOSITION_MAX_SESSIONS = PLAN_MAX_WEEKS * 7;

/**
 * « Valider » de « Pour quelles semaines ? » : les copies où le changement doit être en place
 * (`apply`), et celles d'où il part (`revert`) — décochées dans la fenêtre rouverte, ou la seule
 * semaine du panneau pour « Revenir à la séance-type ». Une copie où il est déjà en place, ou déjà
 * absent, ne change pas : la fenêtre renvoie ce qu'elle montre.
 */
export const scheduledCompositionInputSchema = z
  .object({
    edit: compositionEditSchema,
    apply: z.array(sessionVersionSchema).max(COMPOSITION_MAX_SESSIONS),
    revert: z.array(sessionVersionSchema).max(COMPOSITION_MAX_SESSIONS),
  })
  .strict()
  .refine((input) => input.apply.length + input.revert.length > 0, {
    message: "Le changement ne vise aucune séance.",
  })
  .refine(
    (input) =>
      input.apply.length === 0 ||
      input.edit.kind === CompositionEditKind.REMOVE ||
      input.edit.exerciseId !== null,
    { path: ["edit", "exerciseId"], message: "Un exercice sans source ne s'applique nulle part." },
  )
  .refine(
    (input) => {
      const ids = [...input.apply, ...input.revert].map((session) => session.id);
      return new Set(ids).size === ids.length;
    },
    { message: "Une séance est citée deux fois." },
  );
export type ScheduledCompositionInput = z.infer<typeof scheduledCompositionInputSchema>;

/**
 * Une copie de la séance-type dans le Plan, telle que la fenêtre et l'étiquette la lisent : sa
 * place, sa version, son statut — une séance débriefée ne se compose plus — et ses blocs. Ni
 * titre ni documents : la copie se nomme par sa semaine.
 */
export const scheduledSessionCopyDtoSchema = z.object({
  id: z.string(),
  planWeekId: z.string(),
  scheduledDate: z.iso.date(),
  updatedAt: z.iso.datetime(),
  status: scheduledSessionStatusSchema,
  blocks: z.array(scheduledSessionBlockDtoSchema),
});
export type ScheduledSessionCopyDto = z.infer<typeof scheduledSessionCopyDtoSchema>;
