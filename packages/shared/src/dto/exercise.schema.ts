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

// Types de documents acceptés (PDF / image — CDC §5.2). Source UNIQUE : la validation
// serveur (schéma ci-dessous) et le contrôle client avant upload s'y réfèrent tous les deux.
export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

export const documentMimeTypeSchema = z.enum(DOCUMENT_MIME_TYPES);

// Plafond de taille d'un document joint (20 Mo) — la vidéo lourde relève du débrief (P4).
export const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;

// Garde de type : permet au client de filtrer un File.type (string) avant l'envoi.
export function isAllowedDocumentMime(mimeType: string): mimeType is DocumentMimeType {
  return (DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType);
}

// Le type MIME et la taille sont contraints ICI → l'API rejette en 400 sans code dédié.
export const requestUploadUrlSchema = z
  .object({
    fileName: z.string().min(1),
    mimeType: documentMimeTypeSchema,
    size: z.number().int().positive().max(MAX_DOCUMENT_SIZE_BYTES),
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
      mimeType: documentMimeTypeSchema,
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
