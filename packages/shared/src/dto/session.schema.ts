import { z } from "zod";
import { exerciseCategorySchema } from "./exercise.schema";

export const SESSION_TITLE_MAX_LENGTH = 200;
export const SESSION_NOTES_MAX_LENGTH = 5000;
export const SESSION_PRESCRIPTION_MAX_LENGTH = 2000;

export const sessionExerciseInputSchema = z
  .object({
    exerciseId: z.string().min(1),
    prescription: z.string().max(SESSION_PRESCRIPTION_MAX_LENGTH).nullable().optional(),
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
  prescription: z.string().nullable(),
  title: z.string(),
  category: exerciseCategorySchema,
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
