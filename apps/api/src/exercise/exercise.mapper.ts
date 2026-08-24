import type { ExerciseDto } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { toDocumentDto } from "../infra/storage/document.mapper";
import type { StorageService } from "../infra/storage/storage.service";
import { parseBlocks, parseInstructions } from "../util/exercise-json.util";

// L'exercice avec ses documents (URLs signées à résoudre).
export type ExerciseWithDocuments = Prisma.ExerciseGetPayload<{
  include: { documents: true; tags: true };
}>;

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
    instructions: parseInstructions(exercise.instructions),
    blocks: parseBlocks(exercise.blocks),
    category: exercise.category,
    // Triés : l'ordre d'insertion n'a aucun sens pour un tag, et une liste stable évite un
    // faux diff à chaque relecture côté client.
    tags: exercise.tags.map((tag) => tag.name).sort(),
    documents,
    createdAt: exercise.createdAt.toISOString(),
    updatedAt: exercise.updatedAt.toISOString(),
  };
}
