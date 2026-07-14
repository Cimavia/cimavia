import type { ExerciseDto } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { toDocumentDto } from "../infra/storage/document.mapper";
import type { StorageService } from "../infra/storage/storage.service";

// L'exercice avec ses documents (URLs signées à résoudre).
export type ExerciseWithDocuments = Prisma.ExerciseGetPayload<{ include: { documents: true } }>;

export async function toExerciseDto(
  exercise: ExerciseWithDocuments,
  storage: StorageService,
): Promise<ExerciseDto> {
  // Documents ordonnés par ancienneté ; chaque FILE reçoit une URL GET signée.
  const documents = await Promise.all(
    exercise.documents
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((doc) => toDocumentDto(doc, storage)),
  );
  return {
    id: exercise.id,
    coachId: exercise.coachId,
    title: exercise.title,
    description: exercise.description,
    category: exercise.category,
    documents,
    createdAt: exercise.createdAt.toISOString(),
    updatedAt: exercise.updatedAt.toISOString(),
  };
}
