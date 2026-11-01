import { z } from "zod";
import {
  accessGrantDtoSchema,
  accessOwnerSchema,
  coachGrantDtoSchema,
  myAccessSchema,
} from "./access.schema";
import { frozenFromSchema } from "./exercise.schema";
import { customMetricSchema } from "./exercise-metric.schema";
import { expectedVersionSchema } from "./expected-version.schema";
import { sessionBlocksSchema } from "./session-block.schema";
import { sessionBlockDtoSchema } from "./session-block-dto.schema";

export const SESSION_TITLE_MAX_LENGTH = 200;
export const SESSION_NOTES_MAX_LENGTH = 5000;
export {
  SESSION_MAX_EXERCISES,
  SESSION_NOTE_MAX_LENGTH,
  SESSION_TOO_MANY_EXERCISES_MESSAGE,
} from "./session-limits.schema";

/** Une séance se compose par blocs (#716) ; absents à la création, elle naît vide. */
export const createSessionSchema = z
  .object({
    title: z.string().min(1).max(SESSION_TITLE_MAX_LENGTH),
    notes: z.string().max(SESSION_NOTES_MAX_LENGTH).nullable().optional(),
    blocks: sessionBlocksSchema.default([]),
  })
  .strict();
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

/** Une édition remplace TOUTE la composition : les blocs y sont requis. */
export const updateSessionSchema = z
  .object({
    title: z.string().min(1).max(SESSION_TITLE_MAX_LENGTH),
    notes: z.string().max(SESSION_NOTES_MAX_LENGTH).nullable().optional(),
    blocks: sessionBlocksSchema,
    expectedUpdatedAt: expectedVersionSchema,
  })
  .strict();
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

/**
 * Ce que le constructeur par blocs enregistre (#719) : titre, note et blocs. Une création comme une
 * édition, la version citée en plus (`expectedUpdatedAt`).
 */
export type SessionBlocksInput = Pick<CreateSessionInput, "title" | "blocks"> & {
  notes: string | null;
};

/**
 * Un exercice de la séance, tel que ses blocs le citent (`exercises[].id` d'un bloc) : ce que la
 * séance en lit, titre et tags, et non son dosage, que porte la grille du bloc.
 */
export const sessionExerciseDtoSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  position: z.number().int(),
  note: z.string().nullable(),
  title: z.string(),
  /**
   * Les métriques maison que la grille de cet exercice cite, chez le propriétaire de l'exercice
   * (#605) : une séance peut composer l'exercice d'un autre Coach, et ses colonnes citent son
   * catalogue.
   */
  customMetrics: z.array(customMetricSchema),
  // Tags de l'exercice RÉFÉRENCÉ, lus à chaque lecture : une séance modèle pointe vers la
  // bibliothèque, elle n'en fige rien (contrairement à la séance planifiée, qui copie).
  tags: z.array(z.string()),
  /**
   * La provenance de l'exercice cité quand c'est une copie figée (#609) : la ligne a perdu
   * l'exercice d'un autre Coach, et en garde la copie. `null` pour un exercice ordinaire.
   */
  frozenFrom: frozenFromSchema.nullable(),
});
export type SessionExerciseDto = z.infer<typeof sessionExerciseDtoSchema>;

export const sessionDtoSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  /** Le propriétaire : seul à supprimer l'élément et à en gérer les accès (#605). */
  owner: accessOwnerSchema,
  /** Ce que l'acteur peut en faire, et l'entreprise qui le lui ouvre. */
  myAccess: myAccessSchema,
  /** Les droits accordés, pour le panneau du propriétaire ; `null` pour tout autre lecteur. */
  grants: z.array(accessGrantDtoSchema).nullable(),
  /** Ceux des Coachs (#608), pour le même panneau ; `null` pour tout autre lecteur. */
  coachGrants: z.array(coachGrantDtoSchema).nullable(),
  title: z.string(),
  notes: z.string().nullable(),
  exercises: z.array(sessionExerciseDtoSchema),
  /** La composition par blocs (#716). */
  blocks: z.array(sessionBlockDtoSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SessionDto = z.infer<typeof sessionDtoSchema>;
