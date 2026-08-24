import type { ExerciseDto } from "@cmv/shared";
import type { Prisma } from "@prisma/client";
import { toDocumentDto } from "../infra/storage/document.mapper";
import type { StorageService } from "../infra/storage/storage.service";
import { parseBlocks, parseInstructions } from "../util/exercise-json.util";

/**
 * Tout ce qu'un `ExerciseDto` demande, en une requête. Un point unique parce que les quatre
 * lectures du service doivent charger EXACTEMENT la même chose : un `include` oublié quelque part
 * ne casse pas la compilation, il rend un DTO amputé à l'exécution.
 */
export const EXERCISE_DETAIL_INCLUDE = {
  documents: true,
  tags: true,
  _count: { select: { sessionExercises: true } },
} satisfies Prisma.ExerciseInclude;

// L'exercice avec ses documents (URLs signées à résoudre), ses tags et son décompte d'usage.
export type ExerciseWithDocuments = Prisma.ExerciseGetPayload<{
  include: typeof EXERCISE_DETAIL_INCLUDE;
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
    // Triés : l'ordre d'insertion n'a aucun sens pour un tag, et une liste stable évite un
    // faux diff à chaque relecture côté client.
    tags: exercise.tags.map((tag) => tag.name).sort(),
    usedInSessionCount: exercise._count.sessionExercises,
    documents,
    createdAt: exercise.createdAt.toISOString(),
    updatedAt: exercise.updatedAt.toISOString(),
  };
}
