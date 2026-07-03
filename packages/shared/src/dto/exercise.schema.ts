import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";

export const EXERCISE_TITLE_MAX_LENGTH = 200;
export const EXERCISE_DESCRIPTION_MAX_LENGTH = 5000;

export const ExerciseCategory = {
  RENFO: "RENFO",
  GRIMPE: "GRIMPE",
  TECHNIQUE: "TECHNIQUE",
} as const;
export type ExerciseCategory = TypesValuesOf<typeof ExerciseCategory>;

export const exerciseCategorySchema = z.enum(ExerciseCategory);

export const DocumentType = {
  FILE: "FILE",
  LINK: "LINK",
} as const;
export type DocumentType = TypesValuesOf<typeof DocumentType>;

export const documentTypeSchema = z.enum(DocumentType);

export const createExerciseSchema = z
  .object({
    title: z.string().min(1).max(EXERCISE_TITLE_MAX_LENGTH),
    description: z.string().max(EXERCISE_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    category: exerciseCategorySchema,
  })
  .strict();
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const updateExerciseSchema = z
  .object({
    title: z.string().min(1).max(EXERCISE_TITLE_MAX_LENGTH).optional(),
    description: z.string().max(EXERCISE_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    category: exerciseCategorySchema.optional(),
  })
  .strict();
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

export const requestUploadUrlSchema = z
  .object({
    fileName: z.string().min(1),
    mimeType: z.string().min(1),
    size: z.number().int().positive(),
  })
  .strict();
export type RequestUploadUrlInput = z.infer<typeof requestUploadUrlSchema>;

export const uploadUrlDtoSchema = z.object({
  uploadUrl: z.url(),
  storagePath: z.string(),
  expiresIn: z.number().int().positive(),
});
export type UploadUrlDto = z.infer<typeof uploadUrlDtoSchema>;

export const attachDocumentSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal(DocumentType.FILE),
      storagePath: z.string().min(1),
      fileName: z.string().min(1),
      mimeType: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal(DocumentType.LINK),
      url: z.url(),
    })
    .strict(),
]);
export type AttachDocumentInput = z.infer<typeof attachDocumentSchema>;

export const exerciseDocumentDtoSchema = z.object({
  id: z.string(),
  type: documentTypeSchema,
  url: z.url(),
  fileName: z.string().nullable(),
  mimeType: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type ExerciseDocumentDto = z.infer<typeof exerciseDocumentDtoSchema>;

export const exerciseDtoSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: exerciseCategorySchema,
  documents: z.array(exerciseDocumentDtoSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ExerciseDto = z.infer<typeof exerciseDtoSchema>;
