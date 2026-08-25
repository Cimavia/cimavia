import { z } from "zod";
import { adjustmentsSchema } from "./dosage-override.schema";
import { exerciseBlocksSchema } from "./exercise-block.schema";

export const SESSION_TITLE_MAX_LENGTH = 200;
export const SESSION_NOTES_MAX_LENGTH = 5000;
/**
 * La NOTE d'un exercice dans une séance : le contexte que la grille ne dit pas. Anciennement
 * « prescription », qui portait le dosage écrit à la main — ce rôle revient à `blocks` (#164).
 */
export const SESSION_NOTE_MAX_LENGTH = 2000;

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
    exercises: z.array(sessionExerciseInputSchema).default([]),
  })
  .strict();
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const updateSessionSchema = z
  .object({
    title: z.string().min(1).max(SESSION_TITLE_MAX_LENGTH),
    notes: z.string().max(SESSION_NOTES_MAX_LENGTH).nullable().optional(),
    exercises: z.array(sessionExerciseInputSchema),
  })
  .strict();
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

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
  // Tags de l'exercice RÉFÉRENCÉ, lus à chaque lecture : une séance modèle pointe vers la
  // bibliothèque, elle n'en fige rien (contrairement à la séance planifiée, qui copie).
  tags: z.array(z.string()),
});
export type SessionExerciseDto = z.infer<typeof sessionExerciseDtoSchema>;

export const sessionDtoSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  exercises: z.array(sessionExerciseDtoSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type SessionDto = z.infer<typeof sessionDtoSchema>;
