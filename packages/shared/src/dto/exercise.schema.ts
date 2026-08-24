import { z } from "zod";
import type { TypesValuesOf } from "../type/generics.type";
import { exerciseBlocksSchema } from "./exercise-block.schema";
import { richDocumentSchema } from "./rich-document.schema";

export const EXERCISE_TITLE_MAX_LENGTH = 200;
export const EXERCISE_DESCRIPTION_MAX_LENGTH = 5000;

export const EXERCISE_TAG_MAX_LENGTH = 30;
export const EXERCISE_MAX_TAGS = 10;

/**
 * Un tag libre. Remplace l'enum `ExerciseCategory` (RENFO/GRIMPE/TECHNIQUE), retirée en #163 :
 * trois cases fermées ne décrivaient pas un catalogue d'exercices réel.
 *
 * NORMALISÉ à la saisie — coupé et mis en minuscules — pour que « Renfo », « renfo » et « renfo »
 * soient le MÊME tag. Sans ça, l'autocomplétion proposerait trois entrées pour une seule intention
 * et le filtre par tag en raterait deux sur trois.
 */
export const exerciseTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(EXERCISE_TAG_MAX_LENGTH);

/**
 * Les doublons sont REFUSÉS, pas silencieusement fusionnés : après normalisation, envoyer deux
 * fois le même tag est une erreur d'appel, et la contrainte d'unicité en base la refuserait de
 * toute façon — autant la signaler ici, avec un message.
 */
export const exerciseTagsSchema = z
  .array(exerciseTagSchema)
  .max(EXERCISE_MAX_TAGS)
  .refine((tags) => new Set(tags).size === tags.length, {
    message: "Un exercice ne peut pas porter deux fois le même tag.",
  });

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
    // Consigne structurée, remplaçante de `description`. Les deux cohabitent le temps que le
    // constructeur web bascule (#163) — voir dette R-1.
    instructions: richDocumentSchema.nullable().optional(),
    // Absent = aucun bloc, ce qui est un exercice LÉGITIME : un coach peut n'écrire qu'une
    // consigne. Pas de bloc par défaut, qui obligerait ensuite à le supprimer.
    blocks: exerciseBlocksSchema.optional(),
    tags: exerciseTagsSchema.optional(),
  })
  .strict();
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const updateExerciseSchema = z
  .object({
    title: z.string().min(1).max(EXERCISE_TITLE_MAX_LENGTH).optional(),
    description: z.string().max(EXERCISE_DESCRIPTION_MAX_LENGTH).nullable().optional(),
    // `undefined` ne touche à rien, `null` efface la consigne, `[]` vide les blocs — trois
    // intentions distinctes que le service doit pouvoir séparer.
    instructions: richDocumentSchema.nullable().optional(),
    blocks: exerciseBlocksSchema.optional(),
    tags: exerciseTagsSchema.optional(),
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
  instructions: richDocumentSchema.nullable(),
  blocks: exerciseBlocksSchema,
  tags: z.array(z.string()),
  /**
   * Nombre de séances MODÈLES qui référencent cet exercice. Le constructeur s'en sert pour dire au
   * coach ce qu'il touche avant qu'il modifie un exercice partagé.
   *
   * Les séances PLANIFIÉES n'y entrent pas : ce sont des copies autonomes, les modifier n'a aucun
   * effet sur elles (décision structurante P3). Un compteur qui les inclurait mentirait.
   */
  usedInSessionCount: z.number().int().nonnegative(),
  documents: z.array(exerciseDocumentDtoSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ExerciseDto = z.infer<typeof exerciseDtoSchema>;
