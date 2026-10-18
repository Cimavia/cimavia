import { z } from "zod";
import {
  accessGrantDtoSchema,
  accessOwnerSchema,
  coachGrantDtoSchema,
  myAccessSchema,
} from "./access.schema";
import { adjustmentsSchema } from "./dosage-override.schema";
import { exerciseBlocksSchema } from "./exercise-block.schema";
import { customMetricSchema } from "./exercise-metric.schema";
import { expectedVersionSchema } from "./expected-version.schema";

export const SESSION_TITLE_MAX_LENGTH = 200;
export const SESSION_NOTES_MAX_LENGTH = 5000;
/**
 * La NOTE d'un exercice dans une séance : le contexte que la grille ne dit pas. Anciennement
 * « prescription », qui portait le dosage écrit à la main — ce rôle revient à `blocks` (#164).
 */
export const SESSION_NOTE_MAX_LENGTH = 2000;
/**
 * Garde-fou, pas règle métier (#297) : un Coach compose quelques dizaines d'exercices au plus.
 * Sans lui, un `exerciseId` répété des milliers de fois tenait sous la limite de corps et faisait
 * recopier autant de fois les blocs de l'exercice. Il borne aussi les séances planifiées, et
 * donc le suivi qu'un débrief peut remonter.
 */
export const SESSION_MAX_EXERCISES = 50;
export const SESSION_TOO_MANY_EXERCISES_MESSAGE = `Une séance ne peut pas dépasser ${SESSION_MAX_EXERCISES} exercices.`;

export const sessionExerciseInputSchema = z
  .object({
    /**
     * Présent = ligne DÉJÀ composée : le serveur retrouve sa référence et la conserve. Absent =
     * ajout, et la référence naît d'une copie de l'exercice. Le client ne peut donc jamais forger
     * la référence contre laquelle le verrou est vérifié.
     */
    id: z.string().min(1).optional(),
    exerciseId: z.string().min(1),
    note: z.string().max(SESSION_NOTE_MAX_LENGTH).nullable().optional(),
    /** Absent à l'ajout : le serveur copie le dosage de l'exercice. */
    blocks: exerciseBlocksSchema.optional(),
    adjustments: adjustmentsSchema.optional(),
  })
  .strict();
export type SessionExerciseInput = z.infer<typeof sessionExerciseInputSchema>;

export const createSessionSchema = z
  .object({
    title: z.string().min(1).max(SESSION_TITLE_MAX_LENGTH),
    notes: z.string().max(SESSION_NOTES_MAX_LENGTH).nullable().optional(),
    exercises: z
      .array(sessionExerciseInputSchema)
      .max(SESSION_MAX_EXERCISES, SESSION_TOO_MANY_EXERCISES_MESSAGE)
      .default([]),
  })
  .strict();
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const updateSessionSchema = z
  .object({
    title: z.string().min(1).max(SESSION_TITLE_MAX_LENGTH),
    notes: z.string().max(SESSION_NOTES_MAX_LENGTH).nullable().optional(),
    exercises: z
      .array(sessionExerciseInputSchema)
      .max(SESSION_MAX_EXERCISES, SESSION_TOO_MANY_EXERCISES_MESSAGE),
    expectedUpdatedAt: expectedVersionSchema,
  })
  .strict();
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

/**
 * « Recharger depuis la bibliothèque » écrase une ligne de la composition : il cite la version de
 * la séance comme toute écriture (#604). Sans elle, recharger dans un onglet resté sur une
 * ancienne composition écraserait celle qu'un autre vient d'enregistrer.
 */
export const reloadSessionExerciseSchema = z
  .object({ expectedUpdatedAt: expectedVersionSchema })
  .strict();
export type ReloadSessionExerciseInput = z.infer<typeof reloadSessionExerciseSchema>;

export const sessionExerciseDtoSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  position: z.number().int(),
  note: z.string().nullable(),
  /** Le dosage EFFECTIF de cet exercice dans cette séance. */
  blocks: exerciseBlocksSchema,
  /** Ce dont il part — nécessaire à « Tout réinitialiser » et au marquage. */
  baseline: exerciseBlocksSchema,
  adjustments: adjustmentsSchema,
  title: z.string(),
  /**
   * Les métriques maison que ces blocs citent, chez le propriétaire de l'exercice (#605) : une
   * séance peut composer l'exercice d'un autre Coach, et ses colonnes citent son catalogue.
   */
  customMetrics: z.array(customMetricSchema),
  // Tags de l'exercice RÉFÉRENCÉ, lus à chaque lecture : une séance modèle pointe vers la
  // bibliothèque, elle n'en fige rien (contrairement à la séance planifiée, qui copie).
  tags: z.array(z.string()),
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
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SessionDto = z.infer<typeof sessionDtoSchema>;
